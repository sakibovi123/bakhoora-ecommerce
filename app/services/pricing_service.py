"""The price sheet, and the reviews that change it.

Nothing here writes to `product_variants` except `approve`. That is the whole
design: a proposal is a row in `price_reviews`, and a price on the storefront
only moves when somebody decides it should.
"""

import secrets
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Literal, NamedTuple

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import BusinessRuleError, ConflictError, NotFoundError
from app.models.category import Category
from app.models.pricing import PriceReview, PriceReviewLine, PriceReviewStatus
from app.models.product import Product, ProductVariant
from app.models.user import User
from app.schemas.pricing import PriceReviewCreate

SortKey = Literal["name", "margin_low", "margin_high", "price_high", "price_low"]


def _reference() -> str:
    """Human-sized and unguessable enough not to collide. Like an order number."""
    return f"PR-{datetime.now(UTC):%y%m%d}-{secrets.token_hex(3).upper()}"


# --- the sheet --------------------------------------------------------------


class SheetRow(NamedTuple):
    variant: ProductVariant
    product: Product
    category_name: str | None
    pending_reference: str | None


def _sheet_query(
    *, search: str | None, category_id: uuid.UUID | None, active_only: bool
) -> Select:
    stmt = (
        select(ProductVariant, Product, Category.name)
        .join(Product, Product.id == ProductVariant.product_id)
        .outerjoin(Category, Category.id == Product.category_id)
    )
    if active_only:
        stmt = stmt.where(ProductVariant.is_active.is_(True), Product.is_active.is_(True))
    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            Product.name.ilike(term)
            | Product.brand.ilike(term)
            | ProductVariant.sku.ilike(term)
        )
    if category_id is not None:
        stmt = stmt.where(Product.category_id == category_id)
    return stmt


async def sheet(
    db: AsyncSession,
    *,
    search: str | None = None,
    category_id: uuid.UUID | None = None,
    active_only: bool = True,
    sort: SortKey = "name",
) -> list[SheetRow]:
    """Every variant, with what it costs and what it sells for.

    Returned whole rather than paginated. This is a spreadsheet: the operator
    scans it, edits a handful of rows and submits, and a page boundary in the
    middle of that is how half an intended change gets lost. The catalogue is a
    few hundred rows at the outside.
    """
    stmt = _sheet_query(search=search, category_id=category_id, active_only=active_only)

    margin = ProductVariant.price - func.coalesce(ProductVariant.cost_price, 0)
    orders = {
        "name": (Product.name.asc(), ProductVariant.size_ml.asc()),
        # NULLS LAST on both: an unknown cost is not the worst margin in the
        # shop, it is an unanswered question, and floating it to the top of a
        # "worst first" list would bury the rows that genuinely need attention.
        "margin_low": (margin.asc().nullslast(), Product.name.asc()),
        "margin_high": (margin.desc().nullslast(), Product.name.asc()),
        "price_high": (ProductVariant.price.desc(), Product.name.asc()),
        "price_low": (ProductVariant.price.asc(), Product.name.asc()),
    }[sort]

    rows = (await db.execute(stmt.order_by(*orders))).all()

    # Which of these are already inside an undecided review. One query rather
    # than one per row.
    pending = dict(
        (
            await db.execute(
                select(PriceReviewLine.variant_id, PriceReview.reference)
                .join(PriceReview, PriceReview.id == PriceReviewLine.review_id)
                .where(PriceReview.status == PriceReviewStatus.PENDING)
            )
        ).all()
    )

    return [
        SheetRow(
            variant=variant,
            product=product,
            category_name=category_name,
            pending_reference=pending.get(variant.id),
        )
        for variant, product, category_name in rows
    ]


# --- reviews ----------------------------------------------------------------


async def get_review(db: AsyncSession, review_id: uuid.UUID) -> PriceReview:
    review = await db.scalar(
        select(PriceReview)
        .options(selectinload(PriceReview.lines))
        .where(PriceReview.id == review_id)
        .execution_options(populate_existing=True)
    )
    if review is None:
        raise NotFoundError("Price review not found")
    return review


async def list_reviews(
    db: AsyncSession,
    *,
    page: int = 1,
    size: int = 20,
    status: PriceReviewStatus | None = None,
) -> tuple[list[PriceReview], int]:
    stmt = select(PriceReview).options(selectinload(PriceReview.lines))
    if status is not None:
        stmt = stmt.where(PriceReview.status == status)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = await db.scalars(
        stmt.order_by(PriceReview.created_at.desc()).offset((page - 1) * size).limit(size)
    )
    return list(rows), total


async def names_for(db: AsyncSession, reviews: list[PriceReview]) -> dict[uuid.UUID, str]:
    """Who proposed and who decided, resolved in one query for a whole page."""
    ids = {
        person
        for review in reviews
        for person in (review.proposed_by_id, review.reviewed_by_id)
        if person is not None
    }
    if not ids:
        return {}
    rows = (
        await db.execute(select(User.id, User.full_name, User.email).where(User.id.in_(ids)))
    ).all()
    return {row.id: row.full_name or row.email for row in rows}


async def propose(
    db: AsyncSession, data: PriceReviewCreate, proposer: User
) -> PriceReview:
    """Write the sheet down. Touches no price.

    Rows whose figures are unchanged are dropped rather than refused: the panel
    sends what the operator edited, and an edit typed and then typed back is not
    a change. A proposal that ends up empty is an error, because submitting
    nothing at all is a mistake worth naming.
    """
    wanted = {line.variant_id: line for line in data.lines}
    found = (
        await db.execute(
            select(ProductVariant, Product)
            .join(Product, Product.id == ProductVariant.product_id)
            .where(ProductVariant.id.in_(wanted))
        )
    ).all()

    missing = wanted.keys() - {variant.id for variant, _ in found}
    if missing:
        raise NotFoundError(f"{len(missing)} of these sizes no longer exist")

    lines: list[PriceReviewLine] = []
    for variant, product in found:
        wants = wanted[variant.id]
        if wants.price == variant.price and wants.cost_price == variant.cost_price:
            continue
        lines.append(
            PriceReviewLine(
                variant_id=variant.id,
                product_name=product.name,
                variant_name=variant.name,
                sku=variant.sku,
                size_ml=variant.size_ml,
                from_cost=variant.cost_price,
                from_price=variant.price,
                to_cost=wants.cost_price,
                to_price=wants.price,
            )
        )

    if not lines:
        raise BusinessRuleError(
            "Nothing on this sheet is different from the prices already set."
        )

    review = PriceReview(
        reference=_reference(),
        status=PriceReviewStatus.PENDING,
        note=data.note,
        proposed_by_id=proposer.id,
        lines=lines,
    )
    db.add(review)
    await db.commit()
    return await get_review(db, review.id)


class Applied(NamedTuple):
    review: PriceReview
    updated: int
    skipped: list[str]


async def approve(
    db: AsyncSession,
    review_id: uuid.UUID,
    reviewer: User,
    note: str | None,
) -> Applied:
    """Apply the sheet to the catalogue.

    The proposed figures are written as proposed, even where the live price has
    moved since — that movement is shown to the reviewer before they press the
    button, and overriding it is the decision they are taking. What is not
    silently swallowed is a variant that has been deleted meanwhile: there is
    nothing to write to, so it is skipped and named in the result.
    """
    review = await get_review(db, review_id)
    if review.is_decided:
        raise ConflictError(
            f"{review.reference} was already {review.status.value}. "
            f"Draw up a new sheet instead."
        )

    targets = [line.variant_id for line in review.lines if line.variant_id]
    live = {
        variant.id: variant
        for variant in await db.scalars(
            select(ProductVariant)
            .where(ProductVariant.id.in_(targets))
            .with_for_update()
        )
    }

    updated = 0
    skipped: list[str] = []
    for line in review.lines:
        variant = live.get(line.variant_id) if line.variant_id else None
        if variant is None:
            skipped.append(f"{line.product_name} {line.variant_name}")
            continue
        variant.price = line.to_price
        variant.cost_price = line.to_cost
        updated += 1

    review.status = PriceReviewStatus.APPROVED
    review.reviewed_by_id = reviewer.id
    review.reviewed_at = datetime.now(UTC)
    review.review_note = note
    await db.commit()
    return Applied(review=await get_review(db, review_id), updated=updated, skipped=skipped)


async def reject(
    db: AsyncSession, review_id: uuid.UUID, reviewer: User, note: str | None
) -> PriceReview:
    review = await get_review(db, review_id)
    if review.is_decided:
        raise ConflictError(
            f"{review.reference} was already {review.status.value}."
        )
    review.status = PriceReviewStatus.REJECTED
    review.reviewed_by_id = reviewer.id
    review.reviewed_at = datetime.now(UTC)
    review.review_note = note
    await db.commit()
    return await get_review(db, review_id)


async def current_figures(
    db: AsyncSession, review: PriceReview
) -> dict[uuid.UUID, tuple[Decimal | None, Decimal]]:
    """What the catalogue says right now, for every line on a review.

    The reviewer compares this against `from_price` to see whether anyone moved
    a price since the sheet was drawn up.
    """
    ids = [line.variant_id for line in review.lines if line.variant_id]
    if not ids:
        return {}
    rows = (
        await db.execute(
            select(ProductVariant.id, ProductVariant.cost_price, ProductVariant.price).where(
                ProductVariant.id.in_(ids)
            )
        )
    ).all()
    return {row.id: (row.cost_price, row.price) for row in rows}
