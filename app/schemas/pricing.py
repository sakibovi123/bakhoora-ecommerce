"""The pricing sheet and its reviews.

None of these are ever served to the storefront. `cost_price` is what the shop
pays its suppliers, and `VariantOut` — which `GET /products` returns to anyone
with a browser — must never carry it. That is the whole reason the sheet has
schemas of its own rather than reusing the product ones.
"""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field, model_validator

_ZERO = Decimal("0.00")


def _margin(price: Decimal, cost: Decimal | None) -> Decimal | None:
    """Profit as a percentage of the selling price.

    None when there is no cost to compare against — an unpriced bottle has an
    unknown margin, not a 100% one. Also None at a selling price of zero, which
    is a giveaway rather than an infinite loss.
    """
    if cost is None or price <= 0:
        return None
    return ((price - cost) / price * 100).quantize(Decimal("0.1"))


class PriceSheetRow(BaseModel):
    """One variant as the spreadsheet shows it, before anything is edited."""

    model_config = ConfigDict(from_attributes=True)

    variant_id: uuid.UUID
    product_id: uuid.UUID
    product_name: str
    brand: str | None = None
    category: str | None = None
    variant_name: str
    sku: str
    size_ml: int
    cost_price: Decimal | None = None
    price: Decimal
    stock_quantity: int
    is_active: bool

    @computed_field
    @property
    def profit(self) -> Decimal | None:
        """Taka earned per bottle at the current pair of figures."""
        return None if self.cost_price is None else self.price - self.cost_price

    @computed_field
    @property
    def margin_pct(self) -> Decimal | None:
        return _margin(self.price, self.cost_price)


class PriceSheetRowOut(PriceSheetRow):
    """A sheet row, plus whether it is already spoken for.

    A variant sitting in an undecided review is flagged rather than hidden: the
    operator needs to see the figure that is in flight, otherwise they propose a
    second change against a price that is about to move.
    """

    pending_reference: str | None = None


class PriceLineInput(BaseModel):
    """One proposed move. Only changed rows are sent."""

    variant_id: uuid.UUID
    cost_price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    price: Decimal = Field(gt=0, max_digits=12, decimal_places=2)

    @model_validator(mode="after")
    def _not_below_cost(self) -> "PriceLineInput":
        # A deliberate loss-leader is a real thing, so this is not refused —
        # but selling under cost by accident is the mistake this whole review
        # step exists to catch, and the reviewer is shown it in red.
        return self


class PriceReviewCreate(BaseModel):
    lines: list[PriceLineInput] = Field(min_length=1, max_length=500)
    note: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def _one_row_each(self) -> "PriceReviewCreate":
        seen = {line.variant_id for line in self.lines}
        if len(seen) != len(self.lines):
            raise ValueError("The same size appears on more than one row")
        return self


class PriceReviewDecision(BaseModel):
    note: str | None = Field(default=None, max_length=1000)


class PriceReviewLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    variant_id: uuid.UUID | None
    product_name: str
    variant_name: str
    sku: str
    size_ml: int
    from_cost: Decimal | None
    from_price: Decimal
    to_cost: Decimal | None
    to_price: Decimal

    @computed_field
    @property
    def from_profit(self) -> Decimal | None:
        return None if self.from_cost is None else self.from_price - self.from_cost

    @computed_field
    @property
    def to_profit(self) -> Decimal | None:
        return None if self.to_cost is None else self.to_price - self.to_cost

    @computed_field
    @property
    def to_margin_pct(self) -> Decimal | None:
        return _margin(self.to_price, self.to_cost)

    @computed_field
    @property
    def below_cost(self) -> bool:
        """Approving this would sell at a loss. Shown, not refused."""
        return self.to_cost is not None and self.to_price < self.to_cost


class PriceReviewLineReview(PriceReviewLineOut):
    """A line as the *reviewer* sees it, with the live figure alongside.

    `current_price` is what the variant says right now. It normally equals
    `from_price`; when it does not, somebody moved that price between the sheet
    being drawn up and it being read, and approving would overwrite their change
    with a decision taken against a figure that no longer exists. The reviewer
    is told rather than stopped — they are the one who can judge it.
    """

    current_cost: Decimal | None = None
    current_price: Decimal | None = None

    @computed_field
    @property
    def drifted(self) -> bool:
        return self.current_price is not None and self.current_price != self.from_price


class PriceReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    reference: str
    status: Literal["pending", "approved", "rejected"]
    note: str | None
    review_note: str | None
    proposed_by: str | None = None
    reviewed_by: str | None = None
    reviewed_at: datetime | None
    created_at: datetime
    lines: list[PriceReviewLineOut] = []

    @computed_field
    @property
    def line_count(self) -> int:
        return len(self.lines)


class PriceReviewDetail(PriceReviewOut):
    lines: list[PriceReviewLineReview] = []


class PriceReviewApplied(BaseModel):
    """What approving actually did."""

    review: PriceReviewDetail
    updated: int
    # Variants deleted between proposal and approval. Named, because "18 of 20
    # applied" without saying which two is not something anyone can act on.
    skipped: list[str] = []
