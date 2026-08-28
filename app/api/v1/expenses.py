import uuid
from datetime import date
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Query, status
from pydantic import BaseModel

from app.api.deps import DbSession, ExpensesManager, ExpensesViewer, PageParams
from app.schemas.expense import (
    ExpenseCategoryCreate,
    ExpenseCategoryOut,
    ExpenseCategoryUpdate,
    ExpenseCreate,
    ExpenseOut,
    ExpenseUpdate,
)
from app.services import expense_service

# Admin-only: there is no storefront view of what the shop spends.
router = APIRouter(prefix="/admin", tags=["expenses"])


class ExpensePage(BaseModel):
    """A page, plus the total spend across the *whole* filtered range.

    `Page` carries only the rows, and a total that changed as you clicked
    through pages would be useless for the one question this screen answers.
    """

    items: list[ExpenseOut]
    total: int
    page: int
    size: int
    pages: int
    total_spent: Decimal


# --- categories -------------------------------------------------------------


@router.get("/expense-categories", response_model=list[ExpenseCategoryOut])
async def list_expense_categories(
    db: DbSession,
    _: ExpensesViewer,
    include_inactive: bool = True,
):
    return await expense_service.list_categories(db, include_inactive=include_inactive)


@router.post(
    "/expense-categories",
    response_model=ExpenseCategoryOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_expense_category(
    data: ExpenseCategoryCreate, db: DbSession, _: ExpensesManager
):
    return await expense_service.create_category(db, data)


@router.patch("/expense-categories/{category_id}", response_model=ExpenseCategoryOut)
async def update_expense_category(
    category_id: uuid.UUID, data: ExpenseCategoryUpdate, db: DbSession, _: ExpensesManager
):
    return await expense_service.update_category(db, category_id, data)


@router.delete("/expense-categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense_category(
    category_id: uuid.UUID, db: DbSession, _: ExpensesManager
) -> None:
    """Refused while expenses are filed under it — turn it off instead."""
    await expense_service.delete_category(db, category_id)


# --- expenses ---------------------------------------------------------------


@router.get("/expenses", response_model=ExpensePage)
async def list_expenses(
    db: DbSession,
    params: PageParams,
    _: ExpensesViewer,
    search: Annotated[str | None, Query(max_length=100)] = None,
    category_id: uuid.UUID | None = None,
    start: Annotated[date | None, Query(description="First day, shop-local")] = None,
    end: Annotated[date | None, Query(description="Last day, inclusive")] = None,
    sort: Literal["newest", "oldest", "amount_desc", "amount_asc"] = "newest",
):
    items, total, spent = await expense_service.list_expenses(
        db,
        page=params.page,
        size=params.size,
        search=search,
        category_id=category_id,
        start=start,
        end=end,
        sort=sort,
    )
    pages = (total + params.size - 1) // params.size if total else 0
    return ExpensePage(
        items=[ExpenseOut.model_validate(item) for item in items],
        total=total,
        page=params.page,
        size=params.size,
        pages=pages,
        total_spent=spent,
    )


@router.post("/expenses", response_model=ExpenseOut, status_code=status.HTTP_201_CREATED)
async def create_expense(data: ExpenseCreate, db: DbSession, _: ExpensesManager):
    return await expense_service.create_expense(db, data)


@router.get("/expenses/{expense_id}", response_model=ExpenseOut)
async def get_expense(expense_id: uuid.UUID, db: DbSession, _: ExpensesViewer):
    return await expense_service.get_expense(db, expense_id)


@router.patch("/expenses/{expense_id}", response_model=ExpenseOut)
async def update_expense(
    expense_id: uuid.UUID, data: ExpenseUpdate, db: DbSession, _: ExpensesManager
):
    return await expense_service.update_expense(db, expense_id, data)


@router.delete("/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense(expense_id: uuid.UUID, db: DbSession, _: ExpensesManager) -> None:
    await expense_service.delete_expense(db, expense_id)
