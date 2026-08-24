import math
from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class Message(BaseModel):
    message: str


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    size: int
    pages: int

    @classmethod
    def create(cls, items: list[T], total: int, page: int, size: int) -> "Page[T]":
        return cls(
            items=items,
            total=total,
            page=page,
            size=size,
            pages=math.ceil(total / size) if size else 0,
        )
