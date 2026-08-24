import re
import uuid
from decimal import Decimal
from typing import Literal

from fastapi import UploadFile
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.core.config import settings
from app.core.exceptions import BusinessRuleError, ConflictError, NotFoundError
from app.models.category import Category
from app.models.product import Product, ProductImage, ProductVariant
from app.schemas.product import (
    ImageCreate,
    ImageUpdate,
    ProductCreate,
    ProductUpdate,
    VariantCreate,
    VariantUpdate,
)
from app.utils.sizes import DEFAULT_VARIANT_SIZES_ML, size_label, size_list
from app.utils.slug import unique_slug
from app.utils.uploads import delete_stored, save_image

SortKey = Literal["newest", "oldest", "name", "price_asc", "price_desc"]

_LOAD_FULL = (
    selectinload(Product.variants),
    selectinload(Product.images),
    joinedload(Product.category),
)

# Correlated subquery: the cheapest active variant of each product.
_MIN_PRICE = (
    select(func.min(ProductVariant.price))
    .where(
        ProductVariant.product_id == Product.id,
        ProductVariant.is_active.is_(True),
    )
    .correlate(Product)
    .scalar_subquery()
)


async def _slug_taken(db: AsyncSession, slug: str, exclude_id: uuid.UUID | None = None) -> bool:
    stmt = select(Product.id).where(Product.slug == slug)
    if exclude_id:
        stmt = stmt.where(Product.id != exclude_id)
    return await db.scalar(stmt) is not None


async def _sku_taken(db: AsyncSession, sku: str, exclude_id: uuid.UUID | None = None) -> bool:
    stmt = select(ProductVariant.id).where(ProductVariant.sku == sku)
    if exclude_id:
        stmt = stmt.where(ProductVariant.id != exclude_id)
    return await db.scalar(stmt) is not None


def _sku_stem(slug: str, size_ml: int) -> str:
    """ROYAL-OUD-INTENSE + 6 -> ROYAL-OUD-INTENSE-006ML."""
    stem = re.sub(r"[^A-Z0-9]+", "-", slug.upper()).strip("-")[:52] or "ITEM"
    return f"{stem}-{size_ml:03d}ML"


async def _generated_sku(db: AsyncSession, slug: str, size_ml: int) -> str:
    base = _sku_stem(slug, size_ml)
    candidate = base
    suffix = 2
    while await _sku_taken(db, candidate):
        candidate = f"{base}-{suffix}"
        suffix += 1
    return candidate


def _build_variant(data: VariantCreate, sku: str, **extra: object) -> ProductVariant:
    """Size is the input; the label is always derived so the two cannot drift."""
    return ProductVariant(
        **data.model_dump(exclude={"sku"}),
        sku=sku,
        name=size_label(data.size_ml),
        **extra,
    )


async def list_products(
    db: AsyncSession,
    *,
    page: int = 1,
    size: int = 20,
    search: str | None = None,
    category_slug: str | None = None,
    brand: str | None = None,
    min_price: Decimal | None = None,
    max_price: Decimal | None = None,
    featured: bool | None = None,
    in_stock: bool | None = None,
    sort: SortKey = "newest",
    include_inactive: bool = False,
    is_active: bool | None = None,
    low_stock: bool = False,
) -> tuple[list[Product], int]:
    stmt = select(Product)

    if is_active is not None:
        # Explicit filter — the admin panel uses it to isolate hidden products.
        stmt = stmt.where(Product.is_active.is_(is_active))
    elif not include_inactive:
        stmt = stmt.where(Product.is_active.is_(True))
    if category_slug:
        stmt = stmt.join(Category, Product.category_id == Category.id).where(
            Category.slug == category_slug
        )
    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Product.name.ilike(term),
                Product.brand.ilike(term),
                Product.short_description.ilike(term),
            )
        )
    if brand:
        stmt = stmt.where(Product.brand.ilike(brand))
    if min_price is not None:
        stmt = stmt.where(_MIN_PRICE >= min_price)
    if max_price is not None:
        stmt = stmt.where(_MIN_PRICE <= max_price)
    if featured is not None:
        stmt = stmt.where(Product.is_featured.is_(featured))
    if in_stock:
        stmt = stmt.where(
            select(ProductVariant.id)
            .where(
                ProductVariant.product_id == Product.id,
                ProductVariant.is_active.is_(True),
                ProductVariant.stock_quantity > 0,
            )
            .exists()
        )
    if low_stock:
        stmt = stmt.where(
            select(ProductVariant.id)
            .where(
                ProductVariant.product_id == Product.id,
                ProductVariant.is_active.is_(True),
                ProductVariant.stock_quantity <= settings.LOW_STOCK_THRESHOLD,
            )
            .exists()
        )

    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0

    order_by = {
        "newest": Product.created_at.desc(),
        "oldest": Product.created_at.asc(),
        "name": Product.name.asc(),
        "price_asc": _MIN_PRICE.asc(),
        "price_desc": _MIN_PRICE.desc(),
    }[sort]

    stmt = (
        stmt.options(*_LOAD_FULL)
        .order_by(order_by)
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    return list(result.unique().scalars().all()), total


async def get_by_id(db: AsyncSession, product_id: uuid.UUID) -> Product:
    # Writers call this to read their own work back. Sessions do not expire on
    # commit, so without populate_existing the variants collection would come
    # back in the order it was appended rather than sorted by size.
    product = await db.scalar(
        select(Product)
        .where(Product.id == product_id)
        .options(*_LOAD_FULL)
        .execution_options(populate_existing=True)
    )
    if product is None:
        raise NotFoundError("Product not found")
    return product


async def get_by_slug(db: AsyncSession, slug: str) -> Product:
    product = await db.scalar(select(Product).where(Product.slug == slug).options(*_LOAD_FULL))
    if product is None:
        raise NotFoundError("Product not found")
    return product


def _normalise_images(images: list[ImageCreate]) -> list[ProductImage]:
    rows = [ProductImage(**image.model_dump()) for image in images]
    if rows and not any(row.is_primary for row in rows):
        rows[0].is_primary = True
    return rows


async def create(db: AsyncSession, data: ProductCreate) -> Product:
    slug = data.slug or await unique_slug(data.name, lambda s: _slug_taken(db, s))
    if await _slug_taken(db, slug):
        raise ConflictError(f"Slug '{slug}' is already used")

    # The schema guarantees the standard sizes are present and unique; only the
    # SKUs the caller supplied by hand can clash.
    explicit = [v.sku for v in data.variants if v.sku]
    if len(set(explicit)) != len(explicit):
        raise ConflictError("Duplicate SKU inside the payload")
    for sku in explicit:
        if await _sku_taken(db, sku):
            raise ConflictError(f"SKU '{sku}' already exists")

    product = Product(
        **data.model_dump(exclude={"slug", "variants", "images"}),
        slug=slug,
    )
    product.variants = [
        _build_variant(variant, variant.sku or await _generated_sku(db, slug, variant.size_ml))
        for variant in data.variants
    ]
    product.images = _normalise_images(data.images)
    db.add(product)
    await db.commit()
    return await get_by_id(db, product.id)


async def update(db: AsyncSession, product_id: uuid.UUID, data: ProductUpdate) -> Product:
    product = await get_by_id(db, product_id)
    values = data.model_dump(exclude_unset=True)
    if values.get("slug") and await _slug_taken(db, values["slug"], product_id):
        raise ConflictError(f"Slug '{values['slug']}' is already used")
    for field, value in values.items():
        setattr(product, field, value)
    await db.commit()
    return await get_by_id(db, product_id)


async def delete(db: AsyncSession, product_id: uuid.UUID) -> None:
    product = await get_by_id(db, product_id)
    # The rows cascade, the files do not — collect them before the product goes.
    uploaded = [image.url for image in product.images]
    await db.delete(product)
    await db.commit()
    for url in uploaded:
        delete_stored(url)


# --- variants --------------------------------------------------------------

async def get_variant(db: AsyncSession, variant_id: uuid.UUID) -> ProductVariant:
    variant = await db.get(ProductVariant, variant_id)
    if variant is None:
        raise NotFoundError("Variant not found")
    return variant


async def _size_taken(
    db: AsyncSession, product_id: uuid.UUID, size_ml: int, exclude_id: uuid.UUID | None = None
) -> bool:
    stmt = select(ProductVariant.id).where(
        ProductVariant.product_id == product_id,
        ProductVariant.size_ml == size_ml,
    )
    if exclude_id:
        stmt = stmt.where(ProductVariant.id != exclude_id)
    return await db.scalar(stmt) is not None


async def add_variant(db: AsyncSession, product_id: uuid.UUID, data: VariantCreate) -> Product:
    """Add a size beyond the standard four, e.g. a 50ml or a 250ml mist."""
    product = await get_by_id(db, product_id)
    if await _size_taken(db, product_id, data.size_ml):
        raise ConflictError(f"{size_label(data.size_ml)} already exists for this product")
    if data.sku and await _sku_taken(db, data.sku):
        raise ConflictError(f"SKU '{data.sku}' already exists")
    sku = data.sku or await _generated_sku(db, product.slug, data.size_ml)
    db.add(_build_variant(data, sku, product_id=product_id))
    await db.commit()
    return await get_by_id(db, product_id)


async def update_variant(
    db: AsyncSession, variant_id: uuid.UUID, data: VariantUpdate
) -> ProductVariant:
    variant = await get_variant(db, variant_id)
    values = data.model_dump(exclude_unset=True)
    if values.get("sku") and await _sku_taken(db, values["sku"], variant_id):
        raise ConflictError(f"SKU '{values['sku']}' already exists")

    size_ml = values.get("size_ml")
    if size_ml is not None and size_ml != variant.size_ml:
        if await _size_taken(db, variant.product_id, size_ml, variant_id):
            raise ConflictError(f"{size_label(size_ml)} already exists for this product")
        # The label is derived, never edited directly.
        values["name"] = size_label(size_ml)

    for field, value in values.items():
        setattr(variant, field, value)
    await db.commit()
    await db.refresh(variant)
    return variant


async def delete_variant(db: AsyncSession, variant_id: uuid.UUID) -> None:
    """Extra sizes can be removed; the standard four are part of every product.

    Deactivate one (`is_active: false`) to take it off sale without breaking the
    order lines that reference it.
    """
    variant = await get_variant(db, variant_id)
    if variant.size_ml in DEFAULT_VARIANT_SIZES_ML:
        raise ConflictError(
            f"{size_label(variant.size_ml)} is one of the standard sizes "
            f"({size_list(DEFAULT_VARIANT_SIZES_ML)}) that every product carries. "
            f"Deactivate it instead of deleting it."
        )
    await db.delete(variant)
    await db.commit()


# --- images ----------------------------------------------------------------

def _remaining_slots(product: Product) -> int:
    return settings.MAX_PRODUCT_IMAGES - len(product.images)


def _reject_if_full(product: Product, wanted: int) -> None:
    free = _remaining_slots(product)
    if wanted <= free:
        return
    limit = settings.MAX_PRODUCT_IMAGES
    if free == 0:
        raise BusinessRuleError(
            f"{product.name} already has the maximum of {limit} images. "
            f"Remove one before adding another."
        )
    raise BusinessRuleError(
        f"Only {free} image slot{'s' if free > 1 else ''} left on {product.name} "
        f"(maximum {limit}); you tried to add {wanted}."
    )


def _make_primary(images: list[ProductImage], chosen: ProductImage) -> None:
    for image in images:
        image.is_primary = image is chosen
    chosen.is_primary = True


async def add_image(db: AsyncSession, product_id: uuid.UUID, data: ImageCreate) -> Product:
    """Attach an image that already lives somewhere else, by URL."""
    product = await get_by_id(db, product_id)
    _reject_if_full(product, 1)

    image = ProductImage(product_id=product_id, **data.model_dump())
    if image.is_primary:
        for existing in product.images:
            existing.is_primary = False
    elif not product.images:
        # The first image is the primary one whether or not anyone said so.
        image.is_primary = True
    db.add(image)
    await db.commit()
    return await get_by_id(db, product_id)


async def upload_images(
    db: AsyncSession, product_id: uuid.UUID, files: list[UploadFile]
) -> Product:
    """Store several uploads at once and attach them in the order given."""
    product = await get_by_id(db, product_id)
    if not files:
        raise BusinessRuleError("No files were uploaded")
    _reject_if_full(product, len(files))

    # Validate and write everything first: a half-finished batch would leave
    # orphaned files on disk and a product the operator has to repair by hand.
    stored: list[str] = []
    try:
        for upload in files:
            stored.append(await save_image(upload))
    except Exception:
        for url in stored:
            delete_stored(url)
        raise

    position = len(product.images)
    first = not product.images
    for index, url in enumerate(stored):
        db.add(
            ProductImage(
                product_id=product_id,
                url=url,
                position=position + index,
                is_primary=first and index == 0,
            )
        )
    await db.commit()
    return await get_by_id(db, product_id)


async def get_image(db: AsyncSession, image_id: uuid.UUID) -> ProductImage:
    image = await db.get(ProductImage, image_id)
    if image is None:
        raise NotFoundError("Image not found")
    return image


async def update_image(
    db: AsyncSession, image_id: uuid.UUID, data: ImageUpdate
) -> Product:
    image = await get_image(db, image_id)
    product = await get_by_id(db, image.product_id)
    values = data.model_dump(exclude_unset=True)

    if values.get("is_primary") is False and image.is_primary:
        raise BusinessRuleError(
            "A product always has a primary image. Make another one primary instead."
        )
    if values.pop("is_primary", False):
        _make_primary(product.images, next(i for i in product.images if i.id == image_id))

    for field, value in values.items():
        setattr(image, field, value)
    await db.commit()
    return await get_by_id(db, image.product_id)


async def delete_image(db: AsyncSession, image_id: uuid.UUID) -> None:
    image = await get_image(db, image_id)
    product_id, url, was_primary = image.product_id, image.url, image.is_primary

    await db.delete(image)
    await db.flush()

    if was_primary:
        # Never leave a product without one; the storefront reads primary_image.
        product = await get_by_id(db, product_id)
        if product.images:
            _make_primary(product.images, product.images[0])

    await db.commit()
    delete_stored(url)
