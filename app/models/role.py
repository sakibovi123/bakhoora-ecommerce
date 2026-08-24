import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin
from app.utils.menus import MANAGE, VIEW, Action

if TYPE_CHECKING:
    from app.models.user import User


class Role(UUIDMixin, TimestampMixin, Base):
    """What an account is allowed to do.

    Customers have one too — theirs simply carries no menus and `is_staff` off.
    """

    __tablename__ = "roles"

    name: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    # May this role open the admin panel at all? Menus refine it from there.
    is_staff: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Shipped with the product: renameable, but never deleted or un-staffed.
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    permissions: Mapped[list["RolePermission"]] = relationship(
        back_populates="role",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="RolePermission.menu",
    )
    users: Mapped[list["User"]] = relationship(back_populates="role")

    def allows(self, menu: str, action: Action = VIEW) -> bool:
        if not self.is_staff:
            return False
        for permission in self.permissions:
            if permission.menu != menu:
                continue
            return permission.can_manage if action == MANAGE else permission.can_view
        return False

    @property
    def menu_map(self) -> dict[str, list[str]]:
        """`{"orders": ["view", "manage"]}` — what the panel renders from."""
        granted: dict[str, list[str]] = {}
        if not self.is_staff:
            return granted
        for permission in self.permissions:
            actions = []
            if permission.can_view:
                actions.append(VIEW)
            if permission.can_manage:
                actions.append(MANAGE)
            if actions:
                granted[permission.menu] = actions
        return granted


class RolePermission(UUIDMixin, TimestampMixin, Base):
    """One row per (role, menu). Managing implies viewing — see the validator."""

    __tablename__ = "role_permissions"
    __table_args__ = (UniqueConstraint("role_id", "menu", name="uq_role_permission_menu"),)

    role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"), index=True, nullable=False
    )
    menu: Mapped[str] = mapped_column(String(40), nullable=False)
    can_view: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    can_manage: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    role: Mapped["Role"] = relationship(back_populates="permissions")
