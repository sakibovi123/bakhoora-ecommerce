import uuid
from decimal import Decimal
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Query, status

from app.api.deps import (
    CategoriesManager,
    CategoriesViewer,
    CustomersManager,
    CustomersViewer,
    DashboardViewer,
    DbSession,
    OrdersManager,
    OrdersViewer,
    PageParams,
    ProductsManager,
    ProductsViewer,
    RolesManager,
    RolesViewer,
)
from app.models.category import Category
from app.models.order import Order, OrderStatus
from app.models.product import Product
from app.models.role import Role
from app.models.user import User
from app.schemas.admin import (
    CategoryReorder,
    CustomerDetail,
    CustomerUpdate,
    Dashboard,
    StockLineOut,
    StockUpdate,
)
from app.schemas.category import CategoryOut
from app.schemas.common import Page
from app.schemas.order import (
    ManualOrderRequest,
    OrderListItem,
    OrderOut,
    OrderStatusUpdate,
)
from app.schemas.product import ProductOut
from app.schemas.role import MenuOut, RoleCreate, RoleOut, RoleUpdate, menu_catalogue
from app.schemas.user import UserOut
from app.services import (
    admin_service,
    category_service,
    order_service,
    product_service,
    role_service,
)

router = APIRouter(prefix="/admin", tags=["admin"])


# --- dashboard -------------------------------------------------------------

@router.get("/stats")
async def stats(db: DbSession, _: DashboardViewer) -> dict[str, Any]:
    """Bare counters. `/admin/dashboard` is what the panel actually renders."""
    return await order_service.dashboard_stats(db)


@router.get("/dashboard", response_model=Dashboard)
async def dashboard(
    db: DbSession,
    _: DashboardViewer,
    days: Annotated[int, Query(ge=7, le=90)] = 14,
) -> Dashboard:
    return await admin_service.dashboard(db, days=days)


# --- catalogue -------------------------------------------------------------

@router.get("/products", response_model=Page[ProductOut])
async def list_products(
    db: DbSession,
    params: PageParams,
    _: ProductsViewer,
    search: Annotated[str | None, Query(max_length=100)] = None,
    category: str | None = None,
    brand: str | None = None,
    min_price: Decimal | None = None,
    max_price: Decimal | None = None,
    featured: bool | None = None,
    low_stock: bool = False,
    active: bool | None = None,
    sort: Literal["newest", "oldest", "name", "price_asc", "price_desc"] = "newest",
) -> Page[ProductOut]:
    """Unlike the storefront listing this shows inactive products too."""
    items, total = await product_service.list_products(
        db,
        page=params.page,
        size=params.size,
        search=search,
        category_slug=category,
        brand=brand,
        min_price=min_price,
        max_price=max_price,
        featured=featured,
        low_stock=low_stock,
        sort=sort,
        include_inactive=True,
        is_active=active,
    )
    return Page.create(
        [ProductOut.model_validate(item) for item in items], total, params.page, params.size
    )


@router.get("/products/{product_id}", response_model=ProductOut)
async def get_product(product_id: uuid.UUID, db: DbSession, _: ProductsViewer) -> Product:
    """By id — the panel edits products whose slug may be about to change."""
    return await product_service.get_by_id(db, product_id)


@router.patch("/stock", response_model=list[StockLineOut])
async def set_stock(data: StockUpdate, db: DbSession, _: ProductsManager) -> list[StockLineOut]:
    variants = await admin_service.set_stock(db, data)
    return [
        StockLineOut(variant_id=v.id, sku=v.sku, stock_quantity=v.stock_quantity)
        for v in variants
    ]


@router.get("/categories", response_model=list[CategoryOut])
async def list_categories(db: DbSession, _: CategoriesViewer) -> list[Category]:
    return await category_service.list_categories(db, include_inactive=True)


@router.patch("/categories/reorder", response_model=list[CategoryOut])
async def reorder_categories(
    data: CategoryReorder, db: DbSession, _: CategoriesManager
) -> list[Category]:
    return await admin_service.reorder_categories(db, data)


# --- orders ----------------------------------------------------------------

@router.get("/orders", response_model=Page[OrderListItem])
async def list_orders(
    db: DbSession,
    params: PageParams,
    _: OrdersViewer,
    status: OrderStatus | None = None,
    search: str | None = None,
) -> Page[OrderListItem]:
    items, total = await order_service.list_orders(
        db, page=params.page, size=params.size, status=status, search=search
    )
    return Page.create(
        [OrderListItem.model_validate(item) for item in items], total, params.page, params.size
    )


@router.post("/orders", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
async def create_order(data: ManualOrderRequest, db: DbSession, _: OrdersManager) -> Order:
    """Take an order over the phone or at the counter.

    Reserves stock and lands in every report exactly like a checkout does.
    """
    return await order_service.create_manual(db, data)


@router.get("/orders/{order_id}", response_model=OrderOut)
async def get_order(order_id: uuid.UUID, db: DbSession, _: OrdersViewer) -> Order:
    return await order_service.get_order(db, order_id)


@router.patch("/orders/{order_id}", response_model=OrderOut)
async def update_order(
    order_id: uuid.UUID, data: OrderStatusUpdate, db: DbSession, _: OrdersManager
) -> Order:
    return await order_service.update_status(db, order_id, data)


# --- customers -------------------------------------------------------------

@router.get("/users", response_model=Page[UserOut])
async def list_users(
    db: DbSession,
    params: PageParams,
    _: CustomersViewer,
    search: Annotated[str | None, Query(max_length=100)] = None,
    role: Annotated[str | None, Query(description="Role slug")] = None,
    staff: Annotated[
        bool | None, Query(description="Only accounts that may open the panel")
    ] = None,
    is_active: bool | None = None,
) -> Page[UserOut]:
    items, total = await admin_service.list_users(
        db,
        page=params.page,
        size=params.size,
        search=search,
        role_slug=role,
        staff=staff,
        is_active=is_active,
    )
    return Page.create(
        [UserOut.model_validate(user) for user in items], total, params.page, params.size
    )


@router.get("/users/{user_id}", response_model=CustomerDetail)
async def get_user(user_id: uuid.UUID, db: DbSession, _: CustomersViewer) -> CustomerDetail:
    return await admin_service.customer_detail(db, user_id)


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: uuid.UUID, data: CustomerUpdate, db: DbSession, admin: CustomersManager
) -> User:
    return await admin_service.update_customer(db, user_id, data, acting_admin=admin)


# --- roles and access ------------------------------------------------------

@router.get("/menus", response_model=list[MenuOut])
async def list_menus(_: RolesViewer) -> list[MenuOut]:
    """The panel's sections. Permissions are granted against these keys."""
    return menu_catalogue()


@router.get("/roles", response_model=list[RoleOut])
async def list_roles(db: DbSession, _: RolesViewer) -> list[RoleOut]:
    roles = await role_service.list_roles(db)
    counts = await role_service.user_counts(db)
    return [
        RoleOut(**RoleOut.model_validate(role).model_dump(exclude={"user_count"}),
                user_count=counts.get(role.id, 0))
        for role in roles
    ]


@router.post("/roles", response_model=RoleOut, status_code=status.HTTP_201_CREATED)
async def create_role(data: RoleCreate, db: DbSession, _: RolesManager) -> Role:
    return await role_service.create(db, data)


@router.patch("/roles/{role_id}", response_model=RoleOut)
async def update_role(
    role_id: uuid.UUID, data: RoleUpdate, db: DbSession, _: RolesManager
) -> Role:
    return await role_service.update(db, role_id, data)


@router.delete("/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(role_id: uuid.UUID, db: DbSession, _: RolesManager) -> None:
    await role_service.delete(db, role_id)
