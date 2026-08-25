import uuid

from fastapi import APIRouter, status

from app.api.deps import CategoriesManager, DbSession
from app.core import cache
from app.core.config import settings
from app.models.category import Category
from app.schemas.category import CategoryCreate, CategoryOut, CategoryTree, CategoryUpdate
from app.services import category_service

router = APIRouter(prefix="/categories", tags=["categories"])


# Cached as serialised dicts, not ORM rows: a Category loaded in one request's
# session is unusable once that session closes, so the cache stores the response
# body and FastAPI re-validates it against response_model on the way out.
@router.get("", response_model=list[CategoryOut])
async def list_categories(db: DbSession) -> list[dict]:
    async def build() -> list[dict]:
        rows = await category_service.list_categories(db)
        return [CategoryOut.model_validate(row).model_dump(mode="json") for row in rows]

    return await cache.cache.get_or_set(
        cache.CATEGORIES,
        cache.make_key("list"),
        build,
        ttl=settings.CACHE_TTL_CATEGORIES,
    )


@router.get("/tree", response_model=list[CategoryTree])
async def category_tree(db: DbSession) -> list[dict]:
    async def build() -> list[dict]:
        rows = await category_service.list_categories(db)
        return [node.model_dump(mode="json") for node in category_service.build_tree(rows)]

    return await cache.cache.get_or_set(
        cache.CATEGORIES,
        cache.make_key("tree"),
        build,
        ttl=settings.CACHE_TTL_CATEGORIES,
    )


@router.get("/{slug}", response_model=CategoryOut)
async def get_category(slug: str, db: DbSession) -> Category:
    return await category_service.get_by_slug(db, slug)


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
async def create_category(data: CategoryCreate, db: DbSession, _: CategoriesManager) -> Category:
    return await category_service.create(db, data)


@router.patch("/{category_id}", response_model=CategoryOut)
async def update_category(
    category_id: uuid.UUID, data: CategoryUpdate, db: DbSession, _: CategoriesManager
) -> Category:
    return await category_service.update(db, category_id, data)


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(category_id: uuid.UUID, db: DbSession, _: CategoriesManager) -> None:
    await category_service.delete(db, category_id)
