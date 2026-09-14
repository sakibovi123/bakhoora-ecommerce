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


class OrderItemComponentOut(BaseModel):
    """One bottle inside a combo line. Carries no money — the line above does."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    variant_id: uuid.UUID | None
    product_name: str
    variant_name: str
    sku: str
    quantity: int


class OrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    variant_id: uuid.UUID | None
    # Set on a combo line. The name, size label and price on the line are
    # already snapshotted, so this is for reporting, not for rendering.
    combo_id: uuid.UUID | None = None
    product_name: str
    variant_name: str
    sku: str
    image_url: str | None
    unit_price: Decimal
    quantity: int
    line_total: Decimal
    # Empty on a single bottle. On a combo it is what went in the box, which is
    # what the picker and the invoice both need.
    components: list[OrderItemComponentOut] = []


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
    # Read off Order.amount_paid and the Order.amount_due property, so the
    # invoice and the panel never have to do the subtraction themselves.
    amount_paid: Decimal
    amount_due: Decimal
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
    # The snapshot taken when the order was placed, not the account's current
    # name: a row in this list has to keep saying who it was actually for.
    recipient_name: str
    status: OrderStatus
    payment_status: PaymentStatus
    total: Decimal
    amount_paid: Decimal
    amount_due: Decimal
    currency: str
    created_at: datetime


class CheckoutResponse(BaseModel):
    order: OrderOut
    payment_instructions: dict[str, Any]


class ManualOrderLine(BaseModel):
    """One line of a counter order: a single bottle, or a whole combo."""

    variant_id: uuid.UUID | None = None
    combo_size_id: uuid.UUID | None = None
    quantity: int = Field(ge=1, le=999)
    # What the shop actually agreed for this line, per unit. Left out, the
    # variant's — or the combo's — listed price applies. Zero is allowed: a
    # sample thrown in with an order is a real line at no charge, and hiding it
    # off the invoice would make the stock movement unaccountable.
    unit_price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)

    @model_validator(mode="after")
    def _one_kind(self) -> "ManualOrderLine":
        if bool(self.variant_id) == bool(self.combo_size_id):
            raise ValueError("Each line needs exactly one of variant_id or combo_size_id")
        return self


def _no_duplicate_lines(value: list["ManualOrderLine"]) -> list["ManualOrderLine"]:
    """Refuse the same thing twice on one order.

    Keyed on the pair rather than on the variant alone: a bottle sold on its own
    and the same bottle inside a combo are two different lines, and collapsing
    them would refuse a perfectly ordinary counter sale.
    """
    seen = [(line.variant_id, line.combo_size_id) for line in value]
    if len(set(seen)) != len(seen):
        raise ValueError("The same item appears on more than one line")
    return value


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
    # Money handed over when the order was taken — the customer who pays the
    # 100tk delivery charge now and owes the other 900 on delivery. Left out or
    # zero, the whole total is due. It cannot exceed the total: taking more
    # than the order is worth is a data-entry slip, not a credit balance.
    amount_paid: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    customer_note: str | None = Field(default=None, max_length=1000)
    admin_note: str | None = Field(default=None, max_length=1000)

    _one_line_each = field_validator("items")(_no_duplicate_lines)

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


class PaymentRecord(BaseModel):
    """Money actually received against an order.

    This is what the desk fills in when the courier comes back with the rest of
    the cash, and it is the only way an order's paid figure moves after it is
    created — so every taka has a row behind it.
    """

    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    # Defaults to the order's own method: cash on delivery collected in cash.
    provider: str | None = Field(default=None, max_length=40)
    reference: str | None = Field(default=None, max_length=120)


class OrderBulkDelete(BaseModel):
    """The rows the desk ticked in the orders list.

    Capped because this is a hand-made selection off one page of the table, not
    a way to empty the shop's history in a single request.
    """

    ids: list[uuid.UUID] = Field(min_length=1, max_length=100)


class OrderBulkDeleteResult(BaseModel):
    """How many of the ticked orders were still there to delete."""

    deleted: int


class OrderEditRequest(BaseModel):
    """Rewrite a placed order's contents.

    The same shape as `ManualOrderRequest` minus the things an edit must not
    touch: `status` and `payment_status` have their own endpoint and their own
    transition rules, and `payment_method` is settled once the provider has an
    intent against the order. `amount_paid` is likewise left alone — money that
    was collected is a fact, recorded through `record_payment`; an edit changes
    what was *bought*, and the payment status is re-derived from the new total.

    Every field is required rather than patch-style. An edit screen sends the
    whole order back, and a partial payload here would make "no items" mean
    "leave the items alone" — which is the one instruction that must never be
    ambiguous when stock is about to move.
    """

    items: list[ManualOrderLine] = Field(min_length=1, max_length=100)
    shipping_address: AddressCreate
    shipping_fee: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    discount_total: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)

    # Notes are deliberately absent. `admin_note` is write-only — `OrderOut`
    # does not return it — so a panel filling this form cannot know the current
    # value, and a whole-object PUT carrying an absent field would erase a note
    # nobody meant to touch. `customer_note` is the customer's own words from
    # checkout, which is not the shop's to rewrite. The admin note has its own
    # endpoint (`PATCH /admin/orders/{id}`) and keeps it.

    _one_line_each = field_validator("items")(_no_duplicate_lines)


class OrderStatusUpdate(BaseModel):
    status: OrderStatus | None = None
    payment_status: PaymentStatus | None = None
    admin_note: str | None = None
