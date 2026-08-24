"""Read models and bulk operations that exist only for the admin panel."""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import Select, distinct, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import BusinessRuleError, NotFoundError
from app.models.order import Order, OrderItem
from app.models.product import Product, ProductVariant
from app.models.role import Role
from app.models.user import User
from app.schemas.admin import (
    CategoryReorder,
    CustomerDetail,
    CustomerUpdate,
    Dashboard,
    DashboardCounters,
    LowStockVariant,
    RevenuePoint,
    StockUpdate,
    TopProduct,
)
from app.schemas.order import OrderListItem
from app.schemas.user import UserOut
from app.services import category_service, order_service, role_service

DEFAULT_SERIES_DAYS = 14
TOP_PRODUCT_LIMIT = 5
RECENT_ORDER_LIMIT = 8
LOW_STOCK_LIMIT = 12


# --- dashboard -------------------------------------------------------------

async def _counters(db: AsyncSession) -> DashboardCounters:
    base = await order_service.dashboard_stats(db)
    customers = await db.scalar(
        select(func.count())
        .select_from(User)
        .join(Role, Role.id == User.role_id)
        .where(Role.is_staff.is_(False))
    )
    products = await db.scalar(
        select(func.count()).select_from(Product).where(Product.is_active.is_(True))
    )
    return DashboardCounters(
        total_orders=base["total_orders"],
        pending_orders=base["pending_orders"],
        revenue=base["revenue"],
        low_stock_variants=base["low_stock_variants"],
        total_customers=customers or 0,
        active_products=products or 0,
        currency=settings.CURRENCY,
    )


async def _revenue_series(db: AsyncSession, days: int) -> list[RevenuePoint]:
    """One point per day, including the days nothing sold."""
    today = datetime.now(UTC).date()
    first = today - timedelta(days=days - 1)
    bucket = func.date_trunc("day", Order.created_at)

    rows = await db.execute(
        select(
            bucket.label("day"),
            func.count(Order.id).label("orders"),
            func.coalesce(
                func.sum(Order.total).filter(Order.status.in_(order_service.REVENUE_STATUSES)),
                0,
            ).label("revenue"),
        )
        .where(Order.created_at >= datetime.combine(first, datetime.min.time(), tzinfo=UTC))
        .group_by(bucket)
    )
    found = {
        row.day.date(): (row.orders, Decimal(row.revenue))
        for row in rows
    }
    return [
        RevenuePoint(
            day=day,
            orders=found.get(day, (0, Decimal("0")))[0],
            revenue=found.get(day, (0, Decimal("0")))[1],
        )
        for day in (first + timedelta(days=offset) for offset in range(days))
    ]


async def _top_products(db: AsyncSession) -> list[TopProduct]:
    """Ranked by units sold. Grouped by the snapshotted name so that products
    deleted since the sale still show up in the history."""
    units = func.sum(OrderItem.quantity)
    rows = await db.execute(
        select(
            OrderItem.product_name,
            # Postgres has no max(uuid), and the join is outer, so collect the
            # ids and pick a live one below.
            func.array_agg(distinct(ProductVariant.product_id)).label("product_ids"),
            units.label("units"),
            func.coalesce(func.sum(OrderItem.line_total), 0).label("revenue"),
        )
        .join(Order, Order.id == OrderItem.order_id)
        .outerjoin(ProductVariant, ProductVariant.id == OrderItem.variant_id)
        .where(Order.status.in_(order_service.REVENUE_STATUSES))
        .group_by(OrderItem.product_name)
        .order_by(units.desc())
        .limit(TOP_PRODUCT_LIMIT)
    )
    return [
        TopProduct(
            product_id=next((pid for pid in row.product_ids if pid), None),
            product_name=row.product_name,
            units=row.units,
            revenue=Decimal(row.revenue),
        )
        for row in rows
    ]


async def _low_stock(db: AsyncSession) -> list[LowStockVariant]:
    rows = await db.execute(
        select(ProductVariant, Product)
        .join(Product, Product.id == ProductVariant.product_id)
        .where(
            ProductVariant.stock_quantity <= settings.LOW_STOCK_THRESHOLD,
            ProductVariant.is_active.is_(True),
        )
        .order_by(ProductVariant.stock_quantity, Product.name)
        .limit(LOW_STOCK_LIMIT)
    )
    return [
        LowStockVariant(
            variant_id=variant.id,
            product_id=product.id,
            product_name=product.name,
            product_slug=product.slug,
            size_ml=variant.size_ml,
            sku=variant.sku,
            stock_quantity=variant.stock_quantity,
        )
        for variant, product in rows
    ]


async def dashboard(db: AsyncSession, *, days: int = DEFAULT_SERIES_DAYS) -> Dashboard:
    recent, _ = await order_service.list_orders(db, page=1, size=RECENT_ORDER_LIMIT)
    return Dashboard(
        counters=await _counters(db),
        revenue_series=await _revenue_series(db, days),
        top_products=await _top_products(db),
        recent_orders=[OrderListItem.model_validate(order) for order in recent],
        low_stock=await _low_stock(db),
    )


# --- stock -----------------------------------------------------------------

async def set_stock(db: AsyncSession, data: StockUpdate) -> list[ProductVariant]:
    """Absolute counts, not deltas — the panel edits numbers it just read."""
    wanted = {line.variant_id: line.stock_quantity for line in data.lines}
    if len(wanted) != len(data.lines):
        raise BusinessRuleError("The same variant appears twice in this update")

    variants = list(
        await db.scalars(select(ProductVariant).where(ProductVariant.id.in_(wanted)))
    )
    missing = wanted.keys() - {variant.id for variant in variants}
    if missing:
        raise NotFoundError(f"{len(missing)} of these variants no longer exist")

    for variant in variants:
        variant.stock_quantity = wanted[variant.id]
    await db.commit()
    return sorted(variants, key=lambda variant: variant.sku)


# --- customers -------------------------------------------------------------

def _user_filters(
    stmt: Select,
    search: str | None,
    role_slug: str | None,
    staff: bool | None,
    is_active: bool | None,
) -> Select:
    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.where(or_(User.full_name.ilike(term), User.email.ilike(term)))
    if role_slug or staff is not None:
        stmt = stmt.join(Role, Role.id == User.role_id)
        if role_slug:
            stmt = stmt.where(Role.slug == role_slug)
        if staff is not None:
            stmt = stmt.where(Role.is_staff.is_(staff))
    if is_active is not None:
        stmt = stmt.where(User.is_active.is_(is_active))
    return stmt


async def list_users(
    db: AsyncSession,
    *,
    page: int = 1,
    size: int = 20,
    search: str | None = None,
    role_slug: str | None = None,
    staff: bool | None = None,
    is_active: bool | None = None,
) -> tuple[list[User], int]:
    stmt = _user_filters(select(User), search, role_slug, staff, is_active)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = await db.scalars(
        stmt.order_by(User.created_at.desc()).offset((page - 1) * size).limit(size)
    )
    return list(rows), total


async def _get_user(db: AsyncSession, user_id: uuid.UUID) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise NotFoundError("Customer not found")
    return user


async def customer_detail(db: AsyncSession, user_id: uuid.UUID) -> CustomerDetail:
    user = await _get_user(db, user_id)
    orders, count = await order_service.list_orders(db, page=1, size=50, user_id=user_id)
    lifetime = await db.scalar(
        select(func.coalesce(func.sum(Order.total), 0)).where(
            Order.user_id == user_id,
            Order.status.in_(order_service.REVENUE_STATUSES),
        )
    )
    return CustomerDetail(
        user=UserOut.model_validate(user),
        order_count=count,
        lifetime_value=Decimal(lifetime or 0),
        currency=settings.CURRENCY,
        last_order_at=orders[0].created_at if orders else None,
        orders=[OrderListItem.model_validate(order) for order in orders],
    )


async def _other_active_staff(db: AsyncSession, exclude_id: uuid.UUID) -> int:
    return await db.scalar(
        select(func.count())
        .select_from(User)
        .join(Role, Role.id == User.role_id)
        .where(Role.is_staff.is_(True), User.is_active.is_(True), User.id != exclude_id)
    ) or 0


async def update_customer(
    db: AsyncSession, user_id: uuid.UUID, data: CustomerUpdate, *, acting_admin: User
) -> User:
    user = await _get_user(db, user_id)
    values = data.model_dump(exclude_unset=True)

    new_role = None
    if values.get("role_id") is not None:
        new_role = await role_service.get_by_id(db, values["role_id"])

    losing_panel_access = (
        values.get("is_active") is False
        or (new_role is not None and not new_role.is_staff)
    )

    # Locking yourself out of the panel is never the intent.
    if user.id == acting_admin.id and losing_panel_access:
        raise BusinessRuleError(
            "You cannot remove your own access. Ask another administrator to do it."
        )

    # Nor is leaving the shop with nobody who can get in.
    if user.is_admin and losing_panel_access and not await _other_active_staff(db, user.id):
        raise BusinessRuleError(
            "This is the last account that can open the admin panel."
        )

    for field, value in values.items():
        setattr(user, field, value)
    await db.commit()
    await db.refresh(user)
    return user


# --- categories ------------------------------------------------------------

async def reorder_categories(db: AsyncSession, data: CategoryReorder) -> list:
    positions = {item.id: item.position for item in data.items}
    if len(positions) != len(data.items):
        raise BusinessRuleError("The same category appears twice in this update")

    categories = await category_service.list_categories(db, include_inactive=True)
    known = {category.id for category in categories}
    if positions.keys() - known:
        raise NotFoundError("One of these categories no longer exists")

    for category in categories:
        if category.id in positions:
            category.position = positions[category.id]
    await db.commit()
    return await category_service.list_categories(db, include_inactive=True)


__all__ = [
    "customer_detail",
    "dashboard",
    "list_users",
    "reorder_categories",
    "set_stock",
    "update_customer",
]
