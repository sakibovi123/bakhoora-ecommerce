import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.order import OrderStatus, PaymentStatus
from app.schemas.address import AddressCreate


class CheckoutRequest(BaseModel):
    """Either reference a saved address or pass a fresh one."""

    address_id: uuid.UUID | None = None
    shipping_address: AddressCreate | None = None
    payment_method: str = Field(default="cod", description="cod | manual_bkash")
    customer_note: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def one_address_source(self) -> "CheckoutRequest":
        if bool(self.address_id) == bool(self.shipping_address):
            raise ValueError("Provide exactly one of address_id or shipping_address")
        return self


class OrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    variant_id: uuid.UUID | None
    product_name: str
    variant_name: str
    sku: str
    image_url: str | None
    unit_price: Decimal
    quantity: int
    line_total: Decimal


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    provider: str
    reference: str | None
    amount: Decimal
    currency: str
    status: PaymentStatus
    created_at: datetime


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_number: str
    status: OrderStatus
    payment_status: PaymentStatus
    payment_method: str
    currency: str
    subtotal: Decimal
    shipping_fee: Decimal
    discount_total: Decimal
    total: Decimal
    recipient_name: str
    phone: str
    line1: str
    line2: str | None
    city: str
    district: str | None
    postal_code: str | None
    country: str
    customer_note: str | None
    created_at: datetime
    items: list[OrderItemOut]
    payments: list[PaymentOut] = []


class OrderListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_number: str
    status: OrderStatus
    payment_status: PaymentStatus
    total: Decimal
    currency: str
    created_at: datetime


class CheckoutResponse(BaseModel):
    order: OrderOut
    payment_instructions: dict[str, Any]


class ManualOrderLine(BaseModel):
    variant_id: uuid.UUID
    quantity: int = Field(ge=1, le=999)


class ManualOrderRequest(BaseModel):
    """An order the shop takes over the phone or at the counter.

    Everything a checkout produces, minus the cart: the same stock reservation,
    the same snapshots on the line items, and the same place in every report.
    """

    items: list[ManualOrderLine] = Field(min_length=1, max_length=100)
    shipping_address: AddressCreate
    # Optional: link it to an account so it lands in their order history and
    # lifetime value. Left out, it is a walk-in with no account.
    user_id: uuid.UUID | None = None
    payment_method: str = Field(default="cod")
    # Phone orders are often already agreed and paid, so the desk can say so.
    status: OrderStatus | None = None
    payment_status: PaymentStatus | None = None
    # Overrides for a negotiated price. Left out, the usual rules apply.
    shipping_fee: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    discount_total: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    customer_note: str | None = Field(default=None, max_length=1000)
    admin_note: str | None = Field(default=None, max_length=1000)

    @field_validator("items")
    @classmethod
    def _one_line_per_variant(cls, value: list[ManualOrderLine]) -> list[ManualOrderLine]:
        seen = [line.variant_id for line in value]
        if len(set(seen)) != len(seen):
            raise ValueError("The same size appears on more than one line")
        return value

    @field_validator("status")
    @classmethod
    def _sensible_starting_status(cls, value: OrderStatus | None) -> OrderStatus | None:
        # Opening an order as shipped or refunded skips the transitions that
        # restock and would leave the books lying.
        allowed = {OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PROCESSING}
        if value is not None and value not in allowed:
            names = ", ".join(s.value for s in allowed)
            raise ValueError(f"A new order can only start as {names}")
        return value


class OrderStatusUpdate(BaseModel):
    status: OrderStatus | None = None
    payment_status: PaymentStatus | None = None
    admin_note: str | None = None
