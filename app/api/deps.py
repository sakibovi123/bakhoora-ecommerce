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
from app.utils.menus import MANAGE, VIEW, Action, menu_label

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
OrdersManager = menu_guard("orders", MANAGE)
ProductsViewer = menu_guard("products")
ProductsManager = menu_guard("products", MANAGE)
CategoriesViewer = menu_guard("categories")
CategoriesManager = menu_guard("categories", MANAGE)
CustomersViewer = menu_guard("customers")
CustomersManager = menu_guard("customers", MANAGE)
RolesViewer = menu_guard("roles")
RolesManager = menu_guard("roles", MANAGE)


class Pagination:
    def __init__(
        self,
        page: int = Query(1, ge=1),
        size: int = Query(20, ge=1, le=100),
    ) -> None:
        self.page = page
        self.size = size


PageParams = Annotated[Pagination, Depends()]
