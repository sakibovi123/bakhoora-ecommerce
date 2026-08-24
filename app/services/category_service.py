import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.models.category import Category
from app.schemas.category import (
    CategoryCreate,
    CategoryOut,
    CategoryTree,
    CategoryUpdate,
)
from app.utils.slug import unique_slug


async def _slug_taken(db: AsyncSession, slug: str, exclude_id: uuid.UUID | None = None) -> bool:
    stmt = select(Category.id).where(Category.slug == slug)
    if exclude_id:
        stmt = stmt.where(Category.id != exclude_id)
    return await db.scalar(stmt) is not None


async def list_categories(db: AsyncSession, *, include_inactive: bool = False) -> list[Category]:
    stmt = select(Category).order_by(Category.position, Category.name)
    if not include_inactive:
        stmt = stmt.where(Category.is_active.is_(True))
    return list(await db.scalars(stmt))


async def get_by_id(db: AsyncSession, category_id: uuid.UUID) -> Category:
    category = await db.get(Category, category_id)
    if category is None:
        raise NotFoundError("Category not found")
    return category


async def get_by_slug(db: AsyncSession, slug: str) -> Category:
    category = await db.scalar(select(Category).where(Category.slug == slug))
    if category is None:
        raise NotFoundError("Category not found")
    return category


async def create(db: AsyncSession, data: CategoryCreate) -> Category:
    slug = data.slug or await unique_slug(data.name, lambda s: _slug_taken(db, s))
    if await _slug_taken(db, slug):
        raise ConflictError(f"Slug '{slug}' is already used")
    category = Category(**data.model_dump(exclude={"slug"}), slug=slug)
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return category


async def update(db: AsyncSession, category_id: uuid.UUID, data: CategoryUpdate) -> Category:
    category = await get_by_id(db, category_id)
    values = data.model_dump(exclude_unset=True)
    if "slug" in values and values["slug"] and await _slug_taken(db, values["slug"], category_id):
        raise ConflictError(f"Slug '{values['slug']}' is already used")
    if values.get("parent_id") == category_id:
        raise ConflictError("A category cannot be its own parent")
    for field, value in values.items():
        setattr(category, field, value)
    await db.commit()
    await db.refresh(category)
    return category


async def delete(db: AsyncSession, category_id: uuid.UUID) -> None:
    category = await get_by_id(db, category_id)
    await db.delete(category)
    await db.commit()


def build_tree(categories: list[Category]) -> list[CategoryTree]:
    # Validate through CategoryOut first: CategoryTree.model_validate(orm_object)
    # would try to read the lazy `children` relationship and blow up under asyncio.
    nodes = {
        c.id: CategoryTree(**CategoryOut.model_validate(c).model_dump(), children=[])
        for c in categories
    }
    roots: list[CategoryTree] = []
    for category in categories:
        node = nodes[category.id]
        parent = nodes.get(category.parent_id) if category.parent_id else None
        if parent is None:
            roots.append(node)
        else:
            parent.children.append(node)
    return roots
