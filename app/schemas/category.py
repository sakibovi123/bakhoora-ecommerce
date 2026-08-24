import uuid

from pydantic import BaseModel, ConfigDict, Field


class CategoryBase(BaseModel):
    name: str = Field(max_length=120)
    description: str | None = None
    image_url: str | None = Field(default=None, max_length=500)
    position: int = 0
    is_active: bool = True
    parent_id: uuid.UUID | None = None


class CategoryCreate(CategoryBase):
    slug: str | None = Field(default=None, max_length=140)


class CategoryUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    description: str | None = None
    image_url: str | None = None
    position: int | None = None
    is_active: bool | None = None
    parent_id: uuid.UUID | None = None


class CategoryOut(CategoryBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str


class CategoryTree(CategoryOut):
    children: list["CategoryTree"] = []
