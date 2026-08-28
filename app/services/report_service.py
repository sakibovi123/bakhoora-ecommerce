"""Daily and monthly sales reporting.

Three decisions shape this module.

*Local days.* `Order.created_at` is a timestamptz stored in UTC, but a shop's
Tuesday is a Dhaka Tuesday. The bucket expression converts to
`settings.REPORT_TIMEZONE` before truncating. The range filter, however, is
built from UTC instants computed in Python â filtering on the converted
expression instead would make the index on `created_at` unusable, which on a
two-year range is the difference between a report and a timeout.

*Round trips are the budget.* The database is Supabase, reached over the public
internet, so a report's cost is dominated by how many times it asks rather than
by how much each answer weighs. What the shape of this module optimises for is
therefore three queries, not six:

  1. `_bucket_rows` — money, units and the comparison window, together.
  2. `_breakdowns` — status and payment method, from one GROUPING SETS scan.
  3. `_top_products` — the only one at line grain rather than order grain.

*Units without inflation.* Money comes off `orders`, units off `order_items`,
and joining the two directly would multiply each order row by its line count
and inflate every money column by the size of the basket. The line totals are
therefore collapsed to one row per order in a subquery *before* the join, which
keeps it one-to-one; `test_units_do_not_inflate_the_money_columns` is the guard
on that. Aggregating separately and merging in Python would work equally well
and cost one more round trip.

*The comparison window rides along.* The previous period is the same shape of
query over an adjacent range, so it is folded into the bucket query by widening
the range and bucketing only the rows at or after `first`. Everything earlier
falls into a single NULL-period row, which is exactly the total wanted.

*One query shape, two granularities.* Daily and monthly differ only in the unit
handed to `date_trunc`, so the API exposes two thin routes over one function.
"""

import csv
import io
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import case, distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import BusinessRuleError
from app.models.order import Order, OrderItem, OrderStatus
from app.models.product import ProductVariant
from app.schemas.report import (
    ExpenseBreakdown,
    Granularity,
    ReportBreakdown,
    ReportProduct,
    SalesBucket,
    SalesReport,
    SalesSummary,
)
from app.services import expense_service, order_service

TOP_PRODUCT_LIMIT = 10
MAX_RANGE_DAYS = 731
LOST_STATUSES = (
    OrderStatus.CANCELLED,
    OrderStatus.REFUNDED
)

_ZERO = Decimal("0.00")
# Covers both what the payment providers register themselves as and what is
# already sitting in the orders table. Anything unmapped falls through to a
# title-cased key rather than vanishing — a new method should show up as itself,
# not as a blank row.
_PAYMENT_LABELS = {
    "cod": "Cash on delivery",
    "bkash": "bKash",
    "manual_bkash": "bKash (manual)",
    "nagad": "Nagad",
    "rocket": "Rocket",
    "card": "Card",
    "bank": "Bank transfer",
}

def _tz() -> ZoneInfo:
    return ZoneInfo(settings.REPORT_TIMEZONE)

def today() -> date:
    return datetime.now(_tz()).date()

def months_before(period: date, count: int) -> date:
    index = period.year * 12 + (period.month - 1) - count
    return date(index // 12, index % 12 + 1, 1)

def _utc_window(start: date, end: date) -> tuple[datetime, datetime]:
    tz = _tz()
    first = datetime.combine(start, time.min, tzinfo=tz)
    last = datetime.combine(end + timedelta(days=1), time.min, tzinfo=tz)
    return first.astimezone(UTC), last.astimezone(UTC)

def _bucket(unit: str):
    return func.date_trunc(unit, func.timezone(settings.REPORT_TIMEZONE, Order.created_at))

def _periods(start: date, end:date, granularity: Granularity) -> list[date]:
    if granularity == 'daily':
        return [start + timedelta(days=offset) for offset in range((end - start).days + 1)]

    periods, cursor = [], start.replace(day=1)
    while cursor <= end:
        periods.append(cursor)
        cursor = (cursor.replace(day=28) + timedelta(days=4)).replace(day=1)

    return periods

def _label(period: date, gran: Granularity) -> str:
    return f"{period:%b %Y}" if gran == 'monthly' else f"{period.day} {period:%b %Y}"

def _validate(start: date, end:date) -> None:
    if end < start:
        raise BusinessRuleError("End date must be on or after start date.")
    if (end - start).days > MAX_RANGE_DAYS:
        raise BusinessRuleError(
            f"A report can cover at most {MAX_RANGE_DAYS} days. Narrow the range."
        )

def _money(value) -> Decimal:
    return Decimal(value or 0).quantize(Decimal("0.01"))

def _average(revenue: Decimal, orders: int) -> Decimal:
    return _money(revenue / orders) if orders else _ZERO

# --- queries ---------------------------------------------------------------

def _units_per_order(first: datetime, last: datetime):
    """Line quantities collapsed to one row per order.

    Collapsing *before* the join is the whole point: joining `order_items`
    straight onto `orders` would repeat each order once per line and multiply
    every money column by the size of the basket.
    """
    return (
        select(
            OrderItem.order_id.label("order_id"),
            func.sum(OrderItem.quantity).label("units"),
        )
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.created_at >= first, Order.created_at < last)
        .group_by(OrderItem.order_id)
        .subquery()
    )


async def _bucket_rows(
    db: AsyncSession, unit: str, first: datetime, last: datetime, previous: datetime
) -> tuple[dict[date, object], object | None]:
    """Money and units per bucket, plus the comparison window, in one query.

    The scan runs from `previous` — the start of the preceding window — but
    only rows at or after `first` get a bucket. Everything before it evaluates
    to NULL and so collapses into a single row carrying the previous period's
    totals, which is the one number the summary needs from that window.

    The widened scan is why `MAX_RANGE_DAYS` matters twice over: a report of
    the longest allowed range reads twice that many days of orders. It stays a
    range scan on `ix_orders_created_at_status` either way.
    """
    period = case((Order.created_at >= first, _bucket(unit))).label("period")
    sold = Order.status.in_(order_service.REVENUE_STATUSES)
    lost = Order.status.in_(LOST_STATUSES)
    # Only the reported range, not the widened one: the comparison row is read
    # for its revenue alone, so counting the previous window's lines would be
    # work thrown away. Orders before `first` simply join to NULL.
    units = _units_per_order(first, last)

    def total(column, condition):
        return func.coalesce(
            func.sum(column).filter(condition), 0
        )

    rows = await db.execute(
        select(
            period,
            func.count(Order.id).filter(sold).label("orders"),
            total(Order.subtotal, sold).label("gross_sales"),
            total(Order.discount_total, sold).label("discount"),
            total(Order.shipping_fee, sold).label("shipping"),
            total(Order.total, sold).label("net_revenue"),
            func.count(Order.id).filter(lost).label("cancelled_orders"),
            total(Order.total, lost).label("cancelled_value"),
            total(units.c.units, sold).label("units"),
        )
        .select_from(Order)
        .outerjoin(units, units.c.order_id == Order.id)
        .where(Order.created_at >= previous, Order.created_at < last)
        .group_by(period)
    )

    buckets: dict[date, object] = {}
    comparison = None
    for row in rows.all():
        if row.period is None:
            comparison = row
        else:
            buckets[row.period.date()] = row
    return buckets, comparison


async def _top_products(db: AsyncSession, first: datetime, last: datetime) -> list[ReportProduct]:
    units = func.sum(OrderItem.quantity)
    rows = await db.execute(
        select(
            OrderItem.product_name,
            func.array_agg(distinct(ProductVariant.product_id)).label("product_ids"),
            units.label("units"),
            func.coalesce(func.sum(OrderItem.line_total), 0).label("revenue"),
        )
        .select_from(OrderItem)
        .join(Order, Order.id == OrderItem.order_id)
        .outerjoin(ProductVariant, ProductVariant.id == OrderItem.variant_id)
        .where(
            Order.created_at >= first,
            Order.created_at < last,
            Order.status.in_(order_service.REVENUE_STATUSES),
        )
        .group_by(OrderItem.product_name)
        .order_by(units.desc())
        .limit(TOP_PRODUCT_LIMIT)
    )
    
    return [
        ReportProduct(
            product_id=next((pid for pid in row.product_ids if pid), None),
            product_name=row.product_name,
            units=row.units,
            revenue=_money(row.revenue),
        )
        for row in rows
    ]
    
def _status_label(value) -> str:
    return str(getattr(value, "value", value)).replace("_", " ").capitalize()


def _payment_label(value) -> str:
    key = str(getattr(value, "value", value))
    return _PAYMENT_LABELS.get(key, key.replace("_", " ").capitalize())


def _row_to_breakdown(key, orders: int, revenue, labeller) -> ReportBreakdown:
    return ReportBreakdown(
        key=str(getattr(key, "value", key)),
        label=labeller(key),
        orders=orders,
        revenue=_money(revenue),
    )


async def _breakdowns(
    db: AsyncSession, first: datetime, last: datetime
) -> tuple[list[ReportBreakdown], list[ReportBreakdown]]:
    """Status and payment-method slices of the same range, in one query.

    Two separate `GROUP BY`s over identical rows with an identical filter is
    two scans and two round trips for one scan's worth of work. GROUPING SETS
    asks Postgres for both at once; each result row belongs to whichever set
    left its column non-NULL, and since both columns are NOT NULL in the table
    that test is unambiguous. The single ORDER BY sorts the union, so each list
    still comes out revenue-first once split.
    """
    revenue = func.coalesce(func.sum(Order.total), 0)
    rows = await db.execute(
        select(
            Order.status.label("status"),
            Order.payment_method.label("payment_method"),
            func.count(Order.id).label("orders"),
            revenue.label("revenue"),
        )
        .where(Order.created_at >= first, Order.created_at < last)
        .group_by(func.grouping_sets(Order.status, Order.payment_method))
        .order_by(revenue.desc())
    )

    statuses: list[ReportBreakdown] = []
    payments: list[ReportBreakdown] = []
    for row in rows:
        if row.status is not None:
            statuses.append(
                _row_to_breakdown(row.status, row.orders, row.revenue, _status_label)
            )
        else:
            payments.append(
                _row_to_breakdown(
                    row.payment_method, row.orders, row.revenue, _payment_label
                )
            )
    return statuses, payments


# --- assembly --------------------------------------------------------------

async def sales_report(
    db: AsyncSession, *, start: date, end: date, granularity: Granularity
) -> SalesReport:
    _validate(start, end)
    unit = "month" if granularity == "monthly" else "day"
    # A monthly report always begins at a month boundary, whatever day was
    # asked for — otherwise the first bucket silently covers a part-month.
    if granularity == "monthly":
        start = start.replace(day=1)
    first, last = _utc_window(start, end)
    # The window of equal length ending the day before `start`. `_utc_window`
    # is half-open, so its upper bound is `first` exactly: one contiguous scan.
    span = (end - start).days + 1
    previous_first, _ = _utc_window(start - timedelta(days=span), start - timedelta(days=1))

    money, comparison = await _bucket_rows(db, unit, first, last, previous_first)
    # Plain dates, never `first.date()`: those are UTC instants, and Dhaka
    # midnight is 18:00 UTC the day before, so the lower bound would land a day
    # early while the upper bound happened to be right. `start` here is already
    # snapped to the first of the month for a monthly report.
    spend = await expense_service.totals(
        db,
        unit=unit,
        start=start,
        end=end,
        previous_start=start - timedelta(days=span),
    )

    buckets: list[SalesBucket] = []
    for period in _periods(start, end, granularity):
        row = money.get(period)
        orders = row.orders if row else 0
        net = _money(row.net_revenue) if row else _ZERO
        spent = spend.by_period[period].amount if period in spend.by_period else _ZERO
        buckets.append(
            SalesBucket(
                period=period,
                label=_label(period, granularity),
                orders=orders,
                units=row.units if row else 0,
                gross_sales=_money(row.gross_sales) if row else _ZERO,
                discount=_money(row.discount) if row else _ZERO,
                shipping=_money(row.shipping) if row else _ZERO,
                net_revenue=net,
                cancelled_orders=row.cancelled_orders if row else 0,
                cancelled_value=_money(row.cancelled_value) if row else _ZERO,
                average_order_value=_average(net, orders),
                expenses=spent,
                net_profit=net - spent,
            )
        )

    total_orders = sum(bucket.orders for bucket in buckets)
    total_net = sum((bucket.net_revenue for bucket in buckets), _ZERO)
    previous = _money(comparison.net_revenue) if comparison else _ZERO
    total_expenses = sum((bucket.expenses for bucket in buckets), _ZERO)
    total_profit = total_net - total_expenses
    previous_profit = previous - spend.previous
    best = max(buckets, key=lambda bucket: bucket.net_revenue, default=None)

    summary = SalesSummary(
        orders=total_orders,
        units=sum(bucket.units for bucket in buckets),
        gross_sales=sum((bucket.gross_sales for bucket in buckets), _ZERO),
        discount=sum((bucket.discount for bucket in buckets), _ZERO),
        shipping=sum((bucket.shipping for bucket in buckets), _ZERO),
        net_revenue=total_net,
        cancelled_orders=sum(bucket.cancelled_orders for bucket in buckets),
        cancelled_value=sum((bucket.cancelled_value for bucket in buckets), _ZERO),
        average_order_value=_average(total_net, total_orders),
        previous_net_revenue=previous,
        # Growth from nothing has no percentage. None so the panel shows a dash
        # rather than a fabricated +100%.
        change_pct=(
            round(float((total_net - previous) / previous * 100), 1) if previous else None
        ),
        expenses=total_expenses,
        net_profit=total_profit,
        previous_expenses=spend.previous,
        previous_net_profit=previous_profit,
        # Only when the window being compared against actually made money.
        # Percentage change out of a loss has no sensible reading.
        net_profit_change_pct=(
            round(float((total_profit - previous_profit) / previous_profit * 100), 1)
            if previous_profit > 0
            else None
        ),
        # Still revenue's best month, not profit's. Redefining a figure the
        # operator already reads would be a silent change of meaning.
        best_period=best.period if best and best.net_revenue else None,
        best_period_revenue=best.net_revenue if best else _ZERO,
    )

    status_breakdown, payment_breakdown = await _breakdowns(db, first, last)

    # Names are resolved here rather than joined into the aggregate: the
    # category table is small and separately cached, and dragging a text column
    # through GROUPING SETS buys nothing.
    names = {
        category.id: category.name
        for category in await expense_service.list_categories(db, include_inactive=True)
    }
    expense_breakdown = [
        ExpenseBreakdown(
            key=row.category_id,
            label=names.get(row.category_id, "Removed category"),
            entries=row.entries,
            amount=row.amount,
        )
        for row in spend.by_category
    ]

    return SalesReport(
        granularity=granularity,
        start_date=start,
        end_date=end,
        timezone=settings.REPORT_TIMEZONE,
        currency=settings.CURRENCY,
        summary=summary,
        buckets=buckets,
        top_products=await _top_products(db, first, last),
        status_breakdown=status_breakdown,
        payment_breakdown=payment_breakdown,
        expense_breakdown=expense_breakdown,
    )


def to_csv(report: SalesReport) -> str:
    """The buckets as a spreadsheet, for whoever wants this in Excel."""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    columns = (
        "Period",
        "Orders",
        "Units",
        f"Gross ({report.currency})",
        "Discount",
        "Shipping",
        "Net revenue",
        "Cancelled orders",
        "Cancelled value",
        "Average order",
        # Appended rather than slotted next to the revenue columns: the test
        # suite pins the leading header and the Total row prefix, and existing
        # spreadsheets read by position.
        "Expenses",
        "Net profit",
    )
    writer.writerow(columns)
    for bucket in report.buckets:
        writer.writerow(
            (
                bucket.label,
                bucket.orders,
                bucket.units,
                bucket.gross_sales,
                bucket.discount,
                bucket.shipping,
                bucket.net_revenue,
                bucket.cancelled_orders,
                bucket.cancelled_value,
                bucket.average_order_value,
                bucket.expenses,
                bucket.net_profit,
            )
        )
    total = report.summary
    writer.writerow(())
    writer.writerow(
        (
            "Total",
            total.orders,
            total.units,
            total.gross_sales,
            total.discount,
            total.shipping,
            total.net_revenue,
            total.cancelled_orders,
            total.cancelled_value,
            total.average_order_value,
            total.expenses,
            total.net_profit,
        )
    )
    return buffer.getvalue()


__all__ = ["months_before", "sales_report", "to_csv", "today"]
