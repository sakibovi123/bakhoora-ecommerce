"""Shop settings the operator can change without a deploy.

One row, always. These used to be constants in `app/core/config.py`, which meant
changing the delivery charge was an environment variable and a restart. The
values that a shopkeeper legitimately wants to change — what the shop is called,
what it charges to deliver, how much it wants up front — live here instead.

Anything still in `config.py` is deployment configuration (database URL, token
lifetimes, upload limits) and deliberately stays out of reach of the panel.
"""

import enum
from decimal import Decimal

from sqlalchemy import Enum as SAEnum
from sqlalchemy import Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin


class AdvanceMode(str, enum.Enum):
    """How much a customer must pay before an order is accepted."""

    NONE = "none"
    """Order on credit — the whole total is collected on delivery."""

    FLAT = "flat"
    """A fixed amount, whatever the basket comes to."""

    DELIVERY = "delivery"
    """The delivery charge itself, so a refused parcel costs the shop nothing."""


class ShopSettings(UUIDMixin, TimestampMixin, Base):
    """The singleton. `settings_service.get` is the only sanctioned way in."""

    __tablename__ = "shop_settings"

    # --- identity ---
    site_title: Mapped[str] = mapped_column(String(120), nullable=False, default="Bakhoora")
    tagline: Mapped[str | None] = mapped_column(String(200))

    # Stored as paths (/media/branding/x.png), like product images, so the
    # database stays portable between environments.
    logo_url: Mapped[str | None] = mapped_column(String(500))
    favicon_url: Mapped[str | None] = mapped_column(String(500))

    # --- money ---
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False, default="BDT")
    currency_symbol: Mapped[str] = mapped_column(String(8), nullable=False, default="৳")

    # --- delivery ---
    delivery_charge: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("70.00")
    )
    # Null means "never free" — distinct from 0, which would make every order
    # free and is almost certainly a typo rather than an intent.
    free_delivery_threshold: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))

    # --- advance payment ---
    advance_mode: Mapped[AdvanceMode] = mapped_column(
        SAEnum(
            AdvanceMode,
            name="advance_mode",
            native_enum=False,
            length=16,
            # Persist the *value* ("none"), not the member name ("NONE").
            # Without this SQLAlchemy stores names, which would disagree with
            # the migration's server_default and with what the API sends.
            values_callable=lambda enum: [member.value for member in enum],
        ),
        nullable=False,
        default=AdvanceMode.NONE,
    )
    advance_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0.00")
    )

    def delivery_for(self, subtotal: Decimal) -> Decimal:
        """What delivery costs on a basket of this size."""
        if subtotal <= 0:
            return Decimal("0.00")
        threshold = self.free_delivery_threshold
        if threshold is not None and subtotal >= threshold:
            return Decimal("0.00")
        return Decimal(self.delivery_charge).quantize(Decimal("0.01"))

    def advance_for(self, total: Decimal, delivery: Decimal) -> Decimal:
        """
        What must be paid before the order is accepted.

        Never more than the order itself: a ৳300 flat advance on a ৳200 basket
        would ask the customer to overpay, so it is capped at the total.
        """
        if self.advance_mode is AdvanceMode.NONE:
            required = Decimal("0.00")
        elif self.advance_mode is AdvanceMode.DELIVERY:
            required = Decimal(delivery)
        else:
            required = Decimal(self.advance_amount)
        return min(max(required, Decimal("0.00")), max(total, Decimal("0.00"))).quantize(
            Decimal("0.01")
        )
