import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleError, ConflictError, NotFoundError
from app.models.role import Role, RolePermission
from app.models.user import User
from app.schemas.role import PermissionIn, RoleCreate, RoleUpdate
from app.utils.menus import ADMIN_ROLE_SLUG, SYSTEM_ROLE_SLUGS
from app.utils.slug import unique_slug


async def _slug_taken(db: AsyncSession, slug: str, exclude_id: uuid.UUID | None = None) -> bool:
    stmt = select(Role.id).where(Role.slug == slug)
    if exclude_id:
        stmt = stmt.where(Role.id != exclude_id)
    return await db.scalar(stmt) is not None


async def _name_taken(db: AsyncSession, name: str, exclude_id: uuid.UUID | None = None) -> bool:
    stmt = select(Role.id).where(func.lower(Role.name) == name.lower())
    if exclude_id:
        stmt = stmt.where(Role.id != exclude_id)
    return await db.scalar(stmt) is not None


async def list_roles(db: AsyncSession) -> list[Role]:
    rows = await db.scalars(select(Role).order_by(Role.is_staff.desc(), Role.name))
    return list(rows)


async def user_counts(db: AsyncSession) -> dict[uuid.UUID, int]:
    rows = await db.execute(select(User.role_id, func.count()).group_by(User.role_id))
    return {role_id: total for role_id, total in rows}


async def get_by_id(db: AsyncSession, role_id: uuid.UUID) -> Role:
    role = await db.get(Role, role_id)
    if role is None:
        raise NotFoundError("Role not found")
    return role


async def get_by_slug(db: AsyncSession, slug: str) -> Role:
    role = await db.scalar(select(Role).where(Role.slug == slug))
    if role is None:
        raise NotFoundError(f"The '{slug}' role is missing — run the seed.")
    return role


def _rows(permissions: list[PermissionIn]) -> list[RolePermission]:
    # Rows that grant nothing are noise; drop them rather than storing them.
    return [
        RolePermission(menu=entry.menu, can_view=entry.can_view, can_manage=entry.can_manage)
        for entry in permissions
        if entry.can_view or entry.can_manage
    ]


def _apply_permissions(role: Role, permissions: list[PermissionIn]) -> None:
    """Reconcile the grid in place.

    Assigning a fresh list instead would make SQLAlchemy insert the new rows
    before deleting the orphans, and any menu the role keeps would collide on
    uq_role_permission_menu. Updating what is already there sidesteps that, and
    only inserts menus the role did not hold before.
    """
    wanted = {entry.menu: entry for entry in permissions if entry.can_view or entry.can_manage}

    for existing in list(role.permissions):
        entry = wanted.pop(existing.menu, None)
        if entry is None:
            role.permissions.remove(existing)
        else:
            existing.can_view = entry.can_view
            existing.can_manage = entry.can_manage

    for entry in wanted.values():
        role.permissions.append(
            RolePermission(menu=entry.menu, can_view=entry.can_view, can_manage=entry.can_manage)
        )


async def create(db: AsyncSession, data: RoleCreate) -> Role:
    if await _name_taken(db, data.name):
        raise ConflictError(f"A role called '{data.name}' already exists")
    slug = data.slug or await unique_slug(data.name, lambda s: _slug_taken(db, s))
    if slug in SYSTEM_ROLE_SLUGS or await _slug_taken(db, slug):
        raise ConflictError(f"Slug '{slug}' is already used")

    role = Role(
        name=data.name.strip(),
        slug=slug,
        description=data.description,
        is_staff=data.is_staff,
        is_system=False,
    )
    role.permissions = _rows(data.permissions) if data.is_staff else []
    db.add(role)
    await db.commit()
    return await get_by_id(db, role.id)


async def update(db: AsyncSession, role_id: uuid.UUID, data: RoleUpdate) -> Role:
    role = await get_by_id(db, role_id)
    values = data.model_dump(exclude_unset=True)

    if role.is_system:
        # Renaming "Administrator" is fine; taking its panel access away is not.
        if values.get("is_staff") is not None and values["is_staff"] != role.is_staff:
            raise BusinessRuleError(f"'{role.name}' is a built-in role; its access cannot change")
        if role.slug == ADMIN_ROLE_SLUG and "permissions" in values:
            raise BusinessRuleError(
                "The Administrator role always holds every permission. "
                "Create another role to grant a narrower set."
            )

    if values.get("name") and await _name_taken(db, values["name"], role_id):
        raise ConflictError(f"A role called '{values['name']}' already exists")

    permissions = values.pop("permissions", None)
    for field, value in values.items():
        setattr(role, field, value)
    if permissions is not None:
        _apply_permissions(role, [PermissionIn(**entry) for entry in permissions])
    if not role.is_staff:
        # A role nobody can sign into the panel with holds no menus.
        role.permissions.clear()

    await db.commit()
    return await get_by_id(db, role_id)


async def delete(db: AsyncSession, role_id: uuid.UUID) -> None:
    role = await get_by_id(db, role_id)
    if role.is_system:
        raise BusinessRuleError(f"'{role.name}' is a built-in role and cannot be deleted")

    holders = await db.scalar(
        select(func.count()).select_from(User).where(User.role_id == role_id)
    )
    if holders:
        raise ConflictError(
            f"{holders} account{'s' if holders > 1 else ''} still use '{role.name}'. "
            f"Move them to another role first."
        )
    await db.delete(role)
    await db.commit()
