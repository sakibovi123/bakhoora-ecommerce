import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.product import Product


class Combo(UUIDMixin, TimestampMixin, Base):
    """A bundle of whole perfumes sold together at one flat price.

    A combo holds *products*, not sizes. The size is chosen once for the whole
    bundle (see `ComboSize`), so "Everyday Fresh 5" at 6ml and the same five
    oils at 10ml are two priced options on one combo rather than two combos.
    That is how the campaign sheet describes them, and it is also what keeps
    the stock arithmetic honest: every size option resolves to the same set of
    products, just at a different bottle.

    Nothing about a combo is a copy of its contents. It carries no stock of its
    own — what can be sold is worked out from the component variants at the
    moment it is asked for, so a combo goes unavailable the minute one of its
    oils runs out rather than overselling a bottle that is not there.
    """

    __tablename__ = "combos"

    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    slug: Mapped[str] = mapped_column(String(220), unique=True, index=True, nullable=False)
    # "Everyday rotation" — the one line under the name on a card.
    tagline: Mapped[str | None] = mapped_column(String(300))
    description: Mapped[str | None] = mapped_column(Text)
    # "Everyday / Fresh" — how the campaign groups the bundle. Free text rather
    # than a category FK: these are campaign labels that change with the season
    # and they do not group anything on the storefront.
    use_case: Mapped[str | None] = mapped_column(String(120))
    # "Best: Hot/humid weather." — the notes column on the campaign sheet.
    occasion: Mapped[str | None] = mapped_column(String(300))
    image_url: Mapped[str | None] = mapped_column(String(500))
    position: Mapped[int] = mapped_column(default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    items: Mapped[list["ComboItem"]] = relationship(
        back_populates="combo",
        cascade="all, delete-orphan",
        order_by="ComboItem.position",
    )
    sizes: Mapped[list["ComboSize"]] = relationship(
        back_populates="combo",
        cascade="all, delete-orphan",
        order_by="ComboSize.size_ml",
    )


class ComboItem(UUIDMixin, TimestampMixin, Base):
    """One perfume inside a combo, in the order the campaign lists it.

    The foreign key is RESTRICT rather than CASCADE on purpose. Deleting an oil
    that a live campaign is built on must not quietly turn a five-oil bundle
    into a four-oil one that keeps selling at the five-oil price; the catalogue
    refuses the delete and names the combos instead.
    """

    __tablename__ = "combo_items"
    __table_args__ = (UniqueConstraint("combo_id", "product_id", name="uq_combo_item_product"),)

    combo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("combos.id", ondelete="CASCADE"), index=True, nullable=False
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    combo: Mapped["Combo"] = relationship(back_populates="items")
    product: Mapped["Product"] = relationship()


class ComboSize(UUIDMixin, TimestampMixin, Base):
    """The buyable thing: this whole bundle, at this bottle size, at this price.

    The price is flat and typed in by hand — it is a campaign number, not a sum
    of the parts, and nothing recalculates it when a component's price moves.
    `sku` is here because order lines snapshot it at checkout, the same reason
    `ProductVariant` carries one.
    """

    __tablename__ = "combo_sizes"
    __table_args__ = (UniqueConstraint("combo_id", "size_ml", name="uq_combo_size_ml"),)

    combo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("combos.id", ondelete="CASCADE"), index=True, nullable=False
    )
    size_ml: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    sku: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    combo: Mapped["Combo"] = relationship(back_populates="sizes")
