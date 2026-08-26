"""Daily and monthly sales reports.

The interesting cases are the ones that are wrong by default: buckets the shop
did not trade in, orders that never became revenue, and the six-hour offset
between a UTC timestamp and a Dhaka day.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core import cache
from app.models.order import Order
from app.services import report_service
from tests.conftest import auth, standard_variants

ADDRESS = {
    "recipient_name": "Rahim Uddin",
    "phone": "01712345678",
    "line1": "House 12, Road 5",
    "city": "Dhaka",
    "district": "Dhaka",
    "postal_code": "1205",
}


async def _product(client, admin_token, *, name="Report Oud", stock=50):
    response = await client.post(
        "/api/v1/products",
        headers=auth(admin_token),
        json={"name": name, "is_active": True, "variants": standard_variants(stock=stock)},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _order(client, admin_token, customer_token, *, quantity=2):
    product = await _product(client, admin_token, name=f"Oud {quantity}")
    await client.post(
        "/api/v1/cart/items",
        json={"variant_id": product["variants"][0]["id"], "quantity": quantity},
        headers=auth(customer_token),
    )
    checkout = await client.post(
        "/api/v1/orders/checkout",
        json={"payment_method": "cod", "shipping_address": ADDRESS},
        headers=auth(customer_token),
    )
    assert checkout.status_code == 201, checkout.text
    return checkout.json()["order"]


async def _advance(client, admin_token, order_id, status):
    response = await client.patch(
        f"/api/v1/admin/orders/{order_id}",
        headers=auth(admin_token),
        json={"status": status},
    )
    assert response.status_code == 200, response.text
    return response.json()


# --- access ----------------------------------------------------------------

async def test_reports_require_a_token(client):
    response = await client.get("/api/v1/admin/reports/daily")
    assert response.status_code == 401


async def test_customer_cannot_read_reports(client, customer_token):
    response = await client.get("/api/v1/admin/reports/daily", headers=auth(customer_token))
    assert response.status_code == 403


# --- shape -----------------------------------------------------------------

async def test_daily_report_fills_quiet_days(client, admin_token):
    response = await client.get(
        "/api/v1/admin/reports/daily?start=2026-08-01&end=2026-08-07",
        headers=auth(admin_token),
    )
    assert response.status_code == 200, response.text
    report = response.json()

    # Seven days asked for, seven rows back, even with nothing sold.
    assert len(report["buckets"]) == 7
    assert [bucket["period"] for bucket in report["buckets"]][0] == "2026-08-01"
    assert report["buckets"][0]["label"] == "1 Aug 2026"
    assert report["summary"]["net_revenue"] == "0.00"
    assert report["summary"]["change_pct"] is None
    assert report["timezone"] == "Asia/Dhaka"


async def test_monthly_report_snaps_to_month_boundaries(client, admin_token):
    response = await client.get(
        "/api/v1/admin/reports/monthly?start=2026-03-17&end=2026-06-10",
        headers=auth(admin_token),
    )
    assert response.status_code == 200, response.text
    report = response.json()

    assert report["start_date"] == "2026-03-01"
    assert [bucket["period"] for bucket in report["buckets"]] == [
        "2026-03-01",
        "2026-04-01",
        "2026-05-01",
        "2026-06-01",
    ]
    assert report["buckets"][0]["label"] == "Mar 2026"


async def test_year_shorthand_covers_twelve_months(client, admin_token):
    response = await client.get(
        "/api/v1/admin/reports/monthly?year=2025", headers=auth(admin_token)
    )
    assert response.status_code == 200, response.text
    report = response.json()
    assert len(report["buckets"]) == 12
    assert report["start_date"] == "2025-01-01"
    assert report["end_date"] == "2025-12-31"


async def test_range_is_bounded(client, admin_token):
    response = await client.get(
        "/api/v1/admin/reports/daily?start=2020-01-01&end=2026-01-01",
        headers=auth(admin_token),
    )
    # BusinessRuleError is 422 across this codebase, not 400.
    assert response.status_code == 422
    assert "at most" in response.text


async def test_backwards_range_is_rejected(client, admin_token):
    response = await client.get(
        "/api/v1/admin/reports/daily?start=2026-08-10&end=2026-08-01",
        headers=auth(admin_token),
    )
    assert response.status_code == 422


# --- the numbers -----------------------------------------------------------

async def test_only_confirmed_orders_count_as_revenue(client, admin_token, customer_token):
    """A pending order is in the status breakdown but not in the takings."""
    order = await _order(client, admin_token, customer_token, quantity=2)
    today = report_service.today()
    url = f"/api/v1/admin/reports/daily?start={today}&end={today}"

    pending = (await client.get(url, headers=auth(admin_token))).json()
    assert pending["summary"]["orders"] == 0
    assert pending["summary"]["net_revenue"] == "0.00"
    assert pending["summary"]["units"] == 0
    # It still shows up as an order that exists.
    assert {row["key"] for row in pending["status_breakdown"]} == {"pending"}

    await _advance(client, admin_token, order["id"], "confirmed")

    confirmed = (await client.get(url, headers=auth(admin_token))).json()
    assert confirmed["summary"]["orders"] == 1
    assert confirmed["summary"]["units"] == 2
    assert confirmed["summary"]["net_revenue"] == f"{float(order['total']):.2f}"
    assert confirmed["summary"]["average_order_value"] == confirmed["summary"]["net_revenue"]
    assert confirmed["top_products"][0]["units"] == 2


async def test_cancelled_orders_are_reported_beside_revenue_not_inside_it(
    client, admin_token, customer_token
):
    order = await _order(client, admin_token, customer_token, quantity=1)
    await _advance(client, admin_token, order["id"], "confirmed")
    await _advance(client, admin_token, order["id"], "cancelled")

    today = report_service.today()
    report = (
        await client.get(
            f"/api/v1/admin/reports/daily?start={today}&end={today}",
            headers=auth(admin_token),
        )
    ).json()

    assert report["summary"]["net_revenue"] == "0.00"
    assert report["summary"]["cancelled_orders"] == 1
    assert report["summary"]["cancelled_value"] == f"{float(order['total']):.2f}"


async def test_units_do_not_inflate_the_money_columns(client, admin_token, customer_token):
    """The regression a naive join would cause: a basket of N lines must not
    multiply the order's total by N. The line totals are collapsed to one row
    per order before they meet `orders`, and this is what says so."""
    product = await _product(client, admin_token, name="Multi Line", stock=50)
    for variant in product["variants"][:3]:
        await client.post(
            "/api/v1/cart/items",
            json={"variant_id": variant["id"], "quantity": 2},
            headers=auth(customer_token),
        )
    checkout = await client.post(
        "/api/v1/orders/checkout",
        json={"payment_method": "cod", "shipping_address": ADDRESS},
        headers=auth(customer_token),
    )
    order = checkout.json()["order"]
    await _advance(client, admin_token, order["id"], "confirmed")

    today = report_service.today()
    report = (
        await client.get(
            f"/api/v1/admin/reports/daily?start={today}&end={today}",
            headers=auth(admin_token),
        )
    ).json()

    assert report["summary"]["orders"] == 1
    assert report["summary"]["units"] == 6  # three lines of two
    assert report["summary"]["net_revenue"] == f"{float(order['total']):.2f}"


async def test_a_dhaka_day_is_not_a_utc_day(
    client, admin_token, customer_token, session_factory
):
    """02:00 Dhaka is 20:00 the previous day in UTC.

    Bucketing on the raw column would file this order under yesterday; the
    report must file it under the local day the shop actually sold it on.
    """
    order = await _order(client, admin_token, customer_token, quantity=1)
    await _advance(client, admin_token, order["id"], "confirmed")

    local_day = report_service.today()
    # 02:00 local on the shop's today, expressed as the UTC instant it really is.
    at_2am_utc = datetime.combine(
        local_day, datetime.min.time(), tzinfo=report_service._tz()
    ) + timedelta(hours=2)
    assert at_2am_utc.astimezone(UTC).date() == local_day - timedelta(days=1)

    async with session_factory() as session:
        row = await session.scalar(select(Order).where(Order.id == order["id"]))
        row.created_at = at_2am_utc.astimezone(UTC)
        await session.commit()

    report = (
        await client.get(
            f"/api/v1/admin/reports/daily?start={local_day}&end={local_day}",
            headers=auth(admin_token),
        )
    ).json()

    assert len(report["buckets"]) == 1
    assert report["buckets"][0]["period"] == local_day.isoformat()
    assert report["summary"]["orders"] == 1


async def test_previous_window_drives_the_comparison(
    client, admin_token, customer_token, session_factory
):
    """The comparison total comes out of the same widened scan as the buckets.

    An order backdated into the window immediately before the report's range
    must land in `previous_net_revenue` and nowhere else: not in the takings,
    and not as a bucket of its own.
    """
    order = await _order(client, admin_token, customer_token, quantity=1)
    await _advance(client, admin_token, order["id"], "confirmed")

    day = report_service.today()
    # The range is the single day `day`, so its comparison window is the single
    # day before it. Put the order there.
    async with session_factory() as session:
        row = await session.scalar(select(Order).where(Order.id == order["id"]))
        row.created_at = datetime.combine(
            day - timedelta(days=1), datetime.min.time(), tzinfo=report_service._tz()
        ).astimezone(UTC) + timedelta(hours=10)
        await session.commit()

    report = (
        await client.get(
            f"/api/v1/admin/reports/daily?start={day}&end={day}",
            headers=auth(admin_token),
        )
    ).json()

    assert len(report["buckets"]) == 1
    assert report["summary"]["net_revenue"] == "0.00"
    assert report["summary"]["orders"] == 0
    assert report["summary"]["previous_net_revenue"] == f"{float(order['total']):.2f}"
    # Nothing this period against something last period is a full decline.
    assert report["summary"]["change_pct"] == -100.0
    # And the earlier order stays out of the slices, which only cover the range.
    assert report["status_breakdown"] == []


async def test_both_breakdowns_come_back_from_one_grouping_sets_scan(
    client, admin_token, customer_token
):
    """Status and payment method are grouped in a single query; each row has to
    be filed under the right one of the two."""
    order = await _order(client, admin_token, customer_token, quantity=1)
    await _advance(client, admin_token, order["id"], "confirmed")

    day = report_service.today()
    report = (
        await client.get(
            f"/api/v1/admin/reports/daily?start={day}&end={day}",
            headers=auth(admin_token),
        )
    ).json()

    assert [(row["key"], row["label"]) for row in report["status_breakdown"]] == [
        ("confirmed", "Confirmed")
    ]
    assert [(row["key"], row["label"]) for row in report["payment_breakdown"]] == [
        ("cod", "Cash on delivery")
    ]
    for row in report["status_breakdown"] + report["payment_breakdown"]:
        assert row["orders"] == 1
        assert row["revenue"] == f"{float(order['total']):.2f}"


# --- caching ---------------------------------------------------------------

async def test_a_closed_range_survives_an_order_write(
    client, admin_token, customer_token
):
    """A report of a range that has already ended sits in REPORTS_ARCHIVE, which
    order writes do not clear — otherwise every sale would throw away every
    historical report the panel had built."""
    cache.cache.clear()
    closed_end = report_service.today() - timedelta(days=2)
    closed = f"start={closed_end - timedelta(days=6)}&end={closed_end}"
    live = f"start={report_service.today()}&end={report_service.today()}"

    for query in (closed, live):
        assert (
            await client.get(
                f"/api/v1/admin/reports/daily?{query}", headers=auth(admin_token)
            )
        ).status_code == 200

    assert cache.cache.size(cache.REPORTS_ARCHIVE) == 1
    assert cache.cache.size(cache.REPORTS) == 1

    # An order write clears the live shelf and leaves the archive alone.
    await _order(client, admin_token, customer_token, quantity=1)

    assert cache.cache.size(cache.REPORTS) == 0
    assert cache.cache.size(cache.REPORTS_ARCHIVE) == 1


async def test_a_repeated_report_is_served_from_cache(client, admin_token):
    cache.cache.clear()
    url = "/api/v1/admin/reports/monthly?year=2024"

    first = await client.get(url, headers=auth(admin_token))
    hits_before = cache.cache.stats.hits
    second = await client.get(url, headers=auth(admin_token))

    assert first.json() == second.json()
    assert cache.cache.stats.hits == hits_before + 1


# --- export ----------------------------------------------------------------

async def test_csv_export_carries_a_total_row(client, admin_token, customer_token):
    order = await _order(client, admin_token, customer_token, quantity=1)
    await _advance(client, admin_token, order["id"], "confirmed")

    today = report_service.today()
    response = await client.get(
        f"/api/v1/admin/reports/export?granularity=daily&start={today}&end={today}",
        headers=auth(admin_token),
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "attachment" in response.headers["content-disposition"]

    lines = [line for line in response.text.splitlines() if line.strip()]
    assert lines[0].startswith("Period,Orders,Units")
    assert lines[-1].startswith("Total,1,1,")
