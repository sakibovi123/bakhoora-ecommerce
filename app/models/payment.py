import uuid
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin
from app.models.order import PaymentStatus, _enum

if TYPE_CHECKING:
    from app.models.order import Order


class Payment(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "payments"

    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), index=True, nullable=False
    )
    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(120), index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="BDT", nullable=False)
    status: Mapped[PaymentStatus] = mapped_column(
        _enum(PaymentStatus, "payment_status"),
        default=PaymentStatus.PENDING,
        nullable=False,
    )
    raw_response: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    order: Mapped["Order"] = relationship(back_populates="payments")
