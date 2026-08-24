"""Payloads that only the admin panel uses."""

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.order import OrderListItem
from app.schemas.user import UserOut


class DashboardCounters(BaseModel):
    total_orders: int
    pending_orders: int
    revenue: Decimal
    low_stock_variants: int
    total_customers: int
    active_products: int
    currency: str


class RevenuePoint(BaseModel):
    day: date
    orders: int
    revenue: Decimal


class TopProduct(BaseModel):
    product_id: uuid.UUID | None
    product_name: str
    units: int
    revenue: Decimal


class LowStockVariant(BaseModel):
    variant_id: uuid.UUID
    product_id: uuid.UUID
    product_name: str
    product_slug: str
    size_ml: int
    sku: str
    stock_quantity: int


class Dashboard(BaseModel):
    counters: DashboardCounters
    revenue_series: list[RevenuePoint]
    top_products: list[TopProduct]
    recent_orders: list[OrderListItem]
    low_stock: list[LowStockVariant]


class StockLine(BaseModel):
    variant_id: uuid.UUID
    stock_quantity: int = Field(ge=0)


class StockUpdate(BaseModel):
    """Set absolute stock counts for many variants in one round trip."""

    lines: list[StockLine] = Field(min_length=1, max_length=200)


class StockLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    variant_id: uuid.UUID
    sku: str
    stock_quantity: int


class CustomerDetail(BaseModel):
    user: UserOut
    order_count: int
    lifetime_value: Decimal
    currency: str
    last_order_at: datetime | None
    orders: list[OrderListItem]


class CustomerUpdate(BaseModel):
    is_active: bool | None = None
    role_id: uuid.UUID | None = None


class CategoryPosition(BaseModel):
    id: uuid.UUID
    position: int = Field(ge=0)


class CategoryReorder(BaseModel):
    items: list[CategoryPosition] = Field(min_length=1)
