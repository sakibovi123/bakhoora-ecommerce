"""Combos: bundles of whole perfumes sold together at one flat price.

The one idea worth holding on to is that a combo stores no stock and no derived
price. It stores which perfumes are in it, which bottle sizes it is offered at,
and what each of those costs. Everything else — whether it can be sold, how
many could be assembled, what the same bottles would cost separately — is
worked out from the component variants at the moment it is asked for.

That is deliberate. A combo with its own stock column is a second set of books
on the same bottles, and the two drift the first time someone sells an oil on
its own. Reading it live means a combo goes unavailable the minute one of its
oils runs out, without anything having to remember to update it.
"""

import re
import uuid
from collections import defaultdict
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import BusinessRuleError, ConflictError, NotFoundError
from app.models.combo import Combo, ComboItem, ComboSize
from app.models.product import Product, ProductVariant
from app.schemas.combo import (
    ComboComponentOut,
    ComboCreate,
    ComboOut,
    ComboProductOut,
    ComboReorder,
    ComboSizeIn,
    ComboSizeOut,
    ComboUpdate,
    CoverageRow,
    StockCoverage,
)
from app.utils.sizes import combo_size_label, size_label
from app.utils.slug import unique_slug

_LOAD_FULL = (
    selectinload(Combo.items).selectinload(ComboItem.product).selectinload(Product.images),
    selectinload(Combo.sizes),
)

# Why a bottle cannot be counted towards a combo. Phrased for the person
# looking at the builder, because that is the only place they appear.
_NO_SIZE = "not sold in this size"
_OFF_SALE = "this size is switched off"
_PRODUCT_OFF = "the perfume is hidden"
_NO_STOCK = "out of stock"


# --- slugs and SKUs --------------------------------------------------------

async def _slug_taken(db: AsyncSession, slug: str, exclude_id: uuid.UUID | None = None) -> bool:
    stmt = select(Combo.id).where(Combo.slug == slug)
    if exclude_id:
        stmt = stmt.where(Combo.id != exclude_id)
    return await db.scalar(stmt) is not None


async def _sku_taken(db: AsyncSession, sku: str, exclude_id: uuid.UUID | None = None) -> bool:
    stmt = select(ComboSize.id).where(ComboSize.sku == sku)
    if exclude_id:
        stmt = stmt.where(ComboSize.id != exclude_id)
    return await db.scalar(stmt) is not None


async def _generated_sku(db: AsyncSession, slug: str, size_ml: int) -> str:
    """everyday-fresh-5 + 6 -> EVERYDAY-FRESH-5-COMBO-006ML.

    The COMBO infix is what keeps a bundle's SKU readable as a bundle on an
    invoice that also carries single bottles.
    """
    stem = re.sub(r"[^A-Z0-9]+", "-", slug.upper()).strip("-")[:44] or "COMBO"
    base = f"{stem}-COMBO-{size_ml:03d}ML"
    candidate = base
    suffix = 2
    while await _sku_taken(db, candidate):
        candidate = f"{base}-{suffix}"
        suffix += 1
    return candidate


# --- reading ---------------------------------------------------------------

async def _variant_index(
    db: AsyncSession, combos: list[Combo]
) -> dict[tuple[uuid.UUID, int], ProductVariant]:
    """Every bottle of every perfume in these combos, keyed by (product, size).

    One query for the whole page rather than one per combo per size: a list of
    twelve combos at three sizes each would otherwise be thirty-six round trips
    to Supabase to answer a question that is a single IN clause.
    """
    product_ids = {item.product_id for combo in combos for item in combo.items}
    if not product_ids:
        return {}
    rows = await db.scalars(
        select(ProductVariant).where(ProductVariant.product_id.in_(product_ids))
    )
    return {(variant.product_id, variant.size_ml): variant for variant in rows}


def _primary_image(product: Product) -> str | None:
    if not product.images:
        return None
    image = next((i for i in product.images if i.is_primary), product.images[0])
    return image.url


def _component(item: ComboItem, variant: ProductVariant | None) -> ComboComponentOut:
    product = item.product
    reason: str | None = None
    if variant is None:
        reason = _NO_SIZE
    elif not product.is_active:
        reason = _PRODUCT_OFF
    elif not variant.is_active:
        reason = _OFF_SALE
    elif variant.stock_quantity <= 0:
        reason = _NO_STOCK

    return ComboComponentOut(
        product_id=product.id,
        product_name=product.name,
        variant_id=variant.id if variant else None,
        sku=variant.sku if variant else None,
        price=variant.price if variant else None,
        stock_quantity=variant.stock_quantity if variant else 0,
        # A switched-off size option is the combo's own state, not the
        # bottle's, so it is not counted against the oil here — blaming the
        # oils for it would send someone to fix the wrong screen.
        is_available=reason is None,
        reason=reason,
    )


def _serialize_size(
    combo: Combo,
    size: ComboSize,
    index: dict[tuple[uuid.UUID, int], ProductVariant],
) -> ComboSizeOut:
    components = [
        _component(item, index.get((item.product_id, size.size_ml)))
        for item in combo.items
    ]

    # The bundle can only be assembled as many times as its scarcest bottle
    # allows. No components at all means nothing to assemble, not infinity —
    # which is what min() over an empty sequence would have to be told.
    if components and all(c.is_available for c in components):
        max_sets = min(c.stock_quantity for c in components)
    else:
        max_sets = 0

    priced = [c.price for c in components if c.price is not None]
    components_total = sum(priced, Decimal("0.00")) if len(priced) == len(components) else None

    return ComboSizeOut(
        id=size.id,
        size_ml=size.size_ml,
        sku=size.sku,
        price=size.price,
        is_active=size.is_active,
        label=combo_size_label(len(combo.items), size.size_ml),
        components=components,
        max_sets=max_sets,
        is_available=bool(combo.is_active and size.is_active and max_sets > 0),
        components_total=components_total,
        savings=(components_total - size.price) if components_total is not None else None,
    )


def serialize(combo: Combo, index: dict[tuple[uuid.UUID, int], ProductVariant]) -> ComboOut:
    sizes = [_serialize_size(combo, size, index) for size in combo.sizes]
    sellable = [size for size in sizes if size.is_available]
    return ComboOut(
        id=combo.id,
        name=combo.name,
        slug=combo.slug,
        tagline=combo.tagline,
        description=combo.description,
        use_case=combo.use_case,
        occasion=combo.occasion,
        image_url=combo.image_url,
        position=combo.position,
        is_active=combo.is_active,
        is_featured=combo.is_featured,
        products=[
            ComboProductOut(
                product_id=item.product.id,
                name=item.product.name,
                slug=item.product.slug,
                brand=item.product.brand,
                image_url=_primary_image(item.product),
                position=item.position,
                is_active=item.product.is_active,
            )
            for item in combo.items
        ],
        sizes=sizes,
        is_available=bool(sellable),
        # The entry price is the cheapest option a customer could actually buy;
        # falling back to the cheapest listed one keeps a card from printing no
        # price at all while a campaign is out of stock.
        price_from=min(
            (s.price for s in (sellable or sizes)), default=None
        ),
        created_at=combo.created_at,
        updated_at=combo.updated_at,
    )


async def list_combos(
    db: AsyncSession,
    *,
    search: str | None = None,
    include_inactive: bool = False,
    is_active: bool | None = None,
    featured: bool | None = None,
) -> list[ComboOut]:
    stmt = select(Combo).options(*_LOAD_FULL).order_by(Combo.position, Combo.name)

    if is_active is not None:
        stmt = stmt.where(Combo.is_active.is_(is_active))
    elif not include_inactive:
        stmt = stmt.where(Combo.is_active.is_(True))
    if featured is not None:
        stmt = stmt.where(Combo.is_featured.is_(featured))
    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(Combo.name.ilike(term), Combo.use_case.ilike(term), Combo.tagline.ilike(term))
        )

    combos = list((await db.scalars(stmt)).unique())
    index = await _variant_index(db, combos)
    return [serialize(combo, index) for combo in combos]


async def _get(db: AsyncSession, combo_id: uuid.UUID) -> Combo:
    combo = await db.scalar(
        select(Combo)
        .where(Combo.id == combo_id)
        .options(*_LOAD_FULL)
        # Writers read their own work back through here, and sessions do not
        # expire on commit — without this the items would come back in append
        # order rather than by position.
        .execution_options(populate_existing=True)
    )
    if combo is None:
        raise NotFoundError("Combo not found")
    return combo


async def get_by_id(db: AsyncSession, combo_id: uuid.UUID) -> ComboOut:
    combo = await _get(db, combo_id)
    return serialize(combo, await _variant_index(db, [combo]))


async def get_by_slug(db: AsyncSession, slug: str) -> ComboOut:
    combo = await db.scalar(select(Combo).where(Combo.slug == slug).options(*_LOAD_FULL))
    if combo is None:
        raise NotFoundError("Combo not found")
    return serialize(combo, await _variant_index(db, [combo]))


# --- writing ---------------------------------------------------------------

async def _load_products(db: AsyncSession, ids: list[uuid.UUID]) -> dict[uuid.UUID, Product]:
    rows = await db.scalars(select(Product).where(Product.id.in_(ids)))
    products = {product.id: product for product in rows}
    missing = [pid for pid in ids if pid not in products]
    if missing:
        raise NotFoundError(
            f"{len(missing)} of the perfumes in this combo no longer exist in the catalogue"
        )
    return products


async def _apply_products(db: AsyncSession, combo: Combo, product_ids: list[uuid.UUID]) -> None:
    """Replace the contents, keeping the caller's order as the display order."""
    await _load_products(db, product_ids)
    combo.items = [
        ComboItem(product_id=product_id, position=position)
        for position, product_id in enumerate(product_ids)
    ]


async def _apply_sizes(db: AsyncSession, combo: Combo, wanted: list[ComboSizeIn]) -> None:
    """Reconcile the size options by `size_ml`, not by wiping and re-adding.

    A size that survives an edit keeps its row, and therefore its id — which
    matters because baskets and order lines point at it. Re-creating the row
    would empty every basket holding this combo every time a price is corrected.
    """
    existing = {size.size_ml: size for size in combo.sizes}
    keep: list[ComboSize] = []

    for entry in wanted:
        current = existing.get(entry.size_ml)
        if current is not None:
            if entry.sku and entry.sku != current.sku:
                if await _sku_taken(db, entry.sku, current.id):
                    raise ConflictError(f"SKU '{entry.sku}' already exists")
                current.sku = entry.sku
            current.price = entry.price
            current.is_active = entry.is_active
            keep.append(current)
            continue

        if entry.sku and await _sku_taken(db, entry.sku):
            raise ConflictError(f"SKU '{entry.sku}' already exists")
        keep.append(
            ComboSize(
                size_ml=entry.size_ml,
                sku=entry.sku or await _generated_sku(db, combo.slug, entry.size_ml),
                price=entry.price,
                is_active=entry.is_active,
            )
        )

    # Assigning the collection is what deletes the dropped rows, via
    # delete-orphan on the relationship.
    combo.sizes = keep


async def create(db: AsyncSession, data: ComboCreate) -> ComboOut:
    slug = data.slug or await unique_slug(data.name, lambda s: _slug_taken(db, s))
    if await _slug_taken(db, slug):
        raise ConflictError(f"Slug '{slug}' is already used")

    combo = Combo(
        **data.model_dump(exclude={"slug", "products", "sizes"}),
        slug=slug,
    )
    await _apply_products(db, combo, data.products)
    await _apply_sizes(db, combo, data.sizes)
    db.add(combo)
    await db.commit()
    return await get_by_id(db, combo.id)


async def update(db: AsyncSession, combo_id: uuid.UUID, data: ComboUpdate) -> ComboOut:
    combo = await _get(db, combo_id)
    values = data.model_dump(exclude_unset=True)
    products = values.pop("products", None)
    sizes = values.pop("sizes", None)

    if values.get("slug") and await _slug_taken(db, values["slug"], combo_id):
        raise ConflictError(f"Slug '{values['slug']}' is already used")

    for field, value in values.items():
        setattr(combo, field, value)
    if products is not None:
        await _apply_products(db, combo, products)
    if sizes is not None:
        await _apply_sizes(db, combo, [ComboSizeIn(**entry) for entry in sizes])

    await db.commit()
    return await get_by_id(db, combo_id)


async def reorder(db: AsyncSession, data: ComboReorder) -> list[ComboOut]:
    rows = await db.scalars(
        select(Combo).where(Combo.id.in_([entry.id for entry in data.items]))
    )
    by_id = {combo.id: combo for combo in rows}
    for entry in data.items:
        combo = by_id.get(entry.id)
        if combo is not None:
            combo.position = entry.position
    await db.commit()
    return await list_combos(db, include_inactive=True)


async def delete(db: AsyncSession, combo_id: uuid.UUID) -> None:
    """Remove a campaign. Orders it produced keep their lines and their money.

    `order_items.combo_id` is SET NULL and every name, size and price on those
    lines was snapshotted when they were placed, so deleting a finished campaign
    takes nothing out of the books.
    """
    combo = await _get(db, combo_id)
    await db.delete(combo)
    await db.commit()


# --- selling ---------------------------------------------------------------

async def get_size(db: AsyncSession, combo_size_id: uuid.UUID) -> ComboSize:
    size = await db.scalar(
        select(ComboSize)
        .where(ComboSize.id == combo_size_id)
        .options(selectinload(ComboSize.combo).selectinload(Combo.items).selectinload(
            ComboItem.product
        ))
    )
    if size is None:
        raise NotFoundError("This combo option is not available")
    return size


async def resolve_bottles(
    db: AsyncSession, size: ComboSize, *, lock: bool = False
) -> list[tuple[ComboItem, ProductVariant]]:
    """The actual bottles behind one combo option, in campaign order.

    `lock` takes the same row-level lock checkout takes on a single variant, so
    a combo reserves its five bottles under exactly the rules one bottle is
    reserved under — two people buying the last combo cannot both win.

    Raises rather than returning a partial list: a combo missing a bottle is not
    a combo, and letting it through would sell a five-oil bundle as four.
    """
    combo = size.combo
    product_ids = [item.product_id for item in combo.items]
    stmt = select(ProductVariant).where(
        ProductVariant.product_id.in_(product_ids),
        ProductVariant.size_ml == size.size_ml,
    )
    if lock:
        stmt = stmt.with_for_update()
    variants = {v.product_id: v for v in await db.scalars(stmt)}

    resolved: list[tuple[ComboItem, ProductVariant]] = []
    for item in combo.items:
        variant = variants.get(item.product_id)
        if variant is None:
            raise BusinessRuleError(
                f"{item.product.name} is not sold in {size_label(size.size_ml)}, "
                f"so “{combo.name}” cannot be made up at that size"
            )
        resolved.append((item, variant))
    return resolved


# --- stock coverage --------------------------------------------------------

async def stock_coverage(db: AsyncSession, *, include_inactive: bool = True) -> StockCoverage:
    """How much of the campaign leans on each perfume.

    The Stock Coverage sheet, read off live inventory: an oil carried by six of
    twelve combos is what the campaign is really trying to move, and an oil in
    none of them is what it forgot. `lowest_stock` is the smallest stock across
    the sizes that combo actually offers, because that is the figure that caps
    how many bundles can ship — a perfume with 200 bottles at 30ml and none at
    6ml is out of stock as far as a 6ml combo is concerned.
    """
    stmt = select(Combo).options(*_LOAD_FULL).order_by(Combo.position, Combo.name)
    if not include_inactive:
        stmt = stmt.where(Combo.is_active.is_(True))
    combos = list((await db.scalars(stmt)).unique())
    index = await _variant_index(db, combos)

    total = len(combos)
    names: dict[uuid.UUID, list[str]] = defaultdict(list)
    stocks: dict[uuid.UUID, list[int]] = defaultdict(list)
    products: dict[uuid.UUID, Product] = {}

    for combo in combos:
        for item in combo.items:
            products[item.product_id] = item.product
            names[item.product_id].append(combo.name)
            for size in combo.sizes:
                variant = index.get((item.product_id, size.size_ml))
                stocks[item.product_id].append(variant.stock_quantity if variant else 0)

    def row(product: Product, included: list[str], stock: list[int]) -> CoverageRow:
        return CoverageRow(
            product_id=product.id,
            product_name=product.name,
            brand=product.brand,
            times_included=len(included),
            coverage_pct=round(len(included) / total * 100, 1) if total else 0.0,
            combo_names=included,
            lowest_stock=min(stock) if stock else None,
        )

    rows = [row(products[pid], names[pid], stocks[pid]) for pid in products]
    # Busiest first, then alphabetical so the tail is stable between refreshes.
    rows.sort(key=lambda r: (-r.times_included, r.product_name.lower()))

    uncovered_rows = await db.scalars(
        select(Product)
        .where(Product.is_active.is_(True), Product.id.notin_(list(products)))
        .order_by(Product.name)
    )
    uncovered = [
        CoverageRow(
            product_id=product.id,
            product_name=product.name,
            brand=product.brand,
            times_included=0,
            coverage_pct=0.0,
            combo_names=[],
            lowest_stock=None,
        )
        for product in uncovered_rows
    ]

    return StockCoverage(total_combos=total, rows=rows, uncovered=uncovered)


async def combos_using(db: AsyncSession, product_id: uuid.UUID) -> list[str]:
    """Names of the combos a perfume is in. Used to refuse deleting it."""
    rows = await db.scalars(
        select(Combo.name)
        .join(ComboItem, ComboItem.combo_id == Combo.id)
        .where(ComboItem.product_id == product_id)
        .order_by(Combo.name)
    )
    return list(rows)


async def count(db: AsyncSession, *, active_only: bool = False) -> int:
    stmt = select(func.count()).select_from(Combo)
    if active_only:
        stmt = stmt.where(Combo.is_active.is_(True))
    return await db.scalar(stmt) or 0
