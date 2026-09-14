"""The pricing sheet and its approval queue.

Admin-only throughout, and for a sharper reason than the rest of the panel:
every response here carries `cost_price`, which is what the shop pays its
suppliers. There is deliberately no storefront view and no shared schema with
`GET /products`.
"""

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Query, status
from pydantic import BaseModel

from app.api.deps import Administrator, DbSession, PageParams, PricingViewer
from app.models.pricing import PriceReviewStatus
from app.schemas.pricing import (
    PriceReviewApplied,
    PriceReviewCreate,
    PriceReviewDecision,
    PriceReviewDetail,
    PriceReviewLineOut,
    PriceReviewLineReview,
    PriceReviewOut,
    PriceSheetRowOut,
)
from app.services import pricing_service

router = APIRouter(prefix="/admin/pricing", tags=["pricing"])


class ReviewPage(BaseModel):
    items: list[PriceReviewOut]
    total: int
    page: int
    size: int
    pages: int


def _line(line, current: dict) -> PriceReviewLineReview:
    """One proposed move, with the live figure beside it.

    Built field by field rather than by dumping and re-splatting the model:
    the parent already carries defaults for `current_*`, so a splat quietly
    collides with them.
    """
    now = current.get(line.variant_id) if line.variant_id else None
    return PriceReviewLineReview(
        id=line.id,
        variant_id=line.variant_id,
        product_name=line.product_name,
        variant_name=line.variant_name,
        sku=line.sku,
        size_ml=line.size_ml,
        from_cost=line.from_cost,
        from_price=line.from_price,
        to_cost=line.to_cost,
        to_price=line.to_price,
        current_cost=now[0] if now else None,
        current_price=now[1] if now else None,
    )


def _detail(review, names: dict, current: dict) -> PriceReviewDetail:
    return PriceReviewDetail(
        id=review.id,
        reference=review.reference,
        status=review.status.value,
        note=review.note,
        review_note=review.review_note,
        proposed_by=names.get(review.proposed_by_id),
        reviewed_by=names.get(review.reviewed_by_id),
        reviewed_at=review.reviewed_at,
        created_at=review.created_at,
        lines=[_line(line, current) for line in review.lines],
    )


def _summary(review, names: dict) -> PriceReviewOut:
    """A queue row. Lines come along because `line_count` is read off them."""
    return PriceReviewOut(
        id=review.id,
        reference=review.reference,
        status=review.status.value,
        note=review.note,
        review_note=review.review_note,
        proposed_by=names.get(review.proposed_by_id),
        reviewed_by=names.get(review.reviewed_by_id),
        reviewed_at=review.reviewed_at,
        created_at=review.created_at,
        lines=[PriceReviewLineOut.model_validate(line) for line in review.lines],
    )


# --- the sheet --------------------------------------------------------------


@router.get("/sheet", response_model=list[PriceSheetRowOut])
async def price_sheet(
    db: DbSession,
    _: PricingViewer,
    search: Annotated[str | None, Query(max_length=100)] = None,
    category_id: uuid.UUID | None = None,
    active_only: bool = True,
    sort: Literal["name", "margin_low", "margin_high", "price_high", "price_low"] = "name",
):
    """Every size, what it costs, what it sells for and the margin between.

    Unpaginated on purpose — see `pricing_service.sheet`.
    """
    rows = await pricing_service.sheet(
        db, search=search, category_id=category_id, active_only=active_only, sort=sort
    )
    return [
        PriceSheetRowOut(
            variant_id=row.variant.id,
            product_id=row.product.id,
            product_name=row.product.name,
            brand=row.product.brand,
            category=row.category_name,
            variant_name=row.variant.name,
            sku=row.variant.sku,
            size_ml=row.variant.size_ml,
            cost_price=row.variant.cost_price,
            price=row.variant.price,
            stock_quantity=row.variant.stock_quantity,
            is_active=row.variant.is_active,
            pending_reference=row.pending_reference,
        )
        for row in rows
    ]


# --- reviews ----------------------------------------------------------------


@router.get("/reviews", response_model=ReviewPage)
async def list_reviews(
    db: DbSession,
    params: PageParams,
    _: PricingViewer,
    status_filter: Annotated[
        Literal["pending", "approved", "rejected"] | None, Query(alias="status")
    ] = None,
):
    reviews, total = await pricing_service.list_reviews(
        db,
        page=params.page,
        size=params.size,
        status=PriceReviewStatus(status_filter) if status_filter else None,
    )
    names = await pricing_service.names_for(db, reviews)
    pages = (total + params.size - 1) // params.size if total else 0
    return ReviewPage(
        items=[_summary(review, names) for review in reviews],
        total=total,
        page=params.page,
        size=params.size,
        pages=pages,
    )


@router.post("/reviews", response_model=PriceReviewDetail, status_code=status.HTTP_201_CREATED)
async def propose_prices(data: PriceReviewCreate, db: DbSession, user: Administrator):
    """Write down a batch of proposed changes. Moves no price.

    Rows identical to what is already set are dropped; a sheet that turns out to
    change nothing is refused rather than filed as an empty review.
    """
    review = await pricing_service.propose(db, data, user)
    names = await pricing_service.names_for(db, [review])
    return _detail(review, names, await pricing_service.current_figures(db, review))


@router.get("/reviews/{review_id}", response_model=PriceReviewDetail)
async def get_review(review_id: uuid.UUID, db: DbSession, _: PricingViewer):
    """One sheet, with the *live* figure beside each proposed one.

    `drifted` on a line means somebody moved that price after the sheet was
    drawn up — the reviewer is shown it before deciding, because approving
    overwrites their change.
    """
    review = await pricing_service.get_review(db, review_id)
    names = await pricing_service.names_for(db, [review])
    return _detail(review, names, await pricing_service.current_figures(db, review))


@router.post("/reviews/{review_id}/approve", response_model=PriceReviewApplied)
async def approve_review(
    review_id: uuid.UUID, data: PriceReviewDecision, db: DbSession, user: Administrator
):
    """Apply the sheet. This is the only thing in the app that moves a price in bulk."""
    applied = await pricing_service.approve(db, review_id, user, data.note)
    names = await pricing_service.names_for(db, [applied.review])
    return PriceReviewApplied(
        review=_detail(
            applied.review, names, await pricing_service.current_figures(db, applied.review)
        ),
        updated=applied.updated,
        skipped=applied.skipped,
    )


@router.post("/reviews/{review_id}/reject", response_model=PriceReviewDetail)
async def reject_review(
    review_id: uuid.UUID, data: PriceReviewDecision, db: DbSession, user: Administrator
):
    review = await pricing_service.reject(db, review_id, user, data.note)
    names = await pricing_service.names_for(db, [review])
    return _detail(review, names, await pricing_service.current_figures(db, review))
