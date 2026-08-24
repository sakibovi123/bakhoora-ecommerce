import uuid
from decimal import Decimal

from sqlalchemy import delete as sql_delete
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.exceptions import NotFoundError, OutOfStockError
from app.models.cart import Cart, CartItem
from app.models.product import Product, ProductVariant
from app.schemas.cart import CartItemAdd, CartItemOut, CartItemUpdate, CartOut

_LOAD_ITEM = (
    selectinload(CartItem.variant)
    .selectinload(ProductVariant.product)
    .selectinload(Product.images)
)


def calculate_shipping(subtotal: Decimal) -> Decimal:
    if subtotal <= 0 or subtotal >= settings.FREE_SHIPPING_THRESHOLD:
        return Decimal("0.00")
    return Decimal(settings.SHIPPING_FLAT_FEE).quantize(Decimal("0.01"))


async def get_or_create_cart(db: AsyncSession, user_id: uuid.UUID) -> Cart:
    cart = await db.scalar(select(Cart).where(Cart.user_id == user_id))
    if cart is None:
        cart = Cart(user_id=user_id)
        db.add(cart)
        await db.commit()
        await db.refresh(cart)
    return cart


async def load_items(db: AsyncSession, cart_id: uuid.UUID) -> list[CartItem]:
    result = await db.scalars(
        select(CartItem)
        .where(CartItem.cart_id == cart_id)
        .options(_LOAD_ITEM)
        .order_by(CartItem.created_at)
    )
    return list(result)


def primary_image(product: Product) -> str | None:
    if not product.images:
        return None
    image = next((i for i in product.images if i.is_primary), product.images[0])
    return image.url


def serialize_cart(cart: Cart, items: list[CartItem]) -> CartOut:
    rows: list[CartItemOut] = []
    subtotal = Decimal("0.00")

    for item in items:
        variant = item.variant
        product = variant.product
        line_total = variant.price * item.quantity
        subtotal += line_total
        rows.append(
            CartItemOut(
                id=item.id,
                variant_id=variant.id,
                product_id=product.id,
                product_name=product.name,
                product_slug=product.slug,
                variant_name=variant.name,
                sku=variant.sku,
                image_url=primary_image(product),
                unit_price=variant.price,
                quantity=item.quantity,
                line_total=line_total,
                stock_quantity=variant.stock_quantity,
                is_available=(
                    product.is_active
                    and variant.is_active
                    and variant.stock_quantity >= item.quantity
                ),
            )
        )

    shipping = calculate_shipping(subtotal)
    return CartOut(
        id=cart.id,
        items=rows,
        item_count=sum(r.quantity for r in rows),
        subtotal=subtotal,
        shipping_fee=shipping,
        total=subtotal + shipping,
        currency=settings.CURRENCY,
    )


async def get_cart(db: AsyncSession, user_id: uuid.UUID) -> CartOut:
    cart = await get_or_create_cart(db, user_id)
    return serialize_cart(cart, await load_items(db, cart.id))


async def add_item(db: AsyncSession, user_id: uuid.UUID, data: CartItemAdd) -> CartOut:
    cart = await get_or_create_cart(db, user_id)

    variant = await db.scalar(
        select(ProductVariant)
        .where(ProductVariant.id == data.variant_id)
        .options(selectinload(ProductVariant.product))
    )
    if variant is None or not variant.is_active or not variant.product.is_active:
        raise NotFoundError("This product option is not available")

    item = await db.scalar(
        select(CartItem).where(CartItem.cart_id == cart.id, CartItem.variant_id == variant.id)
    )
    wanted = data.quantity + (item.quantity if item else 0)
    if wanted > variant.stock_quantity:
        raise OutOfStockError(
            f"Only {variant.stock_quantity} left of {variant.product.name} ({variant.name})"
        )

    if item is None:
        db.add(CartItem(cart_id=cart.id, variant_id=variant.id, quantity=data.quantity))
    else:
        item.quantity = wanted
    await db.commit()
    return serialize_cart(cart, await load_items(db, cart.id))


async def _get_item(db: AsyncSession, cart_id: uuid.UUID, item_id: uuid.UUID) -> CartItem:
    item = await db.scalar(
        select(CartItem)
        .where(CartItem.id == item_id, CartItem.cart_id == cart_id)
        .options(selectinload(CartItem.variant))
    )
    if item is None:
        raise NotFoundError("Cart item not found")
    return item


async def update_item(
    db: AsyncSession, user_id: uuid.UUID, item_id: uuid.UUID, data: CartItemUpdate
) -> CartOut:
    cart = await get_or_create_cart(db, user_id)
    item = await _get_item(db, cart.id, item_id)
    if data.quantity > item.variant.stock_quantity:
        raise OutOfStockError(f"Only {item.variant.stock_quantity} left in stock")
    item.quantity = data.quantity
    await db.commit()
    return serialize_cart(cart, await load_items(db, cart.id))


async def remove_item(db: AsyncSession, user_id: uuid.UUID, item_id: uuid.UUID) -> CartOut:
    cart = await get_or_create_cart(db, user_id)
    item = await _get_item(db, cart.id, item_id)
    await db.delete(item)
    await db.commit()
    return serialize_cart(cart, await load_items(db, cart.id))


async def clear_cart(db: AsyncSession, user_id: uuid.UUID) -> CartOut:
    cart = await get_or_create_cart(db, user_id)
    await db.execute(sql_delete(CartItem).where(CartItem.cart_id == cart.id))
    await db.commit()
    return serialize_cart(cart, [])
