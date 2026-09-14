import uuid
from typing import Annotated

from fastapi import APIRouter, File, Query, UploadFile, status

from app.api.deps import CombosManager, DbSession
from app.core import cache
from app.core.config import settings
from app.schemas.combo import ComboCreate, ComboOut, ComboUpdate
from app.services import combo_service
from app.utils.uploads import PRODUCTS_FOLDER, delete_stored, save_image

router = APIRouter(prefix="/combos", tags=["combos"])


@router.get("", response_model=list[ComboOut])
async def list_combos(
    db: DbSession,
    search: Annotated[str | None, Query(max_length=100)] = None,
    featured: bool | None = None,
) -> list[dict]:
    """Live combos, with what each size option can actually be sold as.

    Availability is read off component stock on every build, so this cache is
    cleared by product and variant writes as well as combo ones — see
    `app/db/cache_events.py`.
    """
    filters = dict(search=search, featured=featured)

    async def build() -> list[dict]:
        combos = await combo_service.list_combos(db, **filters)
        return [combo.model_dump(mode="json") for combo in combos]

    return await cache.cache.get_or_set(
        cache.COMBOS,
        cache.make_key(**filters),
        build,
        ttl=settings.CACHE_TTL_PRODUCTS,
    )


@router.get("/{slug}", response_model=ComboOut)
async def get_combo(slug: str, db: DbSession) -> ComboOut:
    return await combo_service.get_by_slug(db, slug)


# --- admin -----------------------------------------------------------------

@router.post("", response_model=ComboOut, status_code=status.HTTP_201_CREATED)
async def create_combo(data: ComboCreate, db: DbSession, _: CombosManager) -> ComboOut:
    """Build a combo: its perfumes, and one flat price per bottle size."""
    return await combo_service.create(db, data)


@router.patch("/{combo_id}", response_model=ComboOut)
async def update_combo(
    combo_id: uuid.UUID, data: ComboUpdate, db: DbSession, _: CombosManager
) -> ComboOut:
    """Edit a combo. `products` and `sizes` replace those lists wholesale."""
    return await combo_service.update(db, combo_id, data)


@router.delete("/{combo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_combo(combo_id: uuid.UUID, db: DbSession, _: CombosManager) -> None:
    """Remove a campaign. Orders it produced keep their lines, names and money."""
    combo = await combo_service.get_by_id(db, combo_id)
    await combo_service.delete(db, combo_id)
    if combo.image_url:
        delete_stored(combo.image_url)


@router.post(
    "/{combo_id}/image",
    response_model=ComboOut,
    status_code=status.HTTP_201_CREATED,
    summary="Upload the combo's picture",
)
async def upload_combo_image(
    combo_id: uuid.UUID,
    db: DbSession,
    _: CombosManager,
    file: Annotated[UploadFile, File(description="Image file")],
) -> ComboOut:
    """One picture per combo, replacing whatever was there.

    A combo is a group shot, not a gallery — unlike a product it carries a
    single image, so the old file is removed rather than accumulating.
    """
    combo = await combo_service.get_by_id(db, combo_id)
    url = await save_image(file, PRODUCTS_FOLDER)
    updated = await combo_service.update(db, combo_id, ComboUpdate(image_url=url))
    if combo.image_url and combo.image_url != url:
        delete_stored(combo.image_url)
    return updated
