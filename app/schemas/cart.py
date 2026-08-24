import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class CartItemAdd(BaseModel):
    variant_id: uuid.UUID
    quantity: int = Field(default=1, ge=1, le=99)


class CartItemUpdate(BaseModel):
    quantity: int = Field(ge=1, le=99)


class CartItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    variant_id: uuid.UUID
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


class CartOut(BaseModel):
    id: uuid.UUID
    items: list[CartItemOut]
    item_count: int
    subtotal: Decimal
    shipping_fee: Decimal
    total: Decimal
    currency: str
