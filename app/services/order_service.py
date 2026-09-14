import secrets
import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import delete as sql_delete
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import cache
from app.core.config import settings
from app.core.exceptions import (
    BusinessRuleError,
    NotFoundError,
    OutOfStockError,
    PermissionDeniedError,
)
from app.models.cart import CartItem
from app.models.combo import Combo, ComboItem, ComboSize
from app.models.order import (
    TERMINAL_PAYMENT_STATUSES,
    Order,
    OrderItem,
    OrderItemComponent,
    OrderStatus,
    PaymentStatus,
)
from app.models.payment import Payment
from app.models.product import Product, ProductVariant
from app.models.user import User
from app.payments import get_provider
from app.payments.base import PaymentIntent
from app.schemas.order import (
    CheckoutRequest,
    ManualOrderLine,
    ManualOrderRequest,
    OrderEditRequest,
    OrderStatusUpdate,
    PaymentRecord,
)
from app.services import cart_service, settings_service, user_service
from app.utils.sizes import combo_size_label, size_label

RESTOCKING_STATUSES = {OrderStatus.CANCELLED, OrderStatus.REFUNDED}

# Statuses in which the shop is still holding this order's stock, so deleting it
# has to hand the stock back. The two in RESTOCKING_STATUSES already gave it
# back; SHIPPED and DELIVERED sent the goods out of the building, and deleting
# the paperwork must not conjure them back onto the shelf.
STOCK_HELD_STATUSES = {
    OrderStatus.PENDING,
    OrderStatus.CONFIRMED,
    OrderStatus.PROCESSING,
}

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


# --- selling a combo -------------------------------------------------------
#
# A combo is one priced line that reserves several bottles. Both the storefront
# checkout and the counter order build one the same way, through the three
# helpers below, so a bundle sold over the phone reserves stock and snapshots
# its contents exactly as one sold online does.


_LOAD_COMBO_SIZE = (
    selectinload(ComboSize.combo)
    .selectinload(Combo.items)
    .selectinload(ComboItem.product)
    .selectinload(Product.images),
)


async def _load_combo_sizes(
    db: AsyncSession, size_ids: set[uuid.UUID]
) -> dict[uuid.UUID, ComboSize]:
    if not size_ids:
        return {}
    rows = await db.scalars(
        select(ComboSize).where(ComboSize.id.in_(size_ids)).options(*_LOAD_COMBO_SIZE)
    )
    return {size.id: size for size in rows}


async def _bottle_ids(db: AsyncSession, sizes: list[ComboSize]) -> set[uuid.UUID]:
    """Which variants these combos will need, so they can be locked with the rest.

    Read without a lock on purpose: this only decides *what* to lock. The row
    that comes back from the locking select below is the one the arithmetic uses,
    and a variant that disappeared in between is simply absent from it and fails
    the same check a missing one always did.
    """
    if not sizes:
        return set()
    rows = await db.scalars(
        select(ProductVariant.id).where(
            ProductVariant.product_id.in_(
                {entry.product_id for size in sizes for entry in size.combo.items}
            ),
            ProductVariant.size_ml.in_({size.size_ml for size in sizes}),
        )
    )
    return set(rows)


def _by_product_size(
    variants: dict[uuid.UUID, ProductVariant],
) -> dict[tuple[uuid.UUID, int], ProductVariant]:
    """The locked variants re-keyed the way a combo asks for them."""
    return {(variant.product_id, variant.size_ml): variant for variant in variants.values()}


def _take_combo(
    size: ComboSize,
    bottles: dict[tuple[uuid.UUID, int], ProductVariant],
    quantity: int,
    unit_price: Decimal,
) -> tuple[OrderItem, Decimal]:
    """Reserve every bottle in one combo and build the line that records it.

    Stock comes off the components; the money sits on the parent line alone.
    The components are snapshotted here rather than looked up later because the
    campaign can be edited afterwards, and a cancellation has to put back what
    actually went out, not what the combo holds today.
    """
    combo = size.combo
    if not combo.items:
        raise BusinessRuleError(f"“{combo.name}” has no perfumes in it")

    components: list[OrderItemComponent] = []
    for entry in combo.items:
        variant = bottles.get((entry.product_id, size.size_ml))
        # `entry.product` rather than `variant.product`: they are the same row,
        # and the combo's copy is already loaded. Reaching through the variant
        # would lazy-load inside async and blow up on the greenlet, because the
        # locking select deliberately fetches nothing but the variants.
        if variant is None or not variant.is_active or not entry.product.is_active:
            raise BusinessRuleError(
                f"{entry.product.name} is not available in {size_label(size.size_ml)}, "
                f"so “{combo.name}” cannot be made up"
            )
        if variant.stock_quantity < quantity:
            raise OutOfStockError(
                f"Only {variant.stock_quantity} left of {entry.product.name} "
                f"({variant.name}), which “{combo.name}” needs"
            )
        variant.stock_quantity -= quantity
        components.append(
            OrderItemComponent(
                variant_id=variant.id,
                product_name=entry.product.name,
                variant_name=variant.name,
                sku=variant.sku,
                position=entry.position,
                quantity=1,
            )
        )

    line_total = unit_price * quantity
    thumbnail = combo.image_url or next(
        (
            cart_service.primary_image(entry.product)
            for entry in combo.items
            if entry.product.images
        ),
        None,
    )
    return (
        OrderItem(
            variant_id=None,
            combo_id=combo.id,
            product_name=combo.name,
            variant_name=combo_size_label(len(combo.items), size.size_ml),
            sku=size.sku,
            image_url=thumbnail,
            unit_price=unit_price,
            quantity=quantity,
            line_total=line_total,
            components=components,
        ),
        line_total,
    )


async def checkout(
    db: AsyncSession, user: User, data: CheckoutRequest
) -> tuple[Order, PaymentIntent]:
    provider = get_provider(data.payment_method)
    address = await _resolve_address(db, user, data)

    cart = await cart_service.get_or_create_cart(db, user.id)
    items = await cart_service.load_items(db, cart.id)
    if not items:
        raise BusinessRuleError("Your cart is empty")

    # A combo line reserves the bottles inside it, so those have to be locked
    # alongside the ones the basket names directly — otherwise two people could
    # each take the last Bleu de Chanel, one on its own and one inside a bundle.
    sizes = await _load_combo_sizes(
        db, {item.combo_size_id for item in items if item.combo_size_id is not None}
    )
    wanted = {item.variant_id for item in items if item.variant_id is not None}
    wanted |= await _bottle_ids(db, list(sizes.values()))

    # Lock every variant this order touches for the length of the transaction.
    locked = await db.scalars(
        select(ProductVariant).where(ProductVariant.id.in_(wanted)).with_for_update()
    )
    variants = {variant.id: variant for variant in locked}
    bottles = _by_product_size(variants)

    subtotal = Decimal("0.00")
    order_items: list[OrderItem] = []

    for item in items:
        if item.combo_size_id is not None:
            size = sizes.get(item.combo_size_id)
            if size is None or not size.is_active or not size.combo.is_active:
                raise BusinessRuleError("A combo in your cart is no longer available")
            line, line_total = _take_combo(size, bottles, item.quantity, size.price)
            order_items.append(line)
            subtotal += line_total
            continue

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

    shop = await settings_service.get(db)
    shipping_fee = cart_service.calculate_shipping(subtotal, shop)
    total = subtotal + shipping_fee
    order = Order(
        order_number=_order_number(),
        user_id=user.id,
        status=OrderStatus.PENDING,
        payment_status=PaymentStatus.UNPAID,
        payment_method=provider.name,
        currency=shop.currency_code,
        subtotal=subtotal,
        shipping_fee=shipping_fee,
        discount_total=Decimal("0.00"),
        total=total,
        # Snapshotted here so the instruction the customer is given and the
        # figure the shop chases later can never drift apart.
        advance_required=shop.advance_for(total, shipping_fee),
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


async def _reserve_lines(
    db: AsyncSession, lines: list[ManualOrderLine]
) -> tuple[list[OrderItem], Decimal]:
    """Turn requested lines into snapshotted order items, taking the stock.

    Shared by `create_manual` and `edit_order` so the two cannot drift: an edit
    that priced or reserved differently from a create would be a quiet way for
    the same order to mean two things. Rows are locked FOR UPDATE and the
    decrements happen here, so a caller that raises afterwards rolls the whole
    reservation back with the transaction.

    An edit must put the order's current holding back *and flush it* before
    calling this, or the stock check below reads the pre-restock figure and
    refuses an edit the shelf can actually satisfy.
    """
    sizes = await _load_combo_sizes(
        db, {line.combo_size_id for line in lines if line.combo_size_id is not None}
    )
    unknown = {line.combo_size_id for line in lines if line.combo_size_id} - sizes.keys()
    if unknown:
        raise NotFoundError(f"{len(unknown)} of these combos no longer exist")

    wanted = {line.variant_id for line in lines if line.variant_id is not None}
    to_lock = wanted | await _bottle_ids(db, list(sizes.values()))
    locked = await db.scalars(
        select(ProductVariant)
        .where(ProductVariant.id.in_(to_lock))
        .options(selectinload(ProductVariant.product).selectinload(Product.images))
        .with_for_update()
    )
    variants = {variant.id: variant for variant in locked}
    bottles = _by_product_size(variants)

    missing = wanted - variants.keys()
    if missing:
        raise NotFoundError(f"{len(missing)} of these sizes no longer exist")

    subtotal = Decimal("0.00")
    order_items: list[OrderItem] = []

    # Keep the caller's order so the invoice reads the way it was entered.
    for line in lines:
        if line.combo_size_id is not None:
            size = sizes[line.combo_size_id]
            # A combo at the counter is haggled like anything else; the listed
            # campaign price is only the default.
            unit_price = line.unit_price if line.unit_price is not None else size.price
            item, line_total = _take_combo(size, bottles, line.quantity, unit_price)
            order_items.append(item)
            subtotal += line_total
            continue

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
        # A phone order is often haggled. The listed price is the default, not
        # the rule — but whatever is charged is snapshotted onto the line, so
        # the invoice and every report agree with what was actually agreed.
        unit_price = line.unit_price if line.unit_price is not None else variant.price
        line_total = unit_price * line.quantity
        subtotal += line_total
        order_items.append(
            OrderItem(
                variant_id=variant.id,
                product_name=variant.product.name,
                variant_name=variant.name,
                sku=variant.sku,
                image_url=cart_service.primary_image(variant.product),
                unit_price=unit_price,
                quantity=line.quantity,
                line_total=line_total,
            )
        )

    return order_items, subtotal


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

    order_items, subtotal = await _reserve_lines(db, data.items)

    shop = await settings_service.get(db)
    shipping_fee = (
        data.shipping_fee
        if data.shipping_fee is not None
        else cart_service.calculate_shipping(subtotal, shop)
    )
    discount = data.discount_total or Decimal("0.00")
    if discount > subtotal + shipping_fee:
        raise BusinessRuleError("The discount is larger than the order")

    total = subtotal + shipping_fee - discount
    paid = data.amount_paid or Decimal("0.00")
    if paid > total:
        raise BusinessRuleError(
            f"Paid {paid} is more than the order total of {total}"
        )

    address = data.shipping_address.model_dump()
    address.pop("label", None)
    address.pop("is_default", None)

    order = Order(
        order_number=_order_number(),
        user_id=data.user_id,
        status=data.status or OrderStatus.PENDING,
        payment_status=PaymentStatus.UNPAID,
        payment_method=provider.name,
        currency=shop.currency_code,
        subtotal=subtotal,
        shipping_fee=shipping_fee,
        discount_total=discount,
        total=total,
        amount_paid=paid,
        # An order the shop keyed in by hand has already been agreed on the
        # phone, so it records what was actually taken rather than imposing the
        # storefront's advance rule after the fact.
        advance_required=Decimal("0.00"),
        customer_note=data.customer_note,
        admin_note=data.admin_note,
        items=order_items,
        **address,
    )
    db.add(order)
    await db.flush()

    intent = await provider.create_payment(order)
    order.payment_status = data.payment_status or intent.status

    # `payment_status: "paid"` with no figure is the desk saying "settled in
    # full" — honour it by moving the money, so the badge and the arithmetic
    # cannot tell different stories.
    if data.payment_status is PaymentStatus.PAID and data.amount_paid is None:
        order.amount_paid = order.total
    order.payment_status = order.derive_payment_status()

    # The provider's instruction, at the provider's own status — not the
    # order's. Stamping the order's status here is what would make a prepaid
    # order show an intent for the full total marked "paid" *and* a receipt for
    # the same money, reading as twice the takings in the payments ledger.
    # db.add with an explicit order_id here, rather than appending to
    # `order.payments` the way record_payment does. The order has just been
    # flushed and its payments collection was never loaded, so touching it
    # would fire a lazy load from async context and raise MissingGreenlet.
    # Nothing reads the collection before the reload, so a plain insert is
    # both safe and enough.
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
    if order.amount_paid > 0:
        # A receipt of its own, so the advance is a line in the ledger rather
        # than an unexplained number on the order.
        db.add(
            Payment(
                order_id=order.id,
                provider=provider.name,
                reference="Advance taken with the order",
                amount=order.amount_paid,
                currency=order.currency,
                status=PaymentStatus.PAID,
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
    """Put back everything this order is still holding.

    A combo line has no variant of its own — the bottles it reserved are on its
    `components`, snapshotted at the time — so it is restocked through those.
    Either way the quantity put back is what actually left: a line for two
    combos of five oils returns two of each bottle.
    """
    for item in order.items:
        if item.components:
            for component in item.components:
                await _return_stock(db, component.variant_id, item.quantity * component.quantity)
            continue
        await _return_stock(db, item.variant_id, item.quantity)


async def _return_stock(db: AsyncSession, variant_id: uuid.UUID | None, quantity: int) -> None:
    """One bottle back on the shelf. A variant deleted since is simply gone."""
    if variant_id is None:
        return
    variant = await db.get(ProductVariant, variant_id, with_for_update=True)
    if variant is not None:
        variant.stock_quantity += quantity


async def cancel_order(db: AsyncSession, order_id: uuid.UUID, user: User) -> Order:
    order = await get_order(db, order_id, user=user)
    if order.status not in {OrderStatus.PENDING, OrderStatus.CONFIRMED}:
        raise BusinessRuleError(f"An order that is {order.status.value} cannot be cancelled")
    await _restock(db, order)
    order.status = OrderStatus.CANCELLED
    await db.commit()
    return await get_order(db, order_id)


async def edit_order(db: AsyncSession, order_id: uuid.UUID, data: OrderEditRequest) -> Order:
    """Rewrite a placed order's lines, prices, charges and address.

    Only while the shop is still holding the stock for it — see
    STOCK_HELD_STATUSES. Once an order has shipped, its contents are a fact
    about a parcel that has left the building: "editing" one would move stock
    that is no longer on the shelf and restate revenue the reports have already
    counted. Cancelled and refunded orders have handed their stock back, so
    re-reserving against them would take it twice.

    The stock is rebuilt rather than diffed: everything the order holds goes
    back, then the new lines take what they need. A diff would have to reason
    about combos whose components changed underneath it, and would get the
    "same order, one more unit" case wrong whenever that unit was the last on
    the shelf. Both halves are one transaction, so a line the shelf cannot
    satisfy rolls the whole thing back and the order is untouched.
    """
    order = await get_order(db, order_id)
    if order.status not in STOCK_HELD_STATUSES:
        held = ", ".join(sorted(s.value for s in STOCK_HELD_STATUSES))
        raise BusinessRuleError(
            f"An order that is {order.status.value} can no longer be edited. "
            f"Only {held} orders can be — after that its contents are a record "
            f"of what was sent."
        )

    await _restock(db, order)
    # Explicit: the session runs with autoflush off, so without this the
    # SELECT ... FOR UPDATE inside `_reserve_lines` would read the shelf as it
    # was before the restock and refuse an edit it should allow.
    await db.flush()

    # Drop the old lines before the new ones are attached. delete-orphan takes
    # the rows, and each line's own cascade takes its combo components.
    order.items.clear()
    await db.flush()

    items, subtotal = await _reserve_lines(db, data.items)

    shop = await settings_service.get(db)
    shipping_fee = (
        data.shipping_fee
        if data.shipping_fee is not None
        else cart_service.calculate_shipping(subtotal, shop)
    )
    discount = data.discount_total or Decimal("0.00")
    if discount > subtotal + shipping_fee:
        raise BusinessRuleError("The discount is larger than the order")

    total = subtotal + shipping_fee - discount
    # Money already collected is a fact recorded against the order; an edit
    # changes what was bought, not what was handed over. Editing the order down
    # below that figure would leave the customer owing a negative amount, which
    # is a refund to be handled deliberately rather than implied by a form.
    if order.amount_paid > total:
        raise BusinessRuleError(
            f"{order.amount_paid} has already been collected on this order, so "
            f"it cannot be edited down to {total}. Refund the difference first."
        )

    address = data.shipping_address.model_dump()
    address.pop("label", None)
    address.pop("is_default", None)
    for field, value in address.items():
        setattr(order, field, value)

    order.items = items
    order.subtotal = subtotal
    order.shipping_fee = shipping_fee
    order.discount_total = discount
    order.total = total
    # Notes are left exactly as they were — see OrderEditRequest for why.
    # The badge is read off the money, so a part-paid order edited down to the
    # amount already collected reads as paid rather than staying "partial".
    order.payment_status = order.derive_payment_status()

    await db.commit()
    _after_history_rewrite()
    return await get_order(db, order_id)


async def _erase(db: AsyncSession, order: Order) -> None:
    """Drop one order, uncommitted. Items and payments go with it via the FK
    cascade; stock the shop is still holding for it goes back on the shelf."""
    if order.status in STOCK_HELD_STATUSES:
        await _restock(db, order)
    await db.delete(order)


def _after_history_rewrite() -> None:
    """Drop the archived reports too, not just the live ones.

    The ORM listener clears ORDERS and REPORTS for any order write, but not the
    archive shelf, on the reasoning that a *new* order can only land in a range
    that is still open. Two operations break that reasoning and must call this:
    deleting an order, which takes revenue out of a month that closed weeks ago,
    and editing one, which restates the total of an order already counted in a
    closed month. Both leave an archived report showing a figure that no longer
    exists anywhere in the database.
    """
    cache.invalidate(cache.REPORTS_ARCHIVE)


async def delete_order(db: AsyncSession, order_id: uuid.UUID) -> None:
    """Erase an order and everything hanging off it.

    This is for a mistake at the desk — a duplicate manual order, a test row —
    not for an order that fell through. An order the customer walked away from
    should be *cancelled*: that keeps the record and the reason. Deleting takes
    the order out of every report and out of the customer's history as though
    it had never been placed, which is why the panel asks twice.
    """
    order = await get_order(db, order_id)
    await _erase(db, order)
    await db.commit()
    _after_history_rewrite()


async def delete_orders(db: AsyncSession, order_ids: list[uuid.UUID]) -> int:
    """The same thing for a batch of ticked rows, in one transaction.

    Ids that are already gone are skipped rather than failing the batch: two
    people clearing up the same duplicates should not leave the second one
    staring at an error with nothing deleted. The count that comes back is what
    actually went, so the panel can say so.
    """
    orders = list(
        await db.scalars(select(Order).where(Order.id.in_(order_ids)))
    )
    for order in orders:
        await _erase(db, order)
    await db.commit()
    _after_history_rewrite()
    return len(orders)


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
        _apply_payment_status(order, data.payment_status)
    if data.admin_note is not None:
        order.admin_note = data.admin_note

    await db.commit()
    return await get_order(db, order_id)


def _apply_payment_status(order: Order, wanted: PaymentStatus) -> None:
    """Move the money to match a payment status the desk picked by hand.

    Without this the dropdown and the arithmetic drift apart: marking a
    900-taka-due order "paid" would leave 900 outstanding on the invoice
    forever. Settling in full is the common case and stays one click.
    """
    if wanted is PaymentStatus.PARTIAL:
        # "Partly paid" is not a thing you can assert — it is a consequence of
        # how much came in. Naming a figure is the only way to say it.
        raise BusinessRuleError(
            "Record a payment for the amount received instead of setting partial by hand"
        )
    if wanted is PaymentStatus.PAID:
        order.amount_paid = order.total
    elif wanted in {PaymentStatus.UNPAID, PaymentStatus.PENDING}:
        # Winding an order back to unpaid means the money never arrived.
        order.amount_paid = Decimal("0.00")

    order.payment_status = wanted
    if wanted not in TERMINAL_PAYMENT_STATUSES:
        order.payment_status = order.derive_payment_status()


async def record_payment(
    db: AsyncSession, order_id: uuid.UUID, data: PaymentRecord
) -> Order:
    """Take money against an order: the advance, or the rest on delivery.

    Locks the row for the read-modify-write. Two staff settling the same due
    from two tills would otherwise both read 900 outstanding and both add their
    collection to the same starting figure, and the order would end up showing
    money the shop never took.
    """
    order = await db.get(Order, order_id, with_for_update=True)
    if order is None:
        raise NotFoundError("Order not found")

    if order.status is OrderStatus.CANCELLED:
        raise BusinessRuleError("A cancelled order cannot take a payment")
    if order.payment_status in TERMINAL_PAYMENT_STATUSES:
        raise BusinessRuleError(
            f"This order is marked {order.payment_status.value}; "
            "reset the payment status before taking more money"
        )
    if data.amount > order.amount_due:
        raise BusinessRuleError(
            f"That is more than the {order.amount_due} still owed on this order"
        )

    order.amount_paid += data.amount
    order.payment_status = order.derive_payment_status()
    # Appended to the relationship rather than db.add()'d on its own: the
    # session runs expire_on_commit=False, so the Order in the identity map
    # keeps whatever `payments` it loaded a moment ago. A bare add writes the
    # row but leaves that collection stale, and the reload hands back the same
    # object — the receipt lands in the table and never reaches the screen.
    order.payments.append(
        Payment(
            provider=data.provider or order.payment_method,
            reference=data.reference,
            amount=data.amount,
            currency=order.currency,
            status=PaymentStatus.PAID,
        )
    )

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
