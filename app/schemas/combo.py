import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.utils.sizes import MAX_SIZE_ML, MIN_SIZE_ML, size_list

# A bundle needs at least two perfumes to be a bundle. The upper bound is not a
# business rule so much as a guard on a hand-built form: the campaign sheet uses
# five, and a combo of thirteen is a slip rather than an intention.
MIN_COMBO_PRODUCTS = 2
MAX_COMBO_PRODUCTS = 12


class ComboSizeIn(BaseModel):
    """One priced option: the whole bundle at this bottle size."""

    size_ml: int = Field(
        ge=MIN_SIZE_ML,
        le=MAX_SIZE_ML,
        description="Every perfume in the combo ships at this size.",
    )
    price: Decimal = Field(
        gt=0,
        max_digits=12,
        decimal_places=2,
        description="Flat campaign price for the whole bundle. Nothing derives it.",
    )
    is_active: bool = True
    sku: str | None = Field(
        default=None,
        max_length=64,
        description="Derived from the combo slug and size when omitted.",
    )


class ComboBase(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    tagline: str | None = Field(
        default=None, max_length=300, description="The one line under the name on a card."
    )
    description: str | None = None
    use_case: str | None = Field(
        default=None, max_length=120, description='Campaign grouping, e.g. "Everyday / Fresh".'
    )
    occasion: str | None = Field(
        default=None, max_length=300, description='e.g. "Best: Hot/humid weather."'
    )
    image_url: str | None = Field(default=None, max_length=500)
    position: int = 0
    is_active: bool = True
    is_featured: bool = False


def _no_repeats(products: list[uuid.UUID]) -> list[uuid.UUID]:
    if len(set(products)) != len(products):
        raise ValueError("The same perfume is listed twice in this combo")
    return products


def _no_repeat_sizes(sizes: list[ComboSizeIn]) -> list[ComboSizeIn]:
    seen = [entry.size_ml for entry in sizes]
    duplicates = sorted({size for size in seen if seen.count(size) > 1})
    if duplicates:
        raise ValueError(f"Repeated size: {size_list(duplicates)}")
    return sizes


class ComboCreate(ComboBase):
    slug: str | None = Field(default=None, max_length=220)
    # Order matters: this is the order the campaign lists them in and the order
    # the storefront and the invoice print them.
    products: list[uuid.UUID] = Field(
        min_length=MIN_COMBO_PRODUCTS,
        max_length=MAX_COMBO_PRODUCTS,
        description="Product ids, in the order they should be shown.",
    )
    sizes: list[ComboSizeIn] = Field(
        min_length=1, description="At least one size, or there is nothing to buy."
    )

    _check_products = field_validator("products")(_no_repeats)
    _check_sizes = field_validator("sizes")(_no_repeat_sizes)


class ComboUpdate(BaseModel):
    """Every field optional. `products` and `sizes` replace the list wholesale.

    Wholesale rather than per-row endpoints because the builder is one form with
    one save button — a half-applied combo (new oils, old prices) is a state
    worth making unreachable. Sizes are reconciled by `size_ml` rather than
    deleted and re-inserted, so a size that survives an edit keeps its id and
    stays in the baskets that already hold it.
    """

    name: str | None = Field(default=None, min_length=2, max_length=200)
    slug: str | None = Field(default=None, max_length=220)
    tagline: str | None = Field(default=None, max_length=300)
    description: str | None = None
    use_case: str | None = Field(default=None, max_length=120)
    occasion: str | None = Field(default=None, max_length=300)
    image_url: str | None = Field(default=None, max_length=500)
    position: int | None = None
    is_active: bool | None = None
    is_featured: bool | None = None
    products: list[uuid.UUID] | None = Field(
        default=None, min_length=MIN_COMBO_PRODUCTS, max_length=MAX_COMBO_PRODUCTS
    )
    sizes: list[ComboSizeIn] | None = Field(default=None, min_length=1)

    @field_validator("products")
    @classmethod
    def _check_products(cls, value: list[uuid.UUID] | None) -> list[uuid.UUID] | None:
        return None if value is None else _no_repeats(value)

    @field_validator("sizes")
    @classmethod
    def _check_sizes(cls, value: list[ComboSizeIn] | None) -> list[ComboSizeIn] | None:
        return None if value is None else _no_repeat_sizes(value)


class ComboReorder(BaseModel):
    items: list["ComboPosition"] = Field(min_length=1, max_length=200)


class ComboPosition(BaseModel):
    id: uuid.UUID
    position: int = Field(ge=0)


class ComboProductOut(BaseModel):
    """A perfume in the combo, independent of which size is being bought."""

    product_id: uuid.UUID
    name: str
    slug: str
    brand: str | None
    image_url: str | None
    position: int
    is_active: bool


class ComboComponentOut(BaseModel):
    """One bottle of one size option — the thing stock is actually counted in.

    `variant_id` is null when the perfume has no bottle at this size at all,
    which is the usual reason a size option cannot be sold. `reason` says which
    of the ways it is unavailable applies, so the panel can print it rather than
    leaving the operator to work out why a combo is greyed out.
    """

    product_id: uuid.UUID
    product_name: str
    variant_id: uuid.UUID | None
    sku: str | None
    price: Decimal | None
    stock_quantity: int
    is_available: bool
    reason: str | None


class ComboSizeOut(BaseModel):
    id: uuid.UUID
    size_ml: int
    sku: str
    price: Decimal
    is_active: bool
    label: str = Field(description='Derived, e.g. "5 × 6ml"')
    components: list[ComboComponentOut] = []
    # How many of this bundle could be assembled from stock on hand: the
    # smallest stock figure among its bottles. This is the cap on what may be
    # added to a basket, and it is why a combo carries no stock column of
    # its own.
    max_sets: int = 0
    is_available: bool = False
    # What the same bottles cost bought one by one. Informational only — the
    # combo price is typed in by hand and nothing here feeds it. Null when a
    # bottle is missing, because then there is no honest comparison to draw.
    components_total: Decimal | None = None
    savings: Decimal | None = None


class ComboOut(ComboBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    products: list[ComboProductOut] = []
    sizes: list[ComboSizeOut] = []
    # True when at least one size option can actually be sold right now.
    is_available: bool = False
    price_from: Decimal | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class CoverageRow(BaseModel):
    """One perfume, and how much of the campaign leans on it.

    This is the Stock Coverage sheet: an oil in six of twelve combos is what a
    stock-clearing campaign is trying to move, and an oil in none of them is
    what the campaign forgot.
    """

    product_id: uuid.UUID
    product_name: str
    brand: str | None
    times_included: int
    coverage_pct: float = Field(description="times_included / total combos, as a percentage")
    combo_names: list[str] = []
    # The smallest stock across the sizes this product is actually sold in
    # inside these combos — the figure that decides how many bundles can ship.
    lowest_stock: int | None = None


class StockCoverage(BaseModel):
    total_combos: int
    # Perfumes carried by at least one combo, busiest first.
    rows: list[CoverageRow] = []
    # In the catalogue, in no combo at all. The gap the campaign has not covered.
    uncovered: list[CoverageRow] = []


ComboReorder.model_rebuild()
