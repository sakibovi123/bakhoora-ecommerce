import asyncio
from decimal import Decimal

from sqlalchemy import select

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import AsyncSessionLocal, engine
from app.models.category import Category
from app.models.product import Product, ProductImage, ProductVariant
from app.models.role import Role, RolePermission
from app.models.user import User
from app.utils.menus import ADMIN_ROLE_SLUG, CUSTOMER_ROLE_SLUG, MENUS
from app.utils.sizes import DEFAULT_VARIANT_SIZES_ML, size_label

CATEGORIES = [
    ("Attar", "attar", "Alcohol-free concentrated oils"),
    ("Oud", "oud", "Deep, resinous agarwood blends"),
    ("Eau de Parfum", "eau-de-parfum", "Long lasting sprays"),
    ("Body Mist", "body-mist", "Light everyday freshness"),
]

# Every product carries the four standard sizes, each at its own price. A couple
# of them also carry a larger bottle, which is what "added later" looks like.
# (size_ml, price, stock) — sizes must cover DEFAULT_VARIANT_SIZES_ML.
PRODUCTS = [
    {
        "name": "Royal Oud Intense",
        "brand": "Bakhoora",
        "category": "oud",
        "sku_prefix": "OUD-RI",
        "short_description": "Smoky agarwood with saffron and rose.",
        "featured": True,
        "variants": [
            (6, "1450.00", 40),
            (10, "2200.00", 30),
            (15, "3050.00", 22),
            (30, "5600.00", 12),
        ],
    },
    {
        "name": "Musk Al Haramain",
        "brand": "Bakhoora",
        "category": "attar",
        "sku_prefix": "ATR-MH",
        "short_description": "Soft white musk, clean and powdery.",
        "featured": True,
        "variants": [
            (6, "890.00", 60),
            (10, "1350.00", 45),
            (15, "1850.00", 30),
            (30, "3300.00", 18),
        ],
    },
    {
        "name": "Amber Nights",
        "brand": "Bakhoora",
        "category": "eau-de-parfum",
        "sku_prefix": "EDP-AN",
        "short_description": "Warm amber, vanilla and tonka.",
        "featured": False,
        "variants": [
            (6, "1100.00", 35),
            (10, "1650.00", 28),
            (15, "2300.00", 20),
            (30, "4100.00", 14),
            (50, "6200.00", 8),
        ],
    },
    {
        "name": "Rose Taifi",
        "brand": "Bakhoora",
        "category": "attar",
        "sku_prefix": "ATR-RT",
        "short_description": "Fresh Taif rose over sandalwood.",
        "featured": True,
        "variants": [
            (6, "1250.00", 35),
            (10, "1900.00", 26),
            (15, "2600.00", 18),
            (30, "4700.00", 10),
        ],
    },
    {
        "name": "Ocean Breeze Mist",
        "brand": "Bakhoora",
        "category": "body-mist",
        "sku_prefix": "MST-OB",
        "short_description": "Citrus and marine notes for daily wear.",
        "featured": False,
        "variants": [
            (6, "120.00", 90),
            (10, "180.00", 75),
            (15, "250.00", 60),
            (30, "420.00", 40),
            (250, "750.00", 80),
        ],
    },
]

# A seed row that quietly skipped a standard size would contradict the rule the
# API enforces, so check it here rather than shipping inconsistent fixtures.
for _spec in PRODUCTS:
    _sizes = {size for size, _price, _stock in _spec["variants"]}
    _missing = [size for size in DEFAULT_VARIANT_SIZES_ML if size not in _sizes]
    assert not _missing, f"{_spec['name']} is missing {_missing}"


SYSTEM_ROLES = [
    (
        "Customer",
        CUSTOMER_ROLE_SLUG,
        "Shops on the storefront. No access to the admin panel.",
        False,
    ),
    (
        "Administrator",
        ADMIN_ROLE_SLUG,
        "Full access to every menu in the admin panel.",
        True,
    ),
]


async def seed() -> None:
    async with AsyncSessionLocal() as db:
        # --- roles (before anything that points at one) ---
        roles: dict[str, Role] = {}
        for name, slug, description, is_staff in SYSTEM_ROLES:
            role = await db.scalar(select(Role).where(Role.slug == slug))
            if role is None:
                role = Role(
                    name=name,
                    slug=slug,
                    description=description,
                    is_staff=is_staff,
                    is_system=True,
                )
                if is_staff:
                    role.permissions = [
                        RolePermission(menu=menu.key, can_view=True, can_manage=True)
                        for menu in MENUS
                    ]
                db.add(role)
                await db.flush()
                print(f"created role {name}")
            roles[slug] = role

        # --- admin ---
        admin = await db.scalar(select(User).where(User.email == settings.FIRST_ADMIN_EMAIL))
        if admin is None:
            db.add(
                User(
                    email=settings.FIRST_ADMIN_EMAIL,
                    hashed_password=hash_password(settings.FIRST_ADMIN_PASSWORD),
                    full_name="Bakhoora Admin",
                    role_id=roles[ADMIN_ROLE_SLUG].id,
                )
            )
            print(f"created admin {settings.FIRST_ADMIN_EMAIL}")

        # --- categories ---
        categories: dict[str, Category] = {}
        for position, (name, slug, description) in enumerate(CATEGORIES):
            category = await db.scalar(select(Category).where(Category.slug == slug))
            if category is None:
                category = Category(
                    name=name, slug=slug, description=description, position=position
                )
                db.add(category)
                await db.flush()
            categories[slug] = category

        # --- products ---
        for spec in PRODUCTS:
            slug = spec["name"].lower().replace(" ", "-")
            if await db.scalar(select(Product).where(Product.slug == slug)):
                continue
            product = Product(
                name=spec["name"],
                slug=slug,
                brand=spec["brand"],
                short_description=spec["short_description"],
                description=f"{spec['short_description']} Bottled in Bangladesh by Bakhoora.",
                is_featured=spec["featured"],
                category_id=categories[spec["category"]].id,
            )
            product.variants = [
                ProductVariant(
                    size_ml=size_ml,
                    name=size_label(size_ml),
                    sku=f"{spec['sku_prefix']}-{size_ml:03d}ML",
                    price=Decimal(price),
                    stock_quantity=stock,
                )
                for size_ml, price, stock in spec["variants"]
            ]
            product.images = [
                ProductImage(
                    url=f"https://placehold.co/800x800?text={slug}",
                    alt_text=spec["name"],
                    is_primary=True,
                )
            ]
            db.add(product)
            print(f"created product {spec['name']}")

        await db.commit()
    await engine.dispose()
    print("seed complete")


if __name__ == "__main__":
    asyncio.run(seed())
