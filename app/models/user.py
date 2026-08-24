import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin
from app.utils.menus import VIEW, Action

if TYPE_CHECKING:
    from app.models.address import Address
    from app.models.cart import Cart
    from app.models.order import Order
    from app.models.role import Role


class User(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20))
    # RESTRICT, not CASCADE: deleting a role must never delete the people in it.
    role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("roles.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Eager: every authenticated request asks what this user may do, and a lazy
    # load would raise MissingGreenlet under asyncio.
    role: Mapped["Role"] = relationship(back_populates="users", lazy="selectin")
    addresses: Mapped[list["Address"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )
    cart: Mapped[Optional["Cart"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", uselist=False
    )
    orders: Mapped[list["Order"]] = relationship(back_populates="user")

    @property
    def is_admin(self) -> bool:
        """May open the admin panel. Which menus is a separate question."""
        return bool(self.role and self.role.is_staff)

    def can(self, menu: str, action: Action = VIEW) -> bool:
        return bool(self.role and self.role.allows(menu, action))
