import uuid
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

# What a basket line is. A combo is priced and counted as one thing even though
# it reserves several bottles, so the storefront needs to be told which it has.
LineKind = Literal["product", "combo"]


class CartItemAdd(BaseModel):
    """Add one bottle, or one whole combo. Exactly one of the two."""

    variant_id: uuid.UUID | None = None
    combo_size_id: uuid.UUID | None = None
    quantity: int = Field(default=1, ge=1, le=99)

    @model_validator(mode="after")
    def _one_kind(self) -> "CartItemAdd":
        if bool(self.variant_id) == bool(self.combo_size_id):
            raise ValueError("Provide exactly one of variant_id or combo_size_id")
        return self


class CartItemUpdate(BaseModel):
    quantity: int = Field(ge=1, le=99)


class CartItemOut(BaseModel):
    """One line, whichever kind it is.

    The shared fields are filled in for both so a cart drawer can render a line
    without branching: a combo's `product_name` is the combo's name, its
    `variant_name` is the derived "5 × 6ml" label, and its `stock_quantity` is
    how many of the bundle could be assembled from what is on the shelf.
    `components` is the only combo-only field, because a basket that says
    "Everyday Fresh 5" without saying which five is asking the customer to
    remember the product page.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: LineKind = "product"
    # Null on a combo line — there is no single variant it refers to.
    variant_id: uuid.UUID | None = None
    combo_size_id: uuid.UUID | None = None
    product_id: uuid.UUID
    product_name: str
    product_slug: str
    variant_name: str
    sku: str
    image_url: str | None
    unit_price: Decimal
    quantity: int
    line_total: Decimal
    stock_quantity: int
    is_available: bool
    # "Bleu de Chanel", "YSL Y", … — empty on a single bottle.
    components: list[str] = []


class CartOut(BaseModel):
    id: uuid.UUID
    items: list[CartItemOut]
    item_count: int
    subtotal: Decimal
    shipping_fee: Decimal
    total: Decimal
    currency: str
