"""Demo orders, customers and payments — enough history to make the admin
dashboard show real shapes instead of empty axes.

Everything this writes is tagged so it can be removed again:
  * orders   -> order_number starts with DEMO_ORDER_PREFIX
  * customers-> email ends with DEMO_EMAIL_DOMAIN

    python -m app.db.seed_demo          # create (refuses if already present)
    python -m app.db.seed_demo --reset  # delete every tagged row, then stop
    python -m app.db.seed_demo --reset --seed   # delete, then recreate

The generator is deterministic: the same RANDOM_SEED always produces the same
history, so screenshots and test expectations stay stable between runs.
"""

import argparse
import asyncio
import random
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import delete, func, select

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import AsyncSessionLocal, engine
from app.models.order import Order, OrderItem, OrderStatus, PaymentStatus
from app.models.payment import Payment
from app.models.product import Product, ProductVariant
from app.models.role import Role
from app.models.user import User
from app.utils.menus import CUSTOMER_ROLE_SLUG

DEMO_ORDER_PREFIX = "BKH-DEMO-"
DEMO_EMAIL_DOMAIN = "@demo.bakhoora.bd"
DEMO_PASSWORD = "Customer123!"

# The dashboard's revenue chart covers admin_service.DEFAULT_SERIES_DAYS (14).
# Generating a longer window means the counters ("total orders", "revenue")
# include history that sits behind the chart, which is what a real shop looks
# like — the chart is a window, not the whole ledger.
HISTORY_DAYS = 45
RANDOM_SEED = 20260825

CUSTOMERS = [
    ("Ayesha Siddika", "ayesha.siddika", "+8801711000101", "Dhanmondi", "Dhaka"),
    ("Tanvir Hasan", "tanvir.hasan", "+8801711000102", "Gulshan 2", "Dhaka"),
    ("Nusrat Jahan", "nusrat.jahan", "+8801711000103", "Uttara Sector 7", "Dhaka"),
    ("Rafiqul Islam", "rafiqul.islam", "+8801711000104", "Agrabad", "Chattogram"),
    ("Sumaiya Akter", "sumaiya.akter", "+8801711000105", "Mirpur 10", "Dhaka"),
    ("Mahmudul Karim", "mahmudul.karim", "+8801711000106", "Zindabazar", "Sylhet"),
    ("Farhana Rahman", "farhana.rahman", "+8801711000107", "Banani", "Dhaka"),
    ("Imran Chowdhury", "imran.chowdhury", "+8801711000108", "Khulshi", "Chattogram"),
    ("Shirin Sultana", "shirin.sultana", "+8801711000109", "Bashundhara R/A", "Dhaka"),
    ("Ashraful Alam", "ashraful.alam", "+8801711000110", "Kotwali", "Rajshahi"),
    ("Marzia Haque", "marzia.haque", "+8801711000111", "Mohakhali", "Dhaka"),
    ("Sabbir Ahmed", "sabbir.ahmed", "+8801711000112", "Boalia", "Rajshahi"),
]

# Orders per day are drawn from this band. Weekends in Bangladesh are Fri/Sat
# (weekday 4/5) and run busier, which gives the chart a visible rhythm rather
# than uniform noise.
ORDERS_PER_DAY = (1, 4)
WEEKEND_BONUS = 2

PAYMENT_PROVIDERS = ("bkash", "nagad", "card", "cod")


def _order_number(sequence: int, moment: datetime) -> str:
    """Sequence, not randomness: order_number is UNIQUE, and four random hex
    digits collide inside a single day often enough to abort the run."""
    return f"{DEMO_ORDER_PREFIX}{moment:%y%m%d}-{sequence:04d}"


def _status_for(rng: random.Random, age_days: int) -> OrderStatus:
    """Old orders have finished their journey; today's have not started it.

    Mirrors order_service.ALLOWED_TRANSITIONS — nothing here is a state the
    real workflow could not have produced.
    """
    if age_days >= 10:
        return rng.choices(
            [OrderStatus.DELIVERED, OrderStatus.REFUNDED, OrderStatus.CANCELLED],
            weights=[88, 5, 7],
        )[0]
    if age_days >= 5:
        return rng.choices(
            [OrderStatus.DELIVERED, OrderStatus.SHIPPED, OrderStatus.CANCELLED],
            weights=[55, 38, 7],
        )[0]
    if age_days >= 2:
        return rng.choices(
            [OrderStatus.SHIPPED, OrderStatus.PROCESSING, OrderStatus.CONFIRMED],
            weights=[35, 45, 20],
        )[0]
    return rng.choices(
        [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PROCESSING],
        weights=[45, 35, 20],
    )[0]


def _payment_state(status: OrderStatus, method: str) -> PaymentStatus:
    if status is OrderStatus.REFUNDED:
        return PaymentStatus.REFUNDED
    if status is OrderStatus.CANCELLED:
        return PaymentStatus.FAILED
    if status is OrderStatus.PENDING:
        return PaymentStatus.PENDING if method != "cod" else PaymentStatus.UNPAID
    # Cash on delivery is only money once it is delivered.
    if method == "cod" and status is not OrderStatus.DELIVERED:
        return PaymentStatus.UNPAID
    return PaymentStatus.PAID


async def _tagged_counts(db) -> tuple[int, int]:
    orders = await db.scalar(
        select(func.count()).select_from(Order)
        .where(Order.order_number.like(f"{DEMO_ORDER_PREFIX}%"))
    )
    customers = await db.scalar(
        select(func.count()).select_from(User)
        .where(User.email.like(f"%{DEMO_EMAIL_DOMAIN}"))
    )
    return orders or 0, customers or 0


async def reset(db) -> None:
    """Remove only what this script created. order_items and payments go with
    the order via ON DELETE CASCADE."""
    orders, customers = await _tagged_counts(db)
    await db.execute(delete(Order).where(Order.order_number.like(f"{DEMO_ORDER_PREFIX}%")))
    await db.execute(delete(User).where(User.email.like(f"%{DEMO_EMAIL_DOMAIN}")))
    await db.commit()
    print(f"removed {orders} demo orders and {customers} demo customers")


async def _customers(db, rng: random.Random) -> list[User]:
    role = await db.scalar(select(Role).where(Role.slug == CUSTOMER_ROLE_SLUG))
    if role is None:
        raise SystemExit("no 'customer' role — run `python -m app.db.seed` first")

    # bcrypt is deliberately slow; one hash reused across demo accounts keeps
    # this script to a couple of seconds instead of half a minute.
    digest = hash_password(DEMO_PASSWORD)
    people = []
    for full_name, handle, phone, _area, _city in CUSTOMERS:
        user = User(
            email=f"{handle}{DEMO_EMAIL_DOMAIN}",
            hashed_password=digest,
            full_name=full_name,
            phone=phone,
            role_id=role.id,
            is_active=True,
        )
        # Customers exist before they order, otherwise "new customers this
        # week" style questions get nonsense answers later.
        age = rng.randint(HISTORY_DAYS, HISTORY_DAYS + 60)
        registered = datetime.now(UTC) - timedelta(days=age)
        user.created_at = registered
        user.updated_at = registered
        db.add(user)
        people.append(user)
    await db.flush()
    print(f"created {len(people)} demo customers (password: {DEMO_PASSWORD})")
    return people


async def seed(db, rng: random.Random) -> None:
    rows = (
        await db.execute(
            select(ProductVariant, Product)
            .join(Product, Product.id == ProductVariant.product_id)
            .where(ProductVariant.is_active.is_(True))
            .order_by(ProductVariant.sku)
        )
    ).all()
    if not rows:
        raise SystemExit("no product variants — run `python -m app.db.seed` first")

    people = await _customers(db, rng)

    # A real catalogue is not uniform: a few SKUs carry most of the volume, so
    # the "top products" table has something to rank.
    weights = [rng.choice([1, 1, 2, 3, 5, 8]) for _ in rows]
    sold: dict[ProductVariant, int] = {}

    today = datetime.now(UTC).date()
    orders_made = 0
    revenue = Decimal("0.00")

    for age_days in range(HISTORY_DAYS - 1, -1, -1):
        day = today - timedelta(days=age_days)
        count = rng.randint(*ORDERS_PER_DAY)
        if day.weekday() in (4, 5):
            count += rng.randint(0, WEEKEND_BONUS)

        for _ in range(count):
            moment = datetime.combine(
                day,
                datetime.min.time().replace(
                    hour=rng.randint(9, 22), minute=rng.randint(0, 59), second=rng.randint(0, 59)
                ),
                tzinfo=UTC,
            )
            customer = rng.choice(people)
            _name, _handle, phone, area, city = next(
                entry for entry in CUSTOMERS if entry[0] == customer.full_name
            )

            picks = rng.sample(rows, k=rng.choices([1, 2, 3], weights=[55, 32, 13])[0]) \
                if len(rows) >= 3 else rows[:1]
            # Re-weight the first line so popular SKUs lead most orders.
            picks[0] = rng.choices(rows, weights=weights)[0]

            status = _status_for(rng, age_days)
            method = rng.choices(PAYMENT_PROVIDERS, weights=[42, 23, 10, 25])[0]

            items, subtotal = [], Decimal("0.00")
            for variant, product in picks:
                quantity = rng.choices([1, 2, 3], weights=[70, 24, 6])[0]
                line_total = variant.price * quantity
                subtotal += line_total
                items.append(
                    OrderItem(
                        variant_id=variant.id,
                        product_name=product.name,
                        variant_name=variant.name,
                        sku=variant.sku,
                        image_url=f"https://placehold.co/800x800?text={product.slug}",
                        unit_price=variant.price,
                        quantity=quantity,
                        line_total=line_total,
                    )
                )
                if status in (
                    OrderStatus.CONFIRMED,
                    OrderStatus.PROCESSING,
                    OrderStatus.SHIPPED,
                    OrderStatus.DELIVERED,
                ):
                    sold[variant] = sold.get(variant, 0) + quantity

            shipping = (
                Decimal("0.00")
                if subtotal >= Decimal(str(settings.FREE_SHIPPING_THRESHOLD))
                else Decimal(str(settings.SHIPPING_FLAT_FEE))
            )
            total = subtotal + shipping
            payment_status = _payment_state(status, method)
            # Keep the money and the badge consistent: a seeded order marked
            # paid must carry the cash to match, or every demo invoice would
            # print a balance due for an order that owes nothing.
            settled = payment_status in (PaymentStatus.PAID, PaymentStatus.REFUNDED)

            order = Order(
                order_number=_order_number(orders_made + 1, moment),
                user_id=customer.id,
                status=status,
                payment_status=payment_status,
                payment_method=method,
                currency=settings.CURRENCY,
                subtotal=subtotal,
                shipping_fee=shipping,
                discount_total=Decimal("0.00"),
                total=total,
                amount_paid=total if settled else Decimal("0.00"),
                recipient_name=customer.full_name,
                phone=phone,
                line1=f"House {rng.randint(1, 120)}, Road {rng.randint(1, 28)}",
                line2=area,
                city=city,
                district=city,
                postal_code=f"{rng.randint(1000, 9499)}",
                country="Bangladesh",
                items=items,
            )
            order.created_at = moment
            order.updated_at = moment

            if settled:
                order.payments = [
                    Payment(
                        provider=method,
                        reference=f"{method.upper()}{rng.randrange(16**8):08X}",
                        amount=total,
                        currency=settings.CURRENCY,
                        status=payment_status,
                        raw_response={"demo": True, "captured_at": moment.isoformat()},
                    )
                ]
            db.add(order)

            orders_made += 1
            if status in (
                OrderStatus.CONFIRMED,
                OrderStatus.PROCESSING,
                OrderStatus.SHIPPED,
                OrderStatus.DELIVERED,
            ):
                revenue += total

    # Stock has to reflect the sales, or the panel shows 40 in stock next to 60
    # units sold. Selling down also drops the best sellers under
    # LOW_STOCK_THRESHOLD on its own, which is what fills the low-stock table.
    for variant, units in sold.items():
        variant.stock_quantity = max(0, variant.stock_quantity - units)

    await db.commit()
    low = sum(1 for v, _ in rows if v.stock_quantity <= settings.LOW_STOCK_THRESHOLD)
    print(f"created {orders_made} demo orders over {HISTORY_DAYS} days")
    print(f"revenue (countable statuses): {settings.CURRENCY} {revenue:,.2f}")
    print(f"variants at/below low-stock threshold: {low}")


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reset", action="store_true", help="delete tagged demo rows")
    parser.add_argument("--seed", action="store_true", help="create demo rows after --reset")
    args = parser.parse_args()

    rng = random.Random(RANDOM_SEED)
    async with AsyncSessionLocal() as db:
        if args.reset:
            await reset(db)
            if not args.seed:
                await engine.dispose()
                return
        existing, _ = await _tagged_counts(db)
        if existing:
            print(f"{existing} demo orders already exist — use --reset first. Nothing written.")
        else:
            await seed(db, rng)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
