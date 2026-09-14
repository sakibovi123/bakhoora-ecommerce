import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import CheckConstraint, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.combo import ComboSize
    from app.models.product import ProductVariant
    from app.models.user import User


class Cart(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "carts"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        index=True,
        nullable=False,
    )

    user: Mapped["User"] = relationship(back_populates="cart")
    items: Mapped[list["CartItem"]] = relationship(
        back_populates="cart", cascade="all, delete-orphan"
    )


class CartItem(UUIDMixin, TimestampMixin, Base):
    """One line in a basket: either a single bottle, or a whole combo.

    The two are mutually exclusive and the check constraint says so, rather
    than leaving "both set" or "neither set" as states the serialiser has to
    guess at. Postgres treats NULLs as distinct in a unique index, so the two
    uniqueness rules coexist on one table: a product line cannot collide with a
    combo line, and adding the same thing twice still merges into one row.
    """

    __tablename__ = "cart_items"
    __table_args__ = (
        UniqueConstraint("cart_id", "variant_id", name="uq_cart_item_variant"),
        UniqueConstraint("cart_id", "combo_size_id", name="uq_cart_item_combo_size"),
        CheckConstraint(
            "(variant_id IS NULL) <> (combo_size_id IS NULL)",
            name="ck_cart_item_one_kind",
        ),
    )

    cart_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("carts.id", ondelete="CASCADE"), index=True, nullable=False
    )
    variant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("product_variants.id", ondelete="CASCADE"),
        index=True,
    )
    combo_size_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("combo_sizes.id", ondelete="CASCADE"),
        index=True,
    )
    quantity: Mapped[int] = mapped_column(default=1, nullable=False)

    cart: Mapped["Cart"] = relationship(back_populates="items")
    variant: Mapped[Optional["ProductVariant"]] = relationship()
    combo_size: Mapped[Optional["ComboSize"]] = relationship()
