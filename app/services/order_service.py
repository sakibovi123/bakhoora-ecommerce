import secrets
import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import delete as sql_delete
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.exceptions import (
    BusinessRuleError,
    NotFoundError,
    OutOfStockError,
    PermissionDeniedError,
)
from app.models.cart import CartItem
from app.models.order import Order, OrderItem, OrderStatus, PaymentStatus
from app.models.payment import Payment
from app.models.product import Product, ProductVariant
from app.models.user import User
from app.payments import get_provider
from app.payments.base import PaymentIntent
from app.schemas.order import CheckoutRequest, ManualOrderRequest, OrderStatusUpdate
from app.services import cart_service, user_service

RESTOCKING_STATUSES = {OrderStatus.CANCELLED, OrderStatus.REFUNDED}

# Money is only counted once an order is past PENDING and not reversed.
REVENUE_STATUSES = (
    OrderStatus.CONFIRMED,
    OrderStatus.PROCESSING,
    OrderStatus.SHIPPED,
    OrderStatus.DELIVERED,
)

ALLOWED_TRANSITIONS: dict[OrderStatus, set[OrderStatus]] = {
    OrderStatus.PENDING: {OrderStatus.CONFIRMED, OrderStatus.CANCELLED},
    OrderStatus.CONFIRMED: {OrderStatus.PROCESSING, OrderStatus.CANCELLED},
    OrderStatus.PROCESSING: {OrderStatus.SHIPPED, OrderStatus.CANCELLED},
    OrderStatus.SHIPPED: {OrderStatus.DELIVERED, OrderStatus.REFUNDED},
    OrderStatus.DELIVERED: {OrderStatus.REFUNDED},
    OrderStatus.CANCELLED: set(),
    OrderStatus.REFUNDED: set(),
}


def _order_number() -> str:
    return f"BKH-{datetime.now(UTC):%y%m%d}-{secrets.token_hex(3).upper()}"


async def _resolve_address(db: AsyncSession, user: User, data: CheckoutRequest) -> dict[str, object]:
    if data.address_id is not None:
        address = await user_service.get_address(db, user.id, data.address_id)
        return {
            "recipient_name": address.recipient_name,
            "phone": address.phone,
            "line1": address.line1,
            "line2": address.line2,
            "city": address.city,
            "district": address.district,
            "postal_code": address.postal_code,
            "country": address.country,
        }
    assert data.shipping_address is not None
    payload = data.shipping_address.model_dump()
    payload.pop("label", None)
    payload.pop("is_default", None)
    return payload


async def checkout(
    db: AsyncSession, user: User, data: CheckoutRequest
) -> tuple[Order, PaymentIntent]:
    provider = get_provider(data.payment_method)
    address = await _resolve_address(db, user, data)

    cart = await cart_service.get_or_create_cart(db, user.id)
    items = await cart_service.load_items(db, cart.id)
    if not items:
        raise BusinessRuleError("Your cart is empty")

    # Lock every variant in the cart for the length of this transaction.
    locked = await db.scalars(
        select(ProductVariant)
        .where(ProductVariant.id.in_([item.variant_id for item in items]))
        .with_for_update()
    )
    variants = {variant.id: variant for variant in locked}

    subtotal = Decimal("0.00")
    order_items: list[OrderItem] = []

    for item in items:
        variant = variants.get(item.variant_id)
        if variant is None or not variant.is_active:
            raise BusinessRuleError("An item in your cart is no longer available")
        if variant.stock_quantity < item.quantity:
            raise OutOfStockError(
                f"Only {variant.stock_quantity} left of "
                f"{item.variant.product.name} ({variant.name})"
            )
        variant.stock_quantity -= item.quantity
        line_total = variant.price * item.quantity
        subtotal += line_total
        order_items.append(
            OrderItem(
                variant_id=variant.id,
                product_name=item.variant.product.name,
                variant_name=variant.name,
                sku=variant.sku,
                image_url=cart_service.primary_image(item.variant.product),
                unit_price=variant.price,
                quantity=item.quantity,
                line_total=line_total,
            )
        )

    shipping_fee = cart_service.calculate_shipping(subtotal)
    order = Order(
        order_number=_order_number(),
        user_id=user.id,
        status=OrderStatus.PENDING,
        payment_status=PaymentStatus.UNPAID,
        payment_method=provider.name,
        currency=settings.CURRENCY,
        subtotal=subtotal,
        shipping_fee=shipping_fee,
        discount_total=Decimal("0.00"),
        total=subtotal + shipping_fee,
        customer_note=data.customer_note,
        items=order_items,
        **address,
    )
    db.add(order)
    await db.flush()

    intent = await provider.create_payment(order)
    order.payment_status = intent.status
    db.add(
        Payment(
            order_id=order.id,
            provider=intent.provider,
            reference=intent.reference,
            amount=order.total,
            currency=order.currency,
            status=intent.status,
            raw_response=intent.raw_response,
        )
    )

    await db.execute(sql_delete(CartItem).where(CartItem.cart_id == cart.id))
    await db.commit()
    return await get_order(db, order.id), intent


async def create_manual(db: AsyncSession, data: ManualOrderRequest) -> Order:
    """Create an order the shop took by phone or at the counter.

    Deliberately built the same way `checkout` builds one — same row-level lock,
    same stock decrement, same snapshotted line items — so it is indistinguishable
    downstream. That is what makes it show up in the dashboard, the best sellers,
    the customer's history and the low-stock list without any of them knowing
    where it came from.
    """
    provider = get_provider(data.payment_method)

    if data.user_id is not None:
        customer = await db.get(User, data.user_id)
        if customer is None:
            raise NotFoundError("That customer account no longer exists")

    wanted = {line.variant_id: line.quantity for line in data.items}
    locked = await db.scalars(
        select(ProductVariant)
        .where(ProductVariant.id.in_(wanted))
        .options(selectinload(ProductVariant.product).selectinload(Product.images))
        .with_for_update()
    )
    variants = {variant.id: variant for variant in locked}

    missing = wanted.keys() - variants.keys()
    if missing:
        raise NotFoundError(f"{len(missing)} of these sizes no longer exist")

    subtotal = Decimal("0.00")
    order_items: list[OrderItem] = []

    # Keep the caller's order so the invoice reads the way it was entered.
    for line in data.items:
        variant = variants[line.variant_id]
        if not variant.is_active or not variant.product.is_active:
            raise BusinessRuleError(
                f"{variant.product.name} ({variant.name}) is not on sale"
            )
        if variant.stock_quantity < line.quantity:
            raise OutOfStockError(
                f"Only {variant.stock_quantity} left of "
                f"{variant.product.name} ({variant.name})"
            )
        variant.stock_quantity -= line.quantity
        line_total = variant.price * line.quantity
        subtotal += line_total
        order_items.append(
            OrderItem(
                variant_id=variant.id,
                product_name=variant.product.name,
                variant_name=variant.name,
                sku=variant.sku,
                image_url=cart_service.primary_image(variant.product),
                unit_price=variant.price,
                quantity=line.quantity,
                line_total=line_total,
            )
        )

    shipping_fee = (
        data.shipping_fee
        if data.shipping_fee is not None
        else cart_service.calculate_shipping(subtotal)
    )
    discount = data.discount_total or Decimal("0.00")
    if discount > subtotal + shipping_fee:
        raise BusinessRuleError("The discount is larger than the order")

    address = data.shipping_address.model_dump()
    address.pop("label", None)
    address.pop("is_default", None)

    order = Order(
        order_number=_order_number(),
        user_id=data.user_id,
        status=data.status or OrderStatus.PENDING,
        payment_status=PaymentStatus.UNPAID,
        payment_method=provider.name,
        currency=settings.CURRENCY,
        subtotal=subtotal,
        shipping_fee=shipping_fee,
        discount_total=discount,
        total=subtotal + shipping_fee - discount,
        customer_note=data.customer_note,
        admin_note=data.admin_note,
        items=order_items,
        **address,
    )
    db.add(order)
    await db.flush()

    intent = await provider.create_payment(order)
    order.payment_status = data.payment_status or intent.status
    db.add(
        Payment(
            order_id=order.id,
            provider=intent.provider,
            reference=intent.reference,
            amount=order.total,
            currency=order.currency,
            status=order.payment_status,
            raw_response=intent.raw_response,
        )
    )

    await db.commit()
    return await get_order(db, order.id)


async def get_order(
    db: AsyncSession, order_id: uuid.UUID, *, user: User | None = None
) -> Order:
    order = await db.scalar(
        select(Order)
        .where(Order.id == order_id)
        .options(selectinload(Order.items), selectinload(Order.payments))
    )
    if order is None:
        raise NotFoundError("Order not found")
    if user is not None and not user.is_admin and order.user_id != user.id:
        raise PermissionDeniedError("This order belongs to someone else")
    return order


async def list_orders(
    db: AsyncSession,
    *,
    page: int = 1,
    size: int = 20,
    user_id: uuid.UUID | None = None,
    status: OrderStatus | None = None,
    search: str | None = None,
) -> tuple[list[Order], int]:
    stmt = select(Order)
    if user_id is not None:
        stmt = stmt.where(Order.user_id == user_id)
    if status is not None:
        stmt = stmt.where(Order.status == status)
    if search:
        stmt = stmt.where(Order.order_number.ilike(f"%{search.strip()}%"))

    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    result = await db.scalars(
        stmt.order_by(Order.created_at.desc()).offset((page - 1) * size).limit(size)
    )
    return list(result), total


async def _restock(db: AsyncSession, order: Order) -> None:
    for item in order.items:
        if item.variant_id is None:
            continue
        variant = await db.get(ProductVariant, item.variant_id, with_for_update=True)
        if variant is not None:
            variant.stock_quantity += item.quantity


async def cancel_order(db: AsyncSession, order_id: uuid.UUID, user: User) -> Order:
    order = await get_order(db, order_id, user=user)
    if order.status not in {OrderStatus.PENDING, OrderStatus.CONFIRMED}:
        raise BusinessRuleError(f"An order that is {order.status.value} cannot be cancelled")
    await _restock(db, order)
    order.status = OrderStatus.CANCELLED
    await db.commit()
    return await get_order(db, order_id)


async def update_status(
    db: AsyncSession, order_id: uuid.UUID, data: OrderStatusUpdate
) -> Order:
    order = await get_order(db, order_id)

    if data.status is not None and data.status != order.status:
        if data.status not in ALLOWED_TRANSITIONS[order.status]:
            raise BusinessRuleError(
                f"Cannot move an order from {order.status.value} to {data.status.value}"
            )
        if data.status in RESTOCKING_STATUSES and order.status not in RESTOCKING_STATUSES:
            await _restock(db, order)
        order.status = data.status

    if data.payment_status is not None:
        order.payment_status = data.payment_status
    if data.admin_note is not None:
        order.admin_note = data.admin_note

    await db.commit()
    return await get_order(db, order_id)


async def dashboard_stats(db: AsyncSession) -> dict[str, object]:
    total_orders = await db.scalar(select(func.count()).select_from(Order)) or 0
    pending = await db.scalar(
        select(func.count()).select_from(Order).where(Order.status == OrderStatus.PENDING)
    ) or 0
    revenue = await db.scalar(
        select(func.coalesce(func.sum(Order.total), 0)).where(Order.status.in_(REVENUE_STATUSES))
    ) or Decimal("0.00")
    low_stock = await db.scalar(
        select(func.count())
        .select_from(ProductVariant)
        .where(ProductVariant.stock_quantity <= settings.LOW_STOCK_THRESHOLD)
    ) or 0
    return {
        "total_orders": total_orders,
        "pending_orders": pending,
        "revenue": revenue,
        "low_stock_variants": low_stock,
        "currency": settings.CURRENCY,
    }
