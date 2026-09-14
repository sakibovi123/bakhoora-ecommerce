import uuid
from decimal import Decimal

from sqlalchemy import delete as sql_delete
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.exceptions import NotFoundError, OutOfStockError
from app.models.cart import Cart, CartItem
from app.models.combo import Combo, ComboItem, ComboSize
from app.models.product import Product, ProductVariant
from app.models.settings import ShopSettings
from app.schemas.cart import CartItemAdd, CartItemOut, CartItemUpdate, CartOut
from app.services import settings_service
from app.utils.sizes import combo_size_label

_LOAD_ITEM = (
    selectinload(CartItem.variant)
    .selectinload(ProductVariant.product)
    .selectinload(Product.images),
    # A combo line needs the whole bundle to price and describe itself: its
    # perfumes for the "what is in it" list, and their images for the thumbnail.
    selectinload(CartItem.combo_size)
    .selectinload(ComboSize.combo)
    .selectinload(Combo.items)
    .selectinload(ComboItem.product)
    .selectinload(Product.images),
)


def calculate_shipping(subtotal: Decimal, shop: ShopSettings) -> Decimal:
    """Delivery on a basket of this size, per the shop's own settings.

    Takes the settings row rather than reading it, so the one caller that
    already has it open does not fetch it twice inside a single checkout.
    """
    return shop.delivery_for(subtotal)


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
        .options(*_LOAD_ITEM)
        .order_by(CartItem.created_at)
    )
    return list(result)


def primary_image(product: Product) -> str | None:
    if not product.images:
        return None
    image = next((i for i in product.images if i.is_primary), product.images[0])
    return image.url


async def _combo_bottles(
    db: AsyncSession, items: list[CartItem]
) -> dict[uuid.UUID, list[ProductVariant | None]]:
    """The component bottles behind every combo line, keyed by cart item id.

    One query for the whole basket. Reading each combo's stock separately would
    be five round trips per line on a screen that redraws after every "+".
    A `None` in a list is a perfume with no bottle at that size, which is one of
    the ways a combo stops being sellable.
    """
    combo_lines = [item for item in items if item.combo_size_id is not None]
    if not combo_lines:
        return {}

    product_ids = {
        entry.product_id for item in combo_lines for entry in item.combo_size.combo.items
    }
    sizes = {item.combo_size.size_ml for item in combo_lines}
    rows = await db.scalars(
        select(ProductVariant)
        .where(
            ProductVariant.product_id.in_(product_ids),
            ProductVariant.size_ml.in_(sizes),
        )
        # `_sets_available` asks whether the perfume itself is still on sale, so
        # the product has to come with the variant — a lazy load here would be
        # a greenlet error rather than a slow query.
        .options(selectinload(ProductVariant.product))
    )
    index = {(variant.product_id, variant.size_ml): variant for variant in rows}

    return {
        item.id: [
            index.get((entry.product_id, item.combo_size.size_ml))
            for entry in item.combo_size.combo.items
        ]
        for item in combo_lines
    }


def _sets_available(combo: Combo, bottles: list[ProductVariant | None]) -> int:
    """How many of this bundle could be made up from what is on the shelf.

    The scarcest bottle decides. A missing, hidden or switched-off one means
    none at all rather than "ignore that oil and sell the rest".
    """
    if not bottles or not combo.is_active:
        return 0
    counts = []
    for variant in bottles:
        if variant is None or not variant.is_active or not variant.product.is_active:
            return 0
        counts.append(variant.stock_quantity)
    return min(counts) if counts else 0


def _combo_line(
    item: CartItem, bottles: list[ProductVariant | None]
) -> tuple[CartItemOut, Decimal]:
    size = item.combo_size
    combo = size.combo
    line_total = size.price * item.quantity
    sets = _sets_available(combo, bottles)
    return (
        CartItemOut(
            id=item.id,
            kind="combo",
            variant_id=None,
            combo_size_id=size.id,
            # The combo's own id. A combo line has no product behind it, and the
            # `kind` field is what tells a caller which of the two this is.
            product_id=combo.id,
            product_name=combo.name,
            product_slug=combo.slug,
            variant_name=combo_size_label(len(combo.items), size.size_ml),
            sku=size.sku,
            image_url=combo.image_url
            or next(
                (primary_image(entry.product) for entry in combo.items if entry.product.images),
                None,
            ),
            unit_price=size.price,
            quantity=item.quantity,
            line_total=line_total,
            stock_quantity=sets,
            is_available=size.is_active and sets >= item.quantity,
            components=[entry.product.name for entry in combo.items],
        ),
        line_total,
    )


def _product_line(item: CartItem) -> tuple[CartItemOut, Decimal]:
    variant = item.variant
    product = variant.product
    line_total = variant.price * item.quantity
    return (
        CartItemOut(
            id=item.id,
            kind="product",
            variant_id=variant.id,
            combo_size_id=None,
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
        ),
        line_total,
    )


async def serialize_cart(
    db: AsyncSession, cart: Cart, items: list[CartItem], shop: ShopSettings
) -> CartOut:
    bottles = await _combo_bottles(db, items)
    rows: list[CartItemOut] = []
    subtotal = Decimal("0.00")

    for item in items:
        row, line_total = (
            _combo_line(item, bottles.get(item.id, []))
            if item.combo_size_id is not None
            else _product_line(item)
        )
        rows.append(row)
        subtotal += line_total

    shipping = calculate_shipping(subtotal, shop)
    return CartOut(
        id=cart.id,
        items=rows,
        item_count=sum(r.quantity for r in rows),
        subtotal=subtotal,
        shipping_fee=shipping,
        total=subtotal + shipping,
        currency=shop.currency_code,
    )


async def _current(db: AsyncSession, cart: Cart) -> CartOut:
    """The basket as it stands now. Every mutation returns through here."""
    return await serialize_cart(
        db, cart, await load_items(db, cart.id), await settings_service.get(db)
    )


async def get_cart(db: AsyncSession, user_id: uuid.UUID) -> CartOut:
    cart = await get_or_create_cart(db, user_id)
    return await _current(db, cart)


async def _add_variant(
    db: AsyncSession, cart: Cart, variant_id: uuid.UUID, quantity: int
) -> None:
    variant = await db.scalar(
        select(ProductVariant)
        .where(ProductVariant.id == variant_id)
        .options(selectinload(ProductVariant.product))
    )
    if variant is None or not variant.is_active or not variant.product.is_active:
        raise NotFoundError("This product option is not available")

    item = await db.scalar(
        select(CartItem).where(CartItem.cart_id == cart.id, CartItem.variant_id == variant.id)
    )
    wanted = quantity + (item.quantity if item else 0)
    if wanted > variant.stock_quantity:
        raise OutOfStockError(
            f"Only {variant.stock_quantity} left of {variant.product.name} ({variant.name})"
        )

    if item is None:
        db.add(CartItem(cart_id=cart.id, variant_id=variant.id, quantity=quantity))
    else:
        item.quantity = wanted


async def _add_combo(
    db: AsyncSession, cart: Cart, combo_size_id: uuid.UUID, quantity: int
) -> None:
    """Put a whole bundle in the basket, capped by its scarcest bottle.

    Nothing is reserved here — a basket holds no stock, exactly as it does for a
    single bottle — but the cap is checked now so the customer is told at the
    "add" rather than at the till.
    """
    size = await db.scalar(
        select(ComboSize)
        .where(ComboSize.id == combo_size_id)
        .options(
            selectinload(ComboSize.combo)
            .selectinload(Combo.items)
            .selectinload(ComboItem.product)
        )
    )
    if size is None or not size.is_active or not size.combo.is_active:
        raise NotFoundError("This combo is not available")

    bottles = await db.scalars(
        select(ProductVariant)
        .where(
            ProductVariant.product_id.in_([e.product_id for e in size.combo.items]),
            ProductVariant.size_ml == size.size_ml,
        )
        .options(selectinload(ProductVariant.product))
    )
    index = {variant.product_id: variant for variant in bottles}
    sets = _sets_available(
        size.combo, [index.get(entry.product_id) for entry in size.combo.items]
    )

    item = await db.scalar(
        select(CartItem).where(
            CartItem.cart_id == cart.id, CartItem.combo_size_id == size.id
        )
    )
    wanted = quantity + (item.quantity if item else 0)
    if wanted > sets:
        raise OutOfStockError(_short_of(size.combo.name, sets))

    if item is None:
        db.add(CartItem(cart_id=cart.id, combo_size_id=size.id, quantity=quantity))
    else:
        item.quantity = wanted


def _short_of(name: str, sets: int) -> str:
    if sets <= 0:
        return f"“{name}” cannot be made up right now — one of its perfumes is out of stock"
    return f"Only {sets} of “{name}” can be made up from stock on hand"


async def add_item(db: AsyncSession, user_id: uuid.UUID, data: CartItemAdd) -> CartOut:
    cart = await get_or_create_cart(db, user_id)
    if data.combo_size_id is not None:
        await _add_combo(db, cart, data.combo_size_id, data.quantity)
    else:
        assert data.variant_id is not None  # the schema allows nothing else
        await _add_variant(db, cart, data.variant_id, data.quantity)
    await db.commit()
    return await _current(db, cart)


async def _get_item(db: AsyncSession, cart_id: uuid.UUID, item_id: uuid.UUID) -> CartItem:
    item = await db.scalar(
        select(CartItem)
        .where(CartItem.id == item_id, CartItem.cart_id == cart_id)
        .options(*_LOAD_ITEM)
    )
    if item is None:
        raise NotFoundError("Cart item not found")
    return item


async def update_item(
    db: AsyncSession, user_id: uuid.UUID, item_id: uuid.UUID, data: CartItemUpdate
) -> CartOut:
    cart = await get_or_create_cart(db, user_id)
    item = await _get_item(db, cart.id, item_id)

    if item.combo_size_id is not None:
        bottles = (await _combo_bottles(db, [item])).get(item.id, [])
        sets = _sets_available(item.combo_size.combo, bottles)
        if data.quantity > sets:
            raise OutOfStockError(_short_of(item.combo_size.combo.name, sets))
    elif data.quantity > item.variant.stock_quantity:
        raise OutOfStockError(f"Only {item.variant.stock_quantity} left in stock")

    item.quantity = data.quantity
    await db.commit()
    return await _current(db, cart)


async def remove_item(db: AsyncSession, user_id: uuid.UUID, item_id: uuid.UUID) -> CartOut:
    cart = await get_or_create_cart(db, user_id)
    item = await _get_item(db, cart.id, item_id)
    await db.delete(item)
    await db.commit()
    return await _current(db, cart)


async def clear_cart(db: AsyncSession, user_id: uuid.UUID) -> CartOut:
    cart = await get_or_create_cart(db, user_id)
    await db.execute(sql_delete(CartItem).where(CartItem.cart_id == cart.id))
    await db.commit()
    return await serialize_cart(db, cart, [], await settings_service.get(db))
