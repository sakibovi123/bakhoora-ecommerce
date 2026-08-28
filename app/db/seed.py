import asyncio
from decimal import Decimal

from sqlalchemy import select

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import AsyncSessionLocal, engine
from app.models.category import Category
from app.models.expense import ExpenseCategory
from app.models.product import Product, ProductVariant
from app.models.role import Role, RolePermission
from app.models.user import User
from app.utils.menus import ADMIN_ROLE_SLUG, CUSTOMER_ROLE_SLUG, MENUS
from app.utils.sizes import DEFAULT_VARIANT_SIZES_ML, size_label

CATEGORIES = [
    ("Decants", "decants", "Poured from imported bottles into smaller glass"),
    ("Perfume Oil", "oils", "Alcohol-free oil, poured to order"),
]

# A starting set so the Expenses page opens on something usable rather than an
# empty picker. All renameable, and the shop adds its own.
EXPENSE_CATEGORIES = [
    ("Stock purchase", "stock-purchase", "Oils and bottles bought to decant"),
    ("Packaging", "packaging", "Vials, labels, stickers, boxes"),
    ("Equipment", "equipment", "Pipettes, scales, furniture"),
    ("Rent & bills", "rent-and-bills", "The studio and what it costs to run"),
    ("Transport", "transport", "Courier charges, trips to the market"),
    ("Marketing", "marketing", "Ads, photography, samples given away"),
    ("Other", "other", "Anything that fits nowhere else"),
]

# The four standard sizes carry one price list across the whole oil range —
# these are bought by the bottle and split, so what changes between products is
# the fragrance, not the cost of the millilitre.
OIL_PRICES = [(6, "300.00"), (10, "550.00"), (15, "700.00"), (30, "990.00")]

# Placeholder. Stock on a decanted oil is really "how much is left in the bulk
# bottle", which only the shop can know — set the real figures in the admin.
DEFAULT_STOCK = 20

# Named as they are written on the bulk bottles. Bakhoora is an independent
# decanter and not a dealer for any of these houses; the storefront says so on
# every product page.
OILS = [
    ("YSL", "Yves Saint Laurent", "YSL", "Bright, spicy and clean-edged."),
    ("Dior Sauvage", "Dior", "DIOR-SAUV", "Bergamot and cracked pepper over ambroxan."),
    ("Bleu de Chanel", "Chanel", "CHNL-BLEU", "Citrus opening, dry incense and cedar underneath."),
    (
        "Stronger With You",
        "Giorgio Armani",
        "ARM-SWY",
        "Cardamom and chestnut turning sweet on vanilla.",
    ),
    ("Nautica Voyage", "Nautica", "NAUT-VOY", "Crisp green apple and water over cedar."),
    ("Creed Aventus", "Creed", "CREED-AVE", "Smoky pineapple and birch on a musk base."),
    ("Tom Ford Oud Wood", "Tom Ford", "TF-OUDW", "Smooth oud with cardamom and sandalwood."),
    ("Versace Eros", "Versace", "VERS-EROS", "Mint and green apple over tonka and vanilla."),
    ("Musk Amber", None, "MUSK-AMB", "Warm amber wrapped in soft musk."),
    ("Lattafa Yara", "Lattafa", "LTF-YARA", "Tropical fruit and orchid, sweet and creamy."),
    ("White Musk", None, "WHT-MUSK", "Clean, powdery musk. Quiet and close to the skin."),
    ("Tom Ford Vanilla", "Tom Ford", "TF-VAN", "Dense vanilla, rounded and a little smoky."),
    ("Hawas Ice", "Rasasi", "RAS-HAWI", "Cool aquatic citrus with a fresh, sharp finish."),
]

PRODUCTS = [
    {
        "name": name,
        "brand": brand,
        "category": "oils",
        "sku_prefix": sku_prefix,
        "short_description": blurb,
        "featured": index < 6,
        "variants": [(size, price, DEFAULT_STOCK) for size, price in OIL_PRICES],
    }
    for index, (name, brand, sku_prefix, blurb) in enumerate(OILS)
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

        # --- expense categories ---
        for position, (name, slug, description) in enumerate(EXPENSE_CATEGORIES):
            if await db.scalar(
                select(ExpenseCategory).where(ExpenseCategory.slug == slug)
            ):
                continue
            db.add(
                ExpenseCategory(
                    name=name, slug=slug, description=description, position=position
                )
            )
            print(f"created expense category {name}")

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
                description=(
                    f"{spec['short_description']} Perfume oil, poured to order into fresh "
                    f"glass at 6, 10, 15 or 30ml. Alcohol-free, so it sits close to the skin "
                    f"and lasts longer than a spray."
                ),
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
            # No placeholder image on purpose: with no image the storefront
            # draws its own bottle silhouette, which looks like a shop. A
            # placehold.co box looks like a shop that is broken. Add real
            # photographs through the admin and they take over automatically.
            db.add(product)
            print(f"created product {spec['name']}")

        await db.commit()
    await engine.dispose()
    print("seed complete")


if __name__ == "__main__":
    asyncio.run(seed())
