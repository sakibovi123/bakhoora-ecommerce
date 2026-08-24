from app.core.config import settings
from tests.conftest import auth, role_id, standard_variants

ADDRESS = {
    "recipient_name": "Rahim Uddin",
    "phone": "01712345678",
    "line1": "House 12, Road 5",
    "city": "Dhaka",
    "district": "Dhaka",
    "postal_code": "1205",
}


async def _product(client, admin_token, *, name="Admin Oud", stock=10, active=True):
    response = await client.post(
        "/api/v1/products",
        headers=auth(admin_token),
        json={
            "name": name,
            "is_active": active,
            "variants": standard_variants(stock=stock),
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _place_order(client, admin_token, customer_token):
    product = await _product(client, admin_token, name="Order Oud")
    await client.post(
        "/api/v1/cart/items",
        json={"variant_id": product["variants"][0]["id"], "quantity": 2},
        headers=auth(customer_token),
    )
    checkout = await client.post(
        "/api/v1/orders/checkout",
        json={"payment_method": "cod", "shipping_address": ADDRESS},
        headers=auth(customer_token),
    )
    assert checkout.status_code == 201, checkout.text
    return checkout.json()["order"]


# --- access ----------------------------------------------------------------

async def test_admin_endpoints_reject_customers(client, customer_token):
    for path in ["/api/v1/admin/dashboard", "/api/v1/admin/products", "/api/v1/admin/users"]:
        assert (await client.get(path, headers=auth(customer_token))).status_code == 403


async def test_admin_endpoints_reject_anonymous(client):
    assert (await client.get("/api/v1/admin/dashboard")).status_code == 401


# --- dashboard -------------------------------------------------------------

async def test_dashboard_reports_counters_and_a_full_day_series(client, admin_token):
    await _product(client, admin_token)
    response = await client.get("/api/v1/admin/dashboard?days=7", headers=auth(admin_token))
    assert response.status_code == 200
    body = response.json()

    assert body["counters"]["active_products"] == 1
    assert body["counters"]["currency"] == settings.CURRENCY
    # Every day in the window is present, including the ones with no orders.
    assert len(body["revenue_series"]) == 7
    assert body["revenue_series"] == sorted(body["revenue_series"], key=lambda p: p["day"])
    assert all(point["orders"] == 0 for point in body["revenue_series"])


async def test_dashboard_counts_a_placed_order(client, admin_token, customer_token):
    order = await _place_order(client, admin_token, customer_token)
    body = (await client.get("/api/v1/admin/dashboard", headers=auth(admin_token))).json()

    assert body["counters"]["total_orders"] == 1
    assert body["counters"]["pending_orders"] == 1
    assert body["counters"]["total_customers"] == 1
    assert [o["order_number"] for o in body["recent_orders"]] == [order["order_number"]]
    # A pending order is not revenue yet.
    assert body["counters"]["revenue"] == "0.00"
    assert body["top_products"] == []


async def test_confirmed_order_becomes_revenue_and_a_top_product(
    client, admin_token, customer_token
):
    order = await _place_order(client, admin_token, customer_token)
    await client.patch(
        f"/api/v1/admin/orders/{order['id']}",
        json={"status": "confirmed"},
        headers=auth(admin_token),
    )
    body = (await client.get("/api/v1/admin/dashboard", headers=auth(admin_token))).json()

    assert body["counters"]["revenue"] == order["total"]
    assert body["top_products"][0]["product_name"] == "Order Oud"
    assert body["top_products"][0]["units"] == 2
    assert sum(point["orders"] for point in body["revenue_series"]) == 1


async def test_dashboard_lists_low_stock_variants(client, admin_token):
    await _product(client, admin_token, name="Scarce Oud", stock=1)
    body = (await client.get("/api/v1/admin/dashboard", headers=auth(admin_token))).json()

    assert body["counters"]["low_stock_variants"] == 4
    assert {row["product_name"] for row in body["low_stock"]} == {"Scarce Oud"}
    assert body["low_stock"][0]["stock_quantity"] == 1


# --- products --------------------------------------------------------------

async def test_admin_listing_sees_inactive_products_and_the_storefront_does_not(
    client, admin_token
):
    await _product(client, admin_token, name="Hidden Oud", active=False)
    await _product(client, admin_token, name="Live Oud", active=True)

    storefront = (await client.get("/api/v1/products")).json()
    assert [p["name"] for p in storefront["items"]] == ["Live Oud"]

    panel = (await client.get("/api/v1/admin/products", headers=auth(admin_token))).json()
    assert {p["name"] for p in panel["items"]} == {"Hidden Oud", "Live Oud"}
    assert panel["total"] == 2


async def test_admin_listing_can_isolate_inactive_products(client, admin_token):
    await _product(client, admin_token, name="Hidden Oud", active=False)
    await _product(client, admin_token, name="Live Oud", active=True)

    hidden = (
        await client.get("/api/v1/admin/products?active=false", headers=auth(admin_token))
    ).json()
    # The filter is applied in SQL, so the total reflects it too.
    assert [p["name"] for p in hidden["items"]] == ["Hidden Oud"]
    assert hidden["total"] == 1


async def test_admin_listing_filters_low_stock(client, admin_token):
    await _product(client, admin_token, name="Scarce Oud", stock=1)
    await _product(client, admin_token, name="Stocked Oud", stock=50)

    scarce = (
        await client.get("/api/v1/admin/products?low_stock=true", headers=auth(admin_token))
    ).json()
    assert [p["name"] for p in scarce["items"]] == ["Scarce Oud"]


async def test_admin_fetches_a_product_by_id(client, admin_token):
    product = await _product(client, admin_token)
    response = await client.get(
        f"/api/v1/admin/products/{product['id']}", headers=auth(admin_token)
    )
    assert response.status_code == 200
    assert response.json()["slug"] == "admin-oud"


# --- stock -----------------------------------------------------------------

async def test_bulk_stock_update(client, admin_token):
    product = await _product(client, admin_token, stock=10)
    lines = [
        {"variant_id": product["variants"][0]["id"], "stock_quantity": 0},
        {"variant_id": product["variants"][1]["id"], "stock_quantity": 99},
    ]
    response = await client.patch(
        "/api/v1/admin/stock", json={"lines": lines}, headers=auth(admin_token)
    )
    assert response.status_code == 200
    assert {row["stock_quantity"] for row in response.json()} == {0, 99}

    detail = (await client.get("/api/v1/admin/products/" + product["id"],
                               headers=auth(admin_token))).json()
    assert [v["stock_quantity"] for v in detail["variants"]] == [0, 99, 10, 10]


async def test_bulk_stock_rejects_an_unknown_variant(client, admin_token):
    response = await client.patch(
        "/api/v1/admin/stock",
        json={"lines": [{"variant_id": "00000000-0000-0000-0000-000000000000",
                         "stock_quantity": 3}]},
        headers=auth(admin_token),
    )
    assert response.status_code == 404


async def test_bulk_stock_rejects_the_same_variant_twice(client, admin_token):
    product = await _product(client, admin_token)
    variant_id = product["variants"][0]["id"]
    response = await client.patch(
        "/api/v1/admin/stock",
        json={"lines": [{"variant_id": variant_id, "stock_quantity": 1},
                        {"variant_id": variant_id, "stock_quantity": 2}]},
        headers=auth(admin_token),
    )
    assert response.status_code == 422


# --- customers -------------------------------------------------------------

async def test_customer_detail_carries_orders_and_lifetime_value(
    client, admin_token, customer_token
):
    order = await _place_order(client, admin_token, customer_token)
    customer_id = (await client.get("/api/v1/auth/me", headers=auth(customer_token))).json()["id"]

    await client.patch(
        f"/api/v1/admin/orders/{order['id']}",
        json={"status": "confirmed"},
        headers=auth(admin_token),
    )
    body = (
        await client.get(f"/api/v1/admin/users/{customer_id}", headers=auth(admin_token))
    ).json()

    assert body["user"]["email"] == "customer@test.dev"
    assert body["order_count"] == 1
    assert body["lifetime_value"] == order["total"]
    assert body["orders"][0]["order_number"] == order["order_number"]
    assert body["last_order_at"] is not None


async def test_user_search_and_role_filter(client, admin_token, customer_token):
    admins = (
        await client.get("/api/v1/admin/users?role=admin", headers=auth(admin_token))
    ).json()
    assert [u["email"] for u in admins["items"]] == ["admin@test.dev"]

    found = (
        await client.get("/api/v1/admin/users?search=customer@", headers=auth(admin_token))
    ).json()
    assert [u["email"] for u in found["items"]] == ["customer@test.dev"]


async def test_admin_can_deactivate_a_customer(client, admin_token, customer_token):
    customer_id = (await client.get("/api/v1/auth/me", headers=auth(customer_token))).json()["id"]
    response = await client.patch(
        f"/api/v1/admin/users/{customer_id}",
        json={"is_active": False},
        headers=auth(admin_token),
    )
    assert response.status_code == 200
    assert response.json()["is_active"] is False
    # The token stops working the moment the account is disabled.
    assert (await client.get("/api/v1/auth/me", headers=auth(customer_token))).status_code == 401


async def test_admin_cannot_lock_themselves_out(client, admin_token, session_factory):
    admin_id = (await client.get("/api/v1/auth/me", headers=auth(admin_token))).json()["id"]

    deactivate = await client.patch(
        f"/api/v1/admin/users/{admin_id}",
        json={"is_active": False},
        headers=auth(admin_token),
    )
    assert deactivate.status_code == 422
    assert "your own access" in deactivate.text

    demote = await client.patch(
        f"/api/v1/admin/users/{admin_id}",
        json={"role_id": await role_id(session_factory, "customer")},
        headers=auth(admin_token),
    )
    assert demote.status_code == 422


async def test_promoting_a_customer_to_admin(
    client, admin_token, customer_token, session_factory
):
    customer_id = (await client.get("/api/v1/auth/me", headers=auth(customer_token))).json()["id"]
    response = await client.patch(
        f"/api/v1/admin/users/{customer_id}",
        json={"role_id": await role_id(session_factory, "admin")},
        headers=auth(admin_token),
    )
    assert response.status_code == 200
    assert response.json()["role"]["slug"] == "admin"
    # The promoted account can now reach the panel.
    assert (
        await client.get("/api/v1/admin/dashboard", headers=auth(customer_token))
    ).status_code == 200


# --- categories ------------------------------------------------------------

async def test_category_reorder(client, admin_token):
    made = []
    for name in ["Attar", "Oud", "Mist"]:
        response = await client.post(
            "/api/v1/categories", json={"name": name}, headers=auth(admin_token)
        )
        made.append(response.json())

    reordered = await client.patch(
        "/api/v1/admin/categories/reorder",
        json={"items": [
            {"id": made[2]["id"], "position": 0},
            {"id": made[1]["id"], "position": 1},
            {"id": made[0]["id"], "position": 2},
        ]},
        headers=auth(admin_token),
    )
    assert reordered.status_code == 200
    assert [c["name"] for c in reordered.json()] == ["Mist", "Oud", "Attar"]


async def test_admin_category_listing_includes_inactive(client, admin_token):
    await client.post(
        "/api/v1/categories",
        json={"name": "Retired", "is_active": False},
        headers=auth(admin_token),
    )
    public = (await client.get("/api/v1/categories")).json()
    panel = (await client.get("/api/v1/admin/categories", headers=auth(admin_token))).json()

    assert [c["name"] for c in public] == []
    assert [c["name"] for c in panel] == ["Retired"]
