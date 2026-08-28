import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ExpenseCategoryBase(BaseModel):
    name: str = Field(max_length=120)
    description: str | None = None
    position: int = 0
    is_active: bool = True


class ExpenseCategoryCreate(ExpenseCategoryBase):
    slug: str | None = Field(default=None, max_length=140)


class ExpenseCategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    slug: str | None = Field(default=None, max_length=140)
    description: str | None = None
    position: int | None = None
    is_active: bool | None = None


class ExpenseCategoryOut(ExpenseCategoryBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str


class ExpenseBase(BaseModel):
    spent_on: date = Field(description="The day the money left, shop-local.")
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    description: str = Field(min_length=1, max_length=200)
    note: str | None = None


class ExpenseCreate(ExpenseBase):
    category_id: uuid.UUID


class ExpenseUpdate(BaseModel):
    spent_on: date | None = None
    amount: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    description: str | None = Field(default=None, min_length=1, max_length=200)
    note: str | None = None
    category_id: uuid.UUID | None = None


class ExpenseOut(ExpenseBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    category: ExpenseCategoryOut
