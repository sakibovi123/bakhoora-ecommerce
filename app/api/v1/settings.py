from typing import Annotated, Literal

from fastapi import APIRouter, File, UploadFile

from app.api.deps import DbSession, SettingsManager
from app.schemas.settings import SettingsOut, SettingsUpdate
from app.services import settings_service

router = APIRouter(prefix="/settings", tags=["settings"])

_FIELDS = {"logo": "logo_url", "favicon": "favicon_url"}


# Public on purpose. The storefront needs the shop's name, its currency and its
# delivery charge to render a page at all, and none of it is a secret — it is
# the same information printed on the shop front. Nothing here is user data.
@router.get("", response_model=SettingsOut)
async def read_settings(db: DbSession):
    return await settings_service.get(db)


@router.patch("", response_model=SettingsOut)
async def update_settings(data: SettingsUpdate, db: DbSession, _: SettingsManager):
    return await settings_service.update(db, data)


@router.post("/{asset}", response_model=SettingsOut)
async def upload_branding(
    asset: Literal["logo", "favicon"],
    db: DbSession,
    _: SettingsManager,
    file: Annotated[UploadFile, File(description="PNG, JPEG, WebP, GIF, AVIF or HEIC")],
):
    return await settings_service.set_branding(db, _FIELDS[asset], file)


@router.delete("/{asset}", response_model=SettingsOut)
async def clear_branding(asset: Literal["logo", "favicon"], db: DbSession, _: SettingsManager):
    """Fall back to the bundled artwork rather than leaving an empty header."""
    return await settings_service.clear_branding(db, _FIELDS[asset])
