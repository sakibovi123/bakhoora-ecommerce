import enum
import uuid
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, Index, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin, enum_column

if TYPE_CHECKING:
    from app.models.combo import Combo
    from app.models.payment import Payment
    from app.models.product import ProductVariant
    from app.models.user import User


class OrderStatus(str, enum.Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    PROCESSING = "processing"
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"


class PaymentStatus(str, enum.Enum):
    UNPAID = "unpaid"
    PENDING = "pending"
    # Some of the money is in — a counter customer who paid the delivery charge
    # up front and owes the rest on delivery. The amount is on the order.
    PARTIAL = "partial"
    PAID = "paid"
    FAILED = "failed"
    REFUNDED = "refunded"


# Once an order is refunded or the payment failed, the paid/due arithmetic no
# longer describes it, so those two are never re-derived from the amounts.
TERMINAL_PAYMENT_STATUSES = {PaymentStatus.REFUNDED, PaymentStatus.FAILED}


class Order(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "orders"

    # Every sales report is a range scan on `created_at`; without this the
    # planner has nothing to work with and reads the whole table for a report
    # covering one day. `status` rides along as the second column because the
    # revenue-only aggregates filter on it, which lets the range scan discard
    # pending and cancelled rows before touching the heap.
    __table_args__ = (Index("ix_orders_created_at_status", "created_at", "status"),)

    order_number: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    status: Mapped[OrderStatus] = mapped_column(
        enum_column(OrderStatus, "order_status"),
        default=OrderStatus.PENDING,
        nullable=False,
        index=True,
    )
    payment_status: Mapped[PaymentStatus] = mapped_column(
        enum_column(PaymentStatus, "payment_status"), default=PaymentStatus.UNPAID, nullable=False
    )
    payment_method: Mapped[str] = mapped_column(String(40), default="cod", nullable=False)

    currency: Mapped[str] = mapped_column(String(3), default="BDT", nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    shipping_fee: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    discount_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    # How much of `total` has actually been collected. This is a column rather
    # than a sum over `payments` because that table holds provider *intents*
    # (a bKash instruction written for the full total before a taka has moved)
    # alongside real receipts, so summing it would count money nobody has.
    # `record_payment` writes the receipt row and moves this together.
    amount_paid: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)

    # What the shop required up front when this order was placed. Snapshotted
    # like every other money column: raising the advance next month must not
    # retroactively make last month's orders underpaid.
    advance_required: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=0, nullable=False
    )

    # Address is snapshotted: editing the saved address must not rewrite history.
    recipient_name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    line1: Mapped[str] = mapped_column(String(255), nullable=False)
    line2: Mapped[str | None] = mapped_column(String(255))
    city: Mapped[str] = mapped_column(String(80), nullable=False)
    district: Mapped[str | None] = mapped_column(String(80))
    postal_code: Mapped[str | None] = mapped_column(String(20))
    country: Mapped[str] = mapped_column(String(60), default="Bangladesh", nullable=False)

    customer_note: Mapped[str | None] = mapped_column(Text)
    admin_note: Mapped[str | None] = mapped_column(Text)

    user: Mapped[Optional["User"]] = relationship(back_populates="orders")
    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", lazy="selectin"
    )
    payments: Mapped[list["Payment"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", lazy="selectin"
    )

    @property
    def amount_due(self) -> Decimal:
        """What the customer still owes.

        Never negative — an overpayment is a refund to be handled on its own,
        not a negative due on the invoice. A refunded order owes nothing either:
        the money came in and went back out, so `amount_paid` is what the shop
        currently holds (nothing) while the customer is square. Without this a
        refunded order would print "to collect on delivery" for its full total.
        FAILED is deliberately not included — there the money never arrived, so
        the whole amount genuinely is still owed.
        """
        if self.payment_status is PaymentStatus.REFUNDED:
            return Decimal("0.00")
        return max(self.total - self.amount_paid, Decimal("0.00"))

    def derive_payment_status(self) -> PaymentStatus:
        """Payment state read off the money, so the badge cannot drift from it.

        A partly-paid order that says "unpaid" is how a shop loses track of a
        due, so the two are never allowed to disagree.
        """
        if self.payment_status in TERMINAL_PAYMENT_STATUSES:
            return self.payment_status
        if self.amount_paid <= 0:
            # PENDING is a real distinction from UNPAID: the customer has been
            # given transfer instructions and nothing has landed yet.
            return (
                PaymentStatus.PENDING
                if self.payment_status is PaymentStatus.PENDING
                else PaymentStatus.UNPAID
            )
        if self.amount_paid >= self.total:
            return PaymentStatus.PAID
        return PaymentStatus.PARTIAL


class OrderItem(UUIDMixin, TimestampMixin, Base):
    """Product details are copied in so the line survives catalogue edits.

    A line is one of two things. A single bottle carries `variant_id` and no
    components. A combo carries `combo_id`, no `variant_id` — there is no one
    variant it refers to — and one `components` row per bottle inside it, which
    is what the stock arithmetic reads. Both kinds price the same way, so every
    report, invoice and best-seller query that sums `line_total` keeps working
    without knowing combos exist; a combo simply appears under its own name.
    """

    __tablename__ = "order_items"

    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), index=True, nullable=False
    )
    variant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("product_variants.id", ondelete="SET NULL"), index=True
    )
    # Which campaign this line came from, for reporting. SET NULL because
    # deleting a finished campaign must not delete the orders it produced.
    combo_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("combos.id", ondelete="SET NULL"), index=True
    )
    product_name: Mapped[str] = mapped_column(String(200), nullable=False)
    variant_name: Mapped[str] = mapped_column(String(80), nullable=False)
    sku: Mapped[str] = mapped_column(String(64), nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(500))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    order: Mapped["Order"] = relationship(back_populates="items")
    variant: Mapped[Optional["ProductVariant"]] = relationship()
    combo: Mapped[Optional["Combo"]] = relationship()
    components: Mapped[list["OrderItemComponent"]] = relationship(
        back_populates="item", cascade="all, delete-orphan", lazy="selectin"
    )

    @property
    def is_combo(self) -> bool:
        return bool(self.components)


class OrderItemComponent(UUIDMixin, TimestampMixin, Base):
    """One bottle inside a combo line, snapshotted like the line above it.

    This exists so cancelling, refunding or deleting an order can put the right
    stock back. A combo line has no `variant_id` of its own, so without these
    rows the five bottles it reserved would stay reserved forever — and reading
    the combo's *current* contents instead would restock whatever the campaign
    happens to hold today, not what actually went out of the door.

    It carries no money. The combo is flat-priced as a whole, and splitting
    that across five bottles would invent per-bottle revenue that nobody
    agreed; every total on the order comes from the parent line.
    """

    __tablename__ = "order_item_components"

    order_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("order_items.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    variant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("product_variants.id", ondelete="SET NULL"), index=True
    )
    product_name: Mapped[str] = mapped_column(String(200), nullable=False)
    variant_name: Mapped[str] = mapped_column(String(80), nullable=False)
    sku: Mapped[str] = mapped_column(String(64), nullable=False)
    position: Mapped[int] = mapped_column(default=0, nullable=False)
    # Bottles of this oil per one combo — 1 today, but a bundle that doubles up
    # on a base note is a campaign decision, not a schema change.
    quantity: Mapped[int] = mapped_column(default=1, nullable=False)

    item: Mapped["OrderItem"] = relationship(back_populates="components")
    variant: Mapped[Optional["ProductVariant"]] = relationship()
