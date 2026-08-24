import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator

from app.schemas.category import CategoryOut
from app.utils.sizes import (
    DEFAULT_VARIANT_SIZES_ML,
    MAX_SIZE_ML,
    MIN_SIZE_ML,
    size_list,
)


class VariantBase(BaseModel):
    size_ml: int = Field(
        ge=MIN_SIZE_ML,
        le=MAX_SIZE_ML,
        description="Bottle size in millilitres. This is what makes a variant unique.",
    )
    price: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    compare_at_price: Decimal | None = Field(default=None, gt=0)
    stock_quantity: int = Field(default=0, ge=0)
    is_active: bool = True


class VariantCreate(VariantBase):
    sku: str | None = Field(
        default=None,
        max_length=64,
        description="Derived from the product slug and size when omitted.",
    )


class VariantUpdate(BaseModel):
    size_ml: int | None = Field(default=None, ge=MIN_SIZE_ML, le=MAX_SIZE_ML)
    sku: str | None = None
    price: Decimal | None = Field(default=None, gt=0)
    compare_at_price: Decimal | None = None
    stock_quantity: int | None = Field(default=None, ge=0)
    is_active: bool | None = None


class VariantOut(VariantBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    sku: str
    name: str = Field(description='Display label derived from the size, e.g. "6ml"')

    @computed_field
    @property
    def in_stock(self) -> bool:
        return self.is_active and self.stock_quantity > 0


class ImageBase(BaseModel):
    url: str = Field(max_length=500)
    alt_text: str | None = Field(default=None, max_length=200)
    position: int = 0
    is_primary: bool = False


class ImageCreate(ImageBase):
    pass


class ImageUpdate(BaseModel):
    alt_text: str | None = Field(default=None, max_length=200)
    position: int | None = None
    is_primary: bool | None = None


class ImageOut(ImageBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID


class ProductBase(BaseModel):
    name: str = Field(max_length=200)
    short_description: str | None = Field(default=None, max_length=300)
    description: str | None = None
    brand: str | None = Field(default=None, max_length=120)
    is_active: bool = True
    is_featured: bool = False
    category_id: uuid.UUID | None = None


class ProductCreate(ProductBase):
    slug: str | None = Field(default=None, max_length=220)
    variants: list[VariantCreate] = Field(
        # No min_length: it would fire before the validator below and replace a
        # message naming the missing size with a bare item count.
        description=(
            f"One entry per bottle size, each with its own price. The standard "
            f"sizes ({size_list(DEFAULT_VARIANT_SIZES_ML)}) are all required; "
            f"extra sizes may be included here or added later."
        ),
    )
    images: list[ImageCreate] = []

    @field_validator("variants")
    @classmethod
    def _standard_sizes_present(cls, variants: list[VariantCreate]) -> list[VariantCreate]:
        sizes = [variant.size_ml for variant in variants]
        duplicates = sorted({size for size in sizes if sizes.count(size) > 1})
        if duplicates:
            raise ValueError(f"Repeated bottle size: {size_list(duplicates)}")
        missing = [size for size in DEFAULT_VARIANT_SIZES_ML if size not in sizes]
        if missing:
            raise ValueError(
                f"Every product needs the standard sizes "
                f"({size_list(DEFAULT_VARIANT_SIZES_ML)}); missing {size_list(missing)}"
            )
        return variants


class ProductUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    short_description: str | None = None
    description: str | None = None
    brand: str | None = None
    is_active: bool | None = None
    is_featured: bool | None = None
    category_id: uuid.UUID | None = None


class ProductOut(ProductBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    category: CategoryOut | None = None
    variants: list[VariantOut] = []
    images: list[ImageOut] = []

    @computed_field
    @property
    def price_from(self) -> Decimal | None:
        prices = [v.price for v in self.variants if v.is_active]
        return min(prices) if prices else None

    @computed_field
    @property
    def price_to(self) -> Decimal | None:
        prices = [v.price for v in self.variants if v.is_active]
        return max(prices) if prices else None

    @computed_field
    @property
    def in_stock(self) -> bool:
        return any(v.is_active and v.stock_quantity > 0 for v in self.variants)

    @computed_field
    @property
    def primary_image(self) -> str | None:
        if not self.images:
            return None
        primary = next((i for i in self.images if i.is_primary), self.images[0])
        return primary.url
