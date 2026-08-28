"""Recording what the shop spends, and totalling it for the report."""

import uuid
from datetime import date
from decimal import Decimal
from typing import Literal, NamedTuple

from sqlalchemy import Select, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, NotFoundError
from app.models.expense import Expense, ExpenseCategory
from app.schemas.expense import (
    ExpenseCategoryCreate,
    ExpenseCategoryUpdate,
    ExpenseCreate,
    ExpenseUpdate,
)
from app.utils.slug import unique_slug

SortKey = Literal["newest", "oldest", "amount_desc", "amount_asc"]

_ZERO = Decimal("0.00")


# --- categories -------------------------------------------------------------


async def _slug_taken(db: AsyncSession, slug: str, exclude_id: uuid.UUID | None = None) -> bool:
    stmt = select(ExpenseCategory.id).where(ExpenseCategory.slug == slug)
    if exclude_id:
        stmt = stmt.where(ExpenseCategory.id != exclude_id)
    return await db.scalar(stmt) is not None


async def list_categories(
    db: AsyncSession, *, include_inactive: bool = False
) -> list[ExpenseCategory]:
    stmt = select(ExpenseCategory).order_by(ExpenseCategory.position, ExpenseCategory.name)
    if not include_inactive:
        stmt = stmt.where(ExpenseCategory.is_active.is_(True))
    return list(await db.scalars(stmt))


async def get_category(db: AsyncSession, category_id: uuid.UUID) -> ExpenseCategory:
    category = await db.get(ExpenseCategory, category_id)
    if category is None:
        raise NotFoundError("Expense category not found")
    return category


async def create_category(db: AsyncSession, data: ExpenseCategoryCreate) -> ExpenseCategory:
    slug = data.slug or await unique_slug(data.name, lambda s: _slug_taken(db, s))
    if await _slug_taken(db, slug):
        raise ConflictError(f"Slug '{slug}' is already used")
    category = ExpenseCategory(**data.model_dump(exclude={"slug"}), slug=slug)
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return category


async def update_category(
    db: AsyncSession, category_id: uuid.UUID, data: ExpenseCategoryUpdate
) -> ExpenseCategory:
    category = await get_category(db, category_id)
    values = data.model_dump(exclude_unset=True)
    if "slug" in values and values["slug"] and await _slug_taken(db, values["slug"], category_id):
        raise ConflictError(f"Slug '{values['slug']}' is already used")
    for field, value in values.items():
        setattr(category, field, value)
    await db.commit()
    await db.refresh(category)
    return category


async def delete_category(db: AsyncSession, category_id: uuid.UUID) -> None:
    """Refused while anything is filed under it.

    Unlike a product category — a product with no category still lists and still
    sells — an expense with no category is a hole in the report. The column is
    NOT NULL with ondelete RESTRICT, so the database would refuse this anyway;
    checking here turns an IntegrityError into a sentence that says what to do.
    """
    category = await get_category(db, category_id)
    filed = await db.scalar(
        select(func.count()).select_from(Expense).where(Expense.category_id == category_id)
    )
    if filed:
        raise ConflictError(
            f"{filed} expense{'s are' if filed != 1 else ' is'} filed under "
            f"{category.name}. Move them first, or turn the category off instead."
        )
    await db.delete(category)
    await db.commit()


# --- expenses ---------------------------------------------------------------


def _filters(
    stmt: Select,
    *,
    search: str | None,
    category_id: uuid.UUID | None,
    start: date | None,
    end: date | None,
) -> Select:
    if search:
        stmt = stmt.where(Expense.description.ilike(f"%{search.strip()}%"))
    if category_id is not None:
        stmt = stmt.where(Expense.category_id == category_id)
    if start is not None:
        stmt = stmt.where(Expense.spent_on >= start)
    if end is not None:
        stmt = stmt.where(Expense.spent_on <= end)
    return stmt


async def list_expenses(
    db: AsyncSession,
    *,
    page: int = 1,
    size: int = 20,
    search: str | None = None,
    category_id: uuid.UUID | None = None,
    start: date | None = None,
    end: date | None = None,
    sort: SortKey = "newest",
) -> tuple[list[Expense], int, Decimal]:
    """A page of expenses, the unpaginated count, and the unpaginated total.

    The total is what the operator is actually looking for — "what did I spend
    this month" — and paginating it away would make the figure change as they
    clicked through pages.
    """
    stmt = _filters(
        select(Expense).options(selectinload(Expense.category)),
        search=search,
        category_id=category_id,
        start=start,
        end=end,
    )

    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    spent = await db.scalar(
        _filters(
            select(func.coalesce(func.sum(Expense.amount), 0)),
            search=search,
            category_id=category_id,
            start=start,
            end=end,
        )
    )

    orders = {
        "newest": (Expense.spent_on.desc(), Expense.created_at.desc()),
        "oldest": (Expense.spent_on.asc(), Expense.created_at.asc()),
        "amount_desc": (Expense.amount.desc(),),
        "amount_asc": (Expense.amount.asc(),),
    }[sort]

    rows = await db.scalars(
        stmt.order_by(*orders).offset((page - 1) * size).limit(size)
    )
    return list(rows), total, Decimal(spent or 0).quantize(Decimal("0.01"))


async def get_expense(db: AsyncSession, expense_id: uuid.UUID) -> Expense:
    """Always with the category loaded.

    `db.get` will not do here. After a commit the instance in the identity map
    has expired attributes, and `get` refreshes the columns without touching the
    relationship — so `category` is still unloaded when FastAPI serialises the
    response, which it does *synchronously*, and the lazy load raises
    MissingGreenlet. An explicit awaited select with `populate_existing` loads it
    inside the async context where that is legal.
    """
    expense = await db.scalar(
        select(Expense)
        .options(selectinload(Expense.category))
        .where(Expense.id == expense_id)
        .execution_options(populate_existing=True)
    )
    if expense is None:
        raise NotFoundError("Expense not found")
    return expense


async def create_expense(db: AsyncSession, data: ExpenseCreate) -> Expense:
    # Resolve the category first so an unknown id is a 404 naming the category,
    # not a foreign-key violation.
    await get_category(db, data.category_id)
    expense = Expense(**data.model_dump())
    db.add(expense)
    await db.commit()
    return await get_expense(db, expense.id)


async def update_expense(
    db: AsyncSession, expense_id: uuid.UUID, data: ExpenseUpdate
) -> Expense:
    expense = await get_expense(db, expense_id)
    values = data.model_dump(exclude_unset=True)
    if values.get("category_id"):
        await get_category(db, values["category_id"])
    for field, value in values.items():
        setattr(expense, field, value)
    await db.commit()
    return await get_expense(db, expense_id)


async def delete_expense(db: AsyncSession, expense_id: uuid.UUID) -> None:
    expense = await get_expense(db, expense_id)
    await db.delete(expense)
    await db.commit()


# --- report aggregate -------------------------------------------------------


class PeriodTotal(NamedTuple):
    amount: Decimal
    entries: int


class CategoryTotal(NamedTuple):
    category_id: uuid.UUID
    amount: Decimal
    entries: int


class ExpenseTotals(NamedTuple):
    by_period: dict[date, PeriodTotal]
    by_category: list[CategoryTotal]
    previous: Decimal


async def totals(
    db: AsyncSession,
    *,
    unit: Literal["day", "month"],
    start: date,
    end: date,
    previous_start: date,
) -> ExpenseTotals:
    """Per-period totals, per-category totals and the comparison total, in one query.

    GROUPING SETS the way `report_service._breakdowns` does, so adding expenses
    to the report costs one round trip rather than three.

    The bounds are plain dates on purpose. `spent_on` is already shop-local, so
    unlike the order queries there is no UTC window here — and deriving one from
    `report_service._utc_window` would be wrong in a way that looks right:
    Dhaka midnight is 18:00 UTC the previous day, so `first.date()` lands a day
    early while `last.date()` happens to be correct. The range is fully closed;
    `spent_on < end` would silently drop the last day.
    """
    in_range = Expense.spent_on >= start
    # NULL for rows in the comparison window, which collapses them into the one
    # row that carries the previous period's total.
    period = case((in_range, func.date_trunc(unit, Expense.spent_on))).label("period")

    src = (
        select(
            Expense.amount.label("amount"),
            Expense.category_id.label("category_id"),
            period,
            in_range.label("in_range"),
        )
        .where(Expense.spent_on >= previous_start, Expense.spent_on <= end)
        .subquery()
    )

    # Explicit grouping(), not a NULL test: `_breakdowns` can get away with
    # NULL-testing because both its grouped columns are NOT NULL, but `period`
    # is legitimately NULL on the comparison row.
    stmt = (
        select(
            func.grouping(src.c.period).label("g_period"),
            func.grouping(src.c.category_id).label("g_category"),
            src.c.period,
            src.c.category_id,
            func.coalesce(func.sum(src.c.amount), 0).label("amount_all"),
            func.count().label("entries_all"),
            func.coalesce(
                func.sum(src.c.amount).filter(src.c.in_range), 0
            ).label("amount_in_range"),
            func.count().filter(src.c.in_range).label("entries_in_range"),
        )
        .select_from(src)
        .group_by(func.grouping_sets(src.c.period, src.c.category_id))
    )

    by_period: dict[date, PeriodTotal] = {}
    by_category: list[CategoryTotal] = []
    previous = _ZERO

    for row in (await db.execute(stmt)).all():
        if row.g_category == 1:  # a period row
            if row.period is None:
                previous = Decimal(row.amount_all or 0).quantize(Decimal("0.01"))
                continue
            by_period[row.period.date()] = PeriodTotal(
                amount=Decimal(row.amount_all or 0).quantize(Decimal("0.01")),
                entries=row.entries_all,
            )
        elif row.entries_in_range:  # a category row, spend inside the range
            by_category.append(
                CategoryTotal(
                    category_id=row.category_id,
                    amount=Decimal(row.amount_in_range or 0).quantize(Decimal("0.01")),
                    entries=row.entries_in_range,
                )
            )

    by_category.sort(key=lambda item: item.amount, reverse=True)
    return ExpenseTotals(by_period=by_period, by_category=by_category, previous=previous)
