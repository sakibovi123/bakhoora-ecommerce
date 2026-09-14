"""Price changes, proposed and approved.

Repricing a catalogue is not like editing one product. It is a batch of
decisions taken together — raise the imports, hold the oils, drop the slow
15ml — and it wants reviewing as a batch before any of it reaches a customer.
So a change is written down first, with what every figure was and what it is
being moved to, and nothing touches `product_variants` until someone approves
the sheet.

That also makes the history real. A price on a variant is just a number; these
two tables are the answer to "who put the Creed up to 780, and when, and what
was it before".
"""

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin, enum_column


class PriceReviewStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


# Once decided, a review is history and cannot be decided again.
DECIDED_STATUSES = frozenset({PriceReviewStatus.APPROVED, PriceReviewStatus.REJECTED})


class PriceReview(UUIDMixin, TimestampMixin, Base):
    """One batch of proposed price changes, awaiting a decision."""

    __tablename__ = "price_reviews"
    __table_args__ = (Index("ix_price_reviews_status_created", "status", "created_at"),)

    reference: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    status: Mapped[PriceReviewStatus] = mapped_column(
        enum_column(PriceReviewStatus, "price_review_status"),
        default=PriceReviewStatus.PENDING,
        nullable=False,
        index=True,
    )
    note: Mapped[str | None] = mapped_column(Text)

    # SET NULL rather than RESTRICT: a member of staff who leaves must be
    # removable, and losing the name is better than losing the price history or
    # blocking the deletion. The reference and the figures are the record.
    proposed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    reviewed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    review_note: Mapped[str | None] = mapped_column(Text)

    lines: Mapped[list["PriceReviewLine"]] = relationship(
        back_populates="review",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="PriceReviewLine.product_name, PriceReviewLine.size_ml",
    )

    @property
    def is_decided(self) -> bool:
        return self.status in DECIDED_STATUSES


class PriceReviewLine(UUIDMixin, TimestampMixin, Base):
    """One variant's proposed move, with both figures on both sides.

    Cost and price travel together because the thing being reviewed is the
    margin, not the price on its own: approving a 780 without seeing that the
    bottle now costs 620 is approving a number, not a decision.

    Names are snapshotted like an order line's. A product renamed or deleted
    after the fact must not make an old review unreadable — the whole point of
    keeping these is to be able to read them later.
    """

    __tablename__ = "price_review_lines"

    review_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("price_reviews.id", ondelete="CASCADE"),
        index=True, nullable=False,
    )
    # SET NULL: a variant deleted between proposal and approval leaves a line
    # that can still be read but can no longer be applied. `apply` skips it and
    # says so rather than failing the whole sheet.
    variant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("product_variants.id", ondelete="SET NULL"), index=True
    )

    product_name: Mapped[str] = mapped_column(String(200), nullable=False)
    variant_name: Mapped[str] = mapped_column(String(80), nullable=False)
    sku: Mapped[str] = mapped_column(String(64), nullable=False)
    size_ml: Mapped[int] = mapped_column(nullable=False)

    # What the figures were when the sheet was drawn up. Kept so the review
    # reads as a decision ("700 → 780") and so approval can tell whether
    # someone moved the price underneath it in the meantime.
    from_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    from_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    to_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    to_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    review: Mapped["PriceReview"] = relationship(back_populates="lines")
