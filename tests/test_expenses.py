"""Expenses, and their effect on the sales report.

The cases worth pinning are the ones that are wrong by default: an expense
belongs to the day it was *paid* rather than the day it was typed in, deleting
a category must not take spending history with it, and back-dating into a month
that has already closed has to reach a report the archive shelf is holding.
"""

from datetime import timedelta

from app.core import cache
from app.services import report_service
from tests.conftest import auth


async def _category(client, admin_token, name="Packaging"):
    response = await client.post(
        "/api/v1/admin/expense-categories",
        headers=auth(admin_token),
        json={"name": name},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _expense(client, admin_token, category_id, *, spent_on, amount, description="Vials"):
    response = await client.post(
        "/api/v1/admin/expenses",
        headers=auth(admin_token),
        json={
            "spent_on": str(spent_on),
            "amount": amount,
            "description": description,
            "category_id": category_id,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


# --- crud -------------------------------------------------------------------


async def test_an_expense_round_trips_with_its_category(client, admin_token):
    category = await _category(client, admin_token)
    today = report_service.today()

    created = await _expense(
        client, admin_token, category["id"], spent_on=today, amount="450.00"
    )
    assert created["amount"] == "450.00"
    assert created["category"]["name"] == "Packaging"
    assert created["spent_on"] == str(today)

    # The category has to survive serialisation: it is a lazy relationship, and
    # FastAPI renders the response outside the async context that could load it.
    fetched = await client.get(
        f"/api/v1/admin/expenses/{created['id']}", headers=auth(admin_token)
    )
    assert fetched.status_code == 200
    assert fetched.json()["category"]["slug"] == category["slug"]


async def test_the_list_total_covers_the_whole_filter_not_the_page(client, admin_token):
    category = await _category(client, admin_token)
    today = report_service.today()
    for index in range(3):
        await _expense(
            client,
            admin_token,
            category["id"],
            spent_on=today - timedelta(days=index),
            amount="100.00",
        )

    response = await client.get(
        "/api/v1/admin/expenses?size=1", headers=auth(admin_token)
    )
    body = response.json()
    assert len(body["items"]) == 1
    assert body["total"] == 3
    # Not 100.00: a total that shrank to the page would answer a question
    # nobody asked.
    assert body["total_spent"] == "300.00"


async def test_a_date_range_filters_on_the_day_it_was_paid(client, admin_token):
    category = await _category(client, admin_token)
    today = report_service.today()
    await _expense(
        client, admin_token, category["id"], spent_on=today, amount="10.00"
    )
    await _expense(
        client,
        admin_token,
        category["id"],
        spent_on=today - timedelta(days=40),
        amount="20.00",
    )

    response = await client.get(
        f"/api/v1/admin/expenses?start={today}&end={today}", headers=auth(admin_token)
    )
    assert response.json()["total_spent"] == "10.00"


async def test_a_category_in_use_cannot_be_deleted(client, admin_token):
    category = await _category(client, admin_token)
    await _expense(
        client,
        admin_token,
        category["id"],
        spent_on=report_service.today(),
        amount="99.00",
    )

    response = await client.delete(
        f"/api/v1/admin/expense-categories/{category['id']}", headers=auth(admin_token)
    )
    assert response.status_code == 409
    # The message has to say what to do instead, not just refuse.
    assert "filed under" in response.json()["error"]["message"]


async def test_an_unused_category_deletes(client, admin_token):
    category = await _category(client, admin_token, name="Scratch")
    response = await client.delete(
        f"/api/v1/admin/expense-categories/{category['id']}", headers=auth(admin_token)
    )
    assert response.status_code == 204


async def test_expenses_are_staff_only(client, customer_token):
    for path in ("/api/v1/admin/expenses", "/api/v1/admin/expense-categories"):
        assert (await client.get(path)).status_code == 401
        assert (await client.get(path, headers=auth(customer_token))).status_code == 403


# --- the report -------------------------------------------------------------


async def test_spending_lands_in_the_month_it_was_paid(client, admin_token):
    category = await _category(client, admin_token)
    today = report_service.today()
    this_month = today.replace(day=1)
    last_month = report_service.months_before(this_month, 1)

    await _expense(
        client, admin_token, category["id"], spent_on=this_month, amount="1000.00"
    )
    await _expense(
        client, admin_token, category["id"], spent_on=last_month, amount="250.00"
    )

    response = await client.get(
        f"/api/v1/admin/reports/monthly?start={last_month}&end={today}",
        headers=auth(admin_token),
    )
    body = response.json()
    by_period = {bucket["period"]: bucket for bucket in body["buckets"]}

    assert by_period[str(last_month)]["expenses"] == "250.00"
    assert by_period[str(this_month)]["expenses"] == "1000.00"
    assert body["summary"]["expenses"] == "1250.00"
    # No orders in these tests, so profit is the spend as a negative.
    assert body["summary"]["net_profit"] == "-1250.00"


async def test_the_breakdown_splits_by_category(client, admin_token):
    packaging = await _category(client, admin_token, name="Packaging")
    transport = await _category(client, admin_token, name="Transport")
    today = report_service.today()

    await _expense(client, admin_token, packaging["id"], spent_on=today, amount="800.00")
    await _expense(client, admin_token, packaging["id"], spent_on=today, amount="200.00")
    await _expense(client, admin_token, transport["id"], spent_on=today, amount="300.00")

    response = await client.get(
        f"/api/v1/admin/reports/daily?start={today}&end={today}",
        headers=auth(admin_token),
    )
    rows = response.json()["expense_breakdown"]

    # Biggest first, and entries counts entries rather than orders.
    assert [(row["label"], row["amount"], row["entries"]) for row in rows] == [
        ("Packaging", "1000.00", 2),
        ("Transport", "300.00", 1),
    ]


async def test_a_range_with_no_spending_reports_zero_not_nothing(client, admin_token):
    today = report_service.today()
    response = await client.get(
        f"/api/v1/admin/reports/daily?start={today}&end={today}",
        headers=auth(admin_token),
    )
    body = response.json()
    assert body["summary"]["expenses"] == "0.00"
    assert body["expense_breakdown"] == []
    assert body["buckets"][0]["expenses"] == "0.00"


async def test_a_back_dated_expense_clears_the_archive(client, admin_token):
    """The mirror of test_a_closed_range_survives_an_order_write.

    An order lands in the range it was placed in, so a closed range cannot gain
    one and the archive is safe to hold. Expenses are the opposite: typing up
    last week's receipt is routine and it changes a month that has already
    ended, so the archive has to go.
    """
    category = await _category(client, admin_token)
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

    await _expense(
        client, admin_token, category["id"], spent_on=closed_end, amount="75.00"
    )

    assert cache.cache.size(cache.REPORTS) == 0
    assert cache.cache.size(cache.REPORTS_ARCHIVE) == 0

    # And the rebuilt report actually shows it.
    response = await client.get(
        f"/api/v1/admin/reports/daily?{closed}", headers=auth(admin_token)
    )
    assert response.json()["summary"]["expenses"] == "75.00"
