import uuid
from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

Granularity = Literal["daily", "monthly"]


class SalesBucket(BaseModel):
    """ Daily, Monthly """

    period: date
    label: str
    orders: int
    units: int
    gross_sales: Decimal
    discount: Decimal
    shipping: Decimal
    net_revenue: Decimal
    cancelled_orders: int
    cancelled_value: Decimal
    average_order_value: Decimal
    expenses: Decimal
    net_profit: Decimal


class SalesSummary(BaseModel):
    orders: int
    units: int
    gross_sales: Decimal
    discount: Decimal
    shipping: Decimal
    net_revenue: Decimal
    cancelled_orders: int
    cancelled_value: Decimal
    average_order_value: Decimal
    expenses: Decimal
    net_profit: Decimal
    previous_net_revenue: Decimal
    change_pct: float | None
    previous_expenses: Decimal
    previous_net_profit: Decimal
    # None rather than a number whenever the comparison window was not itself
    # profitable: a percentage across a loss-to-profit sign flip is nonsense.
    net_profit_change_pct: float | None
    best_period: date | None
    best_period_revenue: Decimal


class ReportBreakdown(BaseModel):
    """The range sliced by one dimension — order status, or payment method."""

    key: str | uuid.UUID
    label: str
    orders: int
    revenue: Decimal


class ReportProduct(BaseModel):
    product_id: uuid.UUID | None
    product_name: str
    units: int
    revenue: Decimal


class ExpenseBreakdown(BaseModel):
    """Spend in one category. Deliberately not `ReportBreakdown`, whose count
    field is named `orders` — an expense entry is not an order."""

    key: uuid.UUID
    label: str
    entries: int
    amount: Decimal


class SalesReport(BaseModel):
    granularity: Granularity
    start_date: date
    end_date: date
    timezone: str
    currency: str
    summary: SalesSummary
    buckets: list[SalesBucket]
    top_products: list[ReportProduct]
    status_breakdown: list[ReportBreakdown]
    payment_breakdown: list[ReportBreakdown]
    expense_breakdown: list[ExpenseBreakdown]
