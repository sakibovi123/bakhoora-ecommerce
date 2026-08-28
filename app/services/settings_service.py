"""Reading and writing the one shop-settings row."""

from decimal import Decimal

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings as env
from app.core.exceptions import BusinessRuleError
from app.models.settings import AdvanceMode, ShopSettings
from app.schemas.settings import SettingsUpdate
from app.utils.uploads import BRANDING_FOLDER, delete_stored, save_image


def defaults() -> ShopSettings:
    """A transient row — never added to a session.

    Seeded from `config.py` rather than from bare column defaults so a
    deployment that has never opened the Settings page keeps behaving exactly
    as it did before this feature existed.
    """
    return ShopSettings(
        site_title="Bakhoora",
        currency_code=env.CURRENCY,
        currency_symbol="৳",
        delivery_charge=Decimal(env.SHIPPING_FLAT_FEE),
        free_delivery_threshold=Decimal(env.FREE_SHIPPING_THRESHOLD),
        advance_mode=AdvanceMode.NONE,
        advance_amount=Decimal("0.00"),
    )


async def get(db: AsyncSession) -> ShopSettings:
    """The settings to read from. Never writes.

    Two reasons this does not create the row on demand. Checkout reads it after
    it has already decremented stock, and a commit in here would persist that
    decrement without the order behind it. And `GET /settings` is public, so an
    insert on the read path would let an anonymous request write to the
    database. Callers that intend to write use `get_for_update`.
    """
    return await db.scalar(select(ShopSettings).limit(1)) or defaults()


async def get_for_update(db: AsyncSession) -> ShopSettings:
    """The persisted row, created on first use. Write paths only."""
    row = await db.scalar(select(ShopSettings).limit(1))
    if row is None:
        row = defaults()
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


def _validate(
    delivery_charge: Decimal,
    free_delivery_threshold: Decimal | None,
    advance_mode: AdvanceMode,
    advance_amount: Decimal,
) -> None:
    """Checked against the merged values, not the patch.

    The panel can save the mode and the amount in separate requests, so a rule
    like "flat needs an amount" is only answerable once both are applied. Run
    before anything is written, so a rejected save leaves no dirty row behind.
    """
    if advance_mode is AdvanceMode.FLAT and advance_amount <= 0:
        raise BusinessRuleError(
            "A flat advance needs an amount above zero. "
            "Choose 'no advance' if you do not want to collect one."
        )
    if (
        free_delivery_threshold is not None
        and delivery_charge > 0
        and free_delivery_threshold <= delivery_charge
    ):
        raise BusinessRuleError(
            "Free delivery should start above the delivery charge itself, "
            "otherwise almost every order ships free."
        )


async def update(db: AsyncSession, data: SettingsUpdate) -> ShopSettings:
    row = await get_for_update(db)
    patch = data.model_dump(exclude_unset=True, exclude={"clear_free_delivery_threshold"})

    # Merge into plain values and validate those, so a rejected save never
    # leaves the mapped row dirty for a later autoflush to pick up.
    def merged(field: str):
        return patch.get(field, getattr(row, field))

    threshold = None if data.clear_free_delivery_threshold else merged("free_delivery_threshold")
    _validate(
        Decimal(merged("delivery_charge")),
        None if threshold is None else Decimal(threshold),
        merged("advance_mode"),
        Decimal(merged("advance_amount")),
    )

    for field, value in patch.items():
        setattr(row, field, value)
    if data.clear_free_delivery_threshold:
        row.free_delivery_threshold = None

    await db.commit()
    await db.refresh(row)
    return row


async def set_branding(db: AsyncSession, field: str, file: UploadFile) -> ShopSettings:
    """Replace the logo or the favicon, removing whatever it replaced."""
    if field not in {"logo_url", "favicon_url"}:
        raise ValueError(f"Not a branding field: {field!r}")

    row = await get_for_update(db)
    previous = getattr(row, field)
    setattr(row, field, await save_image(file, folder=BRANDING_FOLDER))
    await db.commit()
    await db.refresh(row)

    # Only after the row is committed: deleting first would leave the shop with
    # no logo at all if the write failed.
    if previous:
        delete_stored(previous)
    return row


async def clear_branding(db: AsyncSession, field: str) -> ShopSettings:
    if field not in {"logo_url", "favicon_url"}:
        raise ValueError(f"Not a branding field: {field!r}")

    row = await get_for_update(db)
    previous = getattr(row, field)
    if previous is None:
        return row

    setattr(row, field, None)
    await db.commit()
    await db.refresh(row)
    delete_stored(previous)
    return row
