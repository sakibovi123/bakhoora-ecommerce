import uuid
from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


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
    spent_on: date = Field(description="The day the bill was dated, shop-local.")
    amount: Decimal = Field(
        gt=0, max_digits=12, decimal_places=2, description="The full cost of the bill."
    )
    description: str = Field(min_length=1, max_length=200)
    note: str | None = None
    supplier: str | None = Field(default=None, max_length=120)
    reference: str | None = Field(default=None, max_length=60)


class ExpenseCreate(ExpenseBase):
    category_id: uuid.UUID
    # Omitted means paid in full, which is what most expenses are — the service
    # fills it from `amount`. Explicitly writing 0 is a different statement (the
    # bill is wholly unpaid) and is kept as given.
    amount_paid: Decimal | None = Field(
        default=None, ge=0, max_digits=12, decimal_places=2
    )
    receipt_url: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _paid_within_total(self) -> "ExpenseCreate":
        if self.amount_paid is not None and self.amount_paid > self.amount:
            raise ValueError(
                "Paid is more than the bill. Correct the total, or record the "
                "difference as its own entry."
            )
        return self


class ExpenseUpdate(BaseModel):
    spent_on: date | None = None
    amount: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    amount_paid: Decimal | None = Field(
        default=None, ge=0, max_digits=12, decimal_places=2
    )
    description: str | None = Field(default=None, min_length=1, max_length=200)
    note: str | None = None
    supplier: str | None = Field(default=None, max_length=120)
    reference: str | None = Field(default=None, max_length=60)
    receipt_url: str | None = Field(default=None, max_length=500)
    category_id: uuid.UUID | None = None

    # Nothing is checked against `amount` here: a PATCH may carry either figure
    # alone, so the pair is only whole once merged onto the stored row. The
    # service compares them there.


class ExpenseOut(ExpenseBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    category: ExpenseCategoryOut
    amount_paid: Decimal
    # Read off the model property, so the panel never subtracts for itself and
    # arrives at a different due than the report did.
    amount_due: Decimal
    receipt_url: str | None = None


# --- reading a photographed bill --------------------------------------------


class ReceiptLine(BaseModel):
    """One row off the bill, kept for the note rather than stored separately.

    Expenses are a ledger, not an inventory: the shop wants "200 boxes, 7,000"
    against a month, and a line-items table would be a second schema to maintain
    for a figure nothing queries.
    """

    description: str = Field(max_length=200)
    quantity: Decimal | None = Field(default=None, max_digits=12, decimal_places=2)
    unit_price: Decimal | None = Field(default=None, max_digits=12, decimal_places=2)
    amount: Decimal | None = Field(default=None, max_digits=12, decimal_places=2)


class ReceiptDraft(BaseModel):
    """What the reader made of a photograph. Nothing here has been saved yet.

    Every money and date field is optional: a bill the model could not read a
    total off must come back as a draft with the rest filled in and that field
    blank, so the operator types one figure rather than starting again. The
    panel treats this as a filled-in form, not as fact.
    """

    receipt_url: str
    supplier: str | None = None
    reference: str | None = None
    spent_on: date | None = None
    amount: Decimal | None = Field(default=None, max_digits=12, decimal_places=2)
    amount_paid: Decimal | None = Field(default=None, max_digits=12, decimal_places=2)
    description: str | None = Field(default=None, max_length=200)
    note: str | None = None
    category_id: uuid.UUID | None = None
    lines: list[ReceiptLine] = Field(default_factory=list)
    # How much of the bill was printed rather than handwritten, roughly. Drives
    # how loudly the panel tells the operator to check the figures.
    confidence: Literal["high", "medium", "low"] = "low"
    # Anything the reader was unsure of, in words the operator can act on —
    # "the date is handwritten in Bengali numerals and may be 2026-02-20".
    warnings: list[str] = Field(default_factory=list)
    model: str
