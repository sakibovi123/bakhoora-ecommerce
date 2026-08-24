import uuid

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.utils.menus import MENU_KEYS, MENUS


class MenuOut(BaseModel):
    key: str
    label: str
    description: str


def menu_catalogue() -> list[MenuOut]:
    return [MenuOut(key=m.key, label=m.label, description=m.description) for m in MENUS]


class PermissionIn(BaseModel):
    menu: str
    can_view: bool = False
    can_manage: bool = False

    @field_validator("menu")
    @classmethod
    def _known_menu(cls, value: str) -> str:
        if value not in MENU_KEYS:
            known = ", ".join(sorted(MENU_KEYS))
            raise ValueError(f"'{value}' is not a menu. Known menus: {known}")
        return value

    @model_validator(mode="after")
    def _manage_implies_view(self) -> "PermissionIn":
        # A role that can change something can always see it; storing the pair
        # any other way would let the panel hide a menu it can still write to.
        if self.can_manage:
            self.can_view = True
        return self


class PermissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    menu: str
    can_view: bool
    can_manage: bool


class RoleSummary(BaseModel):
    """What every user payload carries — no permission list."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    is_staff: bool
    is_system: bool


class RoleOut(RoleSummary):
    description: str | None = None
    permissions: list[PermissionOut] = []
    user_count: int = 0


class RoleCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    slug: str | None = Field(default=None, max_length=80)
    description: str | None = None
    is_staff: bool = True
    permissions: list[PermissionIn] = []

    @field_validator("permissions")
    @classmethod
    def _one_row_per_menu(cls, value: list[PermissionIn]) -> list[PermissionIn]:
        seen = [entry.menu for entry in value]
        duplicates = sorted({menu for menu in seen if seen.count(menu) > 1})
        if duplicates:
            raise ValueError(f"Repeated menu: {', '.join(duplicates)}")
        return value


class RoleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    description: str | None = None
    is_staff: bool | None = None
    # Omit to leave permissions alone; send a list to replace them wholesale.
    permissions: list[PermissionIn] | None = None

    @field_validator("permissions")
    @classmethod
    def _one_row_per_menu(cls, value: list[PermissionIn] | None) -> list[PermissionIn] | None:
        if value is None:
            return value
        seen = [entry.menu for entry in value]
        duplicates = sorted({menu for menu in seen if seen.count(menu) > 1})
        if duplicates:
            raise ValueError(f"Repeated menu: {', '.join(duplicates)}")
        return value
