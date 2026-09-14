import uuid
from typing import Annotated

import jwt
from fastapi import Depends, Query
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import AuthenticationError, PermissionDeniedError
from app.core.security import decode_token
from app.db.session import get_db
from app.models.user import User
from app.utils.menus import ADMIN_ROLE_SLUG, MANAGE, VIEW, Action, menu_label

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_PREFIX}/auth/token", auto_error=False
)

DbSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(
    db: DbSession,
    token: Annotated[str | None, Depends(oauth2_scheme)],
) -> User:
    if not token:
        raise AuthenticationError("Not authenticated")
    try:
        payload = decode_token(token, "access")
    except jwt.ExpiredSignatureError as exc:
        raise AuthenticationError("Token has expired") from exc
    except jwt.PyJWTError as exc:
        raise AuthenticationError("Could not validate credentials") from exc

    user = await db.get(User, uuid.UUID(payload["sub"]))
    if user is None or not user.is_active:
        raise AuthenticationError("This account no longer exists or is disabled")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_current_admin(user: CurrentUser) -> User:
    """Signed in and allowed into the panel at all. Menus refine it further."""
    if not user.is_admin:
        raise PermissionDeniedError("Administrator access required")
    return user


AdminUser = Annotated[User, Depends(get_current_admin)]


async def get_administrator(user: AdminUser) -> User:
    """The `admin` role itself, not merely a role that can manage something.

    Deliberately not `menu_guard(..., MANAGE)`. "Manage" means *may move records
    forward in this menu* — a counter assistant given Orders/manage should be
    able to confirm an order, take a payment and mark it shipped, because that
    is the job. This guard is the narrower "is the owner", for the few actions
    where a mistake rewrites history rather than advancing it.

    Today that is exactly one thing: editing a placed order's lines and prices,
    which moves stock and restates a figure the reports have already counted.
    The check is on the slug rather than a permission flag on purpose — the
    point is that it cannot be handed out from the Roles screen.
    """
    if user.role is None or user.role.slug != ADMIN_ROLE_SLUG:
        raise PermissionDeniedError(
            f"Only an administrator can do that. Your role is {user.role.name}."
            if user.role
            else "Only an administrator can do that."
        )
    return user


Administrator = Annotated[User, Depends(get_administrator)]


def menu_guard(menu: str, action: Action = VIEW):
    """Dependency requiring one menu permission.

    The panel hides menus a role cannot use, but that is only cosmetics — every
    admin route carries the matching guard so a hidden menu is also a closed door.
    """

    async def dependency(user: AdminUser) -> User:
        if not user.can(menu, action):
            verb = "change anything in" if action == MANAGE else "open"
            raise PermissionDeniedError(
                f"Your role ({user.role.name}) cannot {verb} {menu_label(menu)}."
            )
        return user

    return Annotated[User, Depends(dependency)]


# One pair per menu, so a route reads as the permission it needs.
DashboardViewer = menu_guard("dashboard")
OrdersViewer = menu_guard("orders")
ReportsViewer = menu_guard("reports")
OrdersManager = menu_guard("orders", MANAGE)
ProductsViewer = menu_guard("products")
ProductsManager = menu_guard("products", MANAGE)
CategoriesViewer = menu_guard("categories")
CategoriesManager = menu_guard("categories", MANAGE)
CombosViewer = menu_guard("combos")
CombosManager = menu_guard("combos", MANAGE)
CustomersViewer = menu_guard("customers")
CustomersManager = menu_guard("customers", MANAGE)
RolesViewer = menu_guard("roles")
RolesManager = menu_guard("roles", MANAGE)
PricingViewer = menu_guard("pricing")
PricingManager = menu_guard("pricing", MANAGE)
ExpensesViewer = menu_guard("expenses")
ExpensesManager = menu_guard("expenses", MANAGE)
SettingsViewer = menu_guard("settings")
SettingsManager = menu_guard("settings", MANAGE)


class Pagination:
    def __init__(
        self,
        page: int = Query(1, ge=1),
        size: int = Query(20, ge=1, le=100),
    ) -> None:
        self.page = page
        self.size = size


PageParams = Annotated[Pagination, Depends()]
