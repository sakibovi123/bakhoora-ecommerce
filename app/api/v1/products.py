import uuid
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, File, Query, UploadFile, status

from app.api.deps import DbSession, PageParams, ProductsManager
from app.core import cache
from app.core.config import settings
from app.models.product import Product, ProductVariant
from app.schemas.common import Page
from app.schemas.product import (
    ImageCreate,
    ImageUpdate,
    ProductCreate,
    ProductOut,
    ProductUpdate,
    VariantCreate,
    VariantOut,
    VariantUpdate,
)
from app.services import product_service

router = APIRouter(prefix="/products", tags=["products"])


@router.get("", response_model=Page[ProductOut])
async def list_products(
    db: DbSession,
    params: PageParams,
    search: Annotated[str | None, Query(max_length=100)] = None,
    category: str | None = None,
    brand: str | None = None,
    min_price: Decimal | None = None,
    max_price: Decimal | None = None,
    featured: bool | None = None,
    in_stock: bool | None = None,
    sort: Literal["newest", "oldest", "name", "price_asc", "price_desc"] = "newest",
) -> dict:
    filters = dict(
        page=params.page,
        size=params.size,
        search=search,
        category_slug=category,
        brand=brand,
        min_price=min_price,
        max_price=max_price,
        featured=featured,
        in_stock=in_stock,
        sort=sort,
    )

    async def build() -> dict:
        items, total = await product_service.list_products(db, **filters)
        page = Page.create(
            [ProductOut.model_validate(item) for item in items], total, params.page, params.size
        )
        return page.model_dump(mode="json")

    # Every filter is part of the key — two searches that differ only by brand
    # are different result sets, and sharing an entry between them would serve
    # one shopper's filter to another.
    return await cache.cache.get_or_set(
        cache.PRODUCTS,
        cache.make_key(**filters),
        build,
        ttl=settings.CACHE_TTL_PRODUCTS,
    )


@router.get("/{slug}", response_model=ProductOut)
async def get_product(slug: str, db: DbSession) -> Product:
    return await product_service.get_by_slug(db, slug)


# --- admin -----------------------------------------------------------------

@router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
async def create_product(data: ProductCreate, db: DbSession, _: ProductsManager) -> Product:
    return await product_service.create(db, data)


@router.patch("/{product_id}", response_model=ProductOut)
async def update_product(
    product_id: uuid.UUID, data: ProductUpdate, db: DbSession, _: ProductsManager
) -> Product:
    return await product_service.update(db, product_id, data)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(product_id: uuid.UUID, db: DbSession, _: ProductsManager) -> None:
    await product_service.delete(db, product_id)


@router.post(
    "/{product_id}/variants", response_model=ProductOut, status_code=status.HTTP_201_CREATED
)
async def add_variant(
    product_id: uuid.UUID, data: VariantCreate, db: DbSession, _: ProductsManager
) -> Product:
    return await product_service.add_variant(db, product_id, data)


@router.patch("/variants/{variant_id}", response_model=VariantOut)
async def update_variant(
    variant_id: uuid.UUID, data: VariantUpdate, db: DbSession, _: ProductsManager
) -> ProductVariant:
    return await product_service.update_variant(db, variant_id, data)


@router.delete("/variants/{variant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_variant(variant_id: uuid.UUID, db: DbSession, _: ProductsManager) -> None:
    await product_service.delete_variant(db, variant_id)


@router.post(
    "/{product_id}/images", response_model=ProductOut, status_code=status.HTTP_201_CREATED
)
async def add_image(
    product_id: uuid.UUID, data: ImageCreate, db: DbSession, _: ProductsManager
) -> Product:
    return await product_service.add_image(db, product_id, data)


@router.post(
    "/{product_id}/images/upload",
    response_model=ProductOut,
    status_code=status.HTTP_201_CREATED,
    summary="Upload one or more image files",
)
async def upload_images(
    product_id: uuid.UUID,
    db: DbSession,
    _: ProductsManager,
    files: Annotated[list[UploadFile], File(description="Image files")],
) -> Product:
    """Multipart upload. Rejects the whole batch if it would exceed the limit."""
    return await product_service.upload_images(db, product_id, files)


@router.patch("/images/{image_id}", response_model=ProductOut)
async def update_image(
    image_id: uuid.UUID, data: ImageUpdate, db: DbSession, _: ProductsManager
) -> Product:
    """Set the primary image, or edit its alt text."""
    return await product_service.update_image(db, image_id, data)


@router.delete("/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_image(image_id: uuid.UUID, db: DbSession, _: ProductsManager) -> None:
    await product_service.delete_image(db, image_id)
