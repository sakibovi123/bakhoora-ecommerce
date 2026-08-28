"""What the shop spends, and on what.

Orders record money coming in. Nothing recorded money going out, so the sales
report showed revenue as though it were profit. These two tables are the other
side of that: a category list the shop maintains itself, and one row per payment
made.
"""

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Boolean, Date, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class ExpenseCategory(UUIDMixin, TimestampMixin, Base):
    """How spending is grouped in the report. Maintained by the shop."""

    __tablename__ = "expense_categories"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(140), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    position: Mapped[int] = mapped_column(default=0, nullable=False)
    # Retiring a category hides it from the picker without touching the history
    # filed under it — which is the answer whenever deletion is refused.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    expenses: Mapped[list["Expense"]] = relationship(back_populates="category")


class Expense(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "expenses"
    # The report filters on the date and groups by category; the dedicated
    # expenses list filters by both. Mirrors ix_orders_created_at_status.
    __table_args__ = (Index("ix_expenses_spent_on_category", "spent_on", "category_id"),)

    # The date the money actually left, asserted by whoever entered it — not
    # derived from `created_at`. Tuesday's receipt gets typed in on Friday, so
    # the two are routinely different and only this one is the fact worth
    # reporting on. A bare DATE also needs no timezone conversion: orders are
    # UTC instants bucketed into shop-local time, this is already shop-local.
    spent_on: Mapped[date] = mapped_column(Date, index=True, nullable=False)

    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    description: Mapped[str] = mapped_column(String(200), nullable=False)
    note: Mapped[str | None] = mapped_column(Text)

    # RESTRICT, not SET NULL: a product without a category still lists and still
    # sells, but an expense without one is a hole in the report — it either
    # vanishes from the breakdown or needs an "Uncategorised" total nobody can
    # account for. Deleting a category in use is refused; retire it instead.
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("expense_categories.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )

    category: Mapped["ExpenseCategory"] = relationship(
        back_populates="expenses", lazy="selectin"
    )
