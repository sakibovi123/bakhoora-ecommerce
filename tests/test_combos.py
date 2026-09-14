"""Combos: building them, and what happens when one is sold.

The thing worth testing hardest is that a combo carries no stock of its own.
Everything else follows from it — availability, the cap on a basket, and what a
cancellation puts back.
"""

from tests.conftest import auth, standard_variants

ADDRESS = {
    "recipient_name": "Rahim Uddin",
    "phone": "01712345678",
    "line1": "House 12, Road 5",
    "city": "Dhaka",
    "district": "Dhaka",
    "postal_code": "1205",
}


async def _product(client, admin_token, name: str, *, stock: int = 5) -> dict:
    response = await client.post(
        "/api/v1/products",
        headers=auth(admin_token),
        json={"name": name, "variants": standard_variants(stock=stock)},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _combo(client, admin_token, products: list[dict], **overrides) -> dict:
    payload = {
        "name": "Everyday Fresh",
        "use_case": "Everyday / Fresh",
        "tagline": "Everyday rotation",
        "products": [product["id"] for product in products],
        # The 6ml bottles are 1000.00 each, so two of them are worth 2000.
        "sizes": [{"size_ml": 6, "price": "1500.00", "is_active": True}],
    }
    payload.update(overrides)
    response = await client.post("/api/v1/combos", headers=auth(admin_token), json=payload)
    assert response.status_code == 201, response.text
    return response.json()


async def test_combo_reports_what_can_be_made_from_stock(client, admin_token):
    first = await _product(client, admin_token, "Bleu Oil", stock=7)
    await _product(client, admin_token, "Ysl Oil", stock=3)
    products = [first, (await client.get("/api/v1/products/ysl-oil")).json()]

    combo = await _combo(client, admin_token, products)
    size = combo["sizes"][0]

    # The scarcer of the two bottles is the cap, not the sum and not the larger.
    assert size["max_sets"] == 3
    assert size["is_available"] is True
    assert size["label"] == "2 × 6ml"
    assert combo["is_available"] is True
    # Informational only — the price is flat and typed in by hand.
    assert size["components_total"] == "2000.00"
    assert size["savings"] == "500.00"


async def test_combo_is_unavailable_when_one_perfume_runs_out(client, admin_token):
    first = await _product(client, admin_token, "Bleu Oil", stock=7)
    second = await _product(client, admin_token, "Ysl Oil", stock=0)
    combo = await _combo(client, admin_token, [first, second])

    size = combo["sizes"][0]
    assert size["max_sets"] == 0
    assert size["is_available"] is False
    assert combo["is_available"] is False
    blocked = next(c for c in size["components"] if c["product_name"] == "Ysl Oil")
    assert blocked["is_available"] is False
    assert blocked["reason"] == "out of stock"


async def test_size_the_perfumes_are_not_sold_in_cannot_be_made_up(client, admin_token):
    first = await _product(client, admin_token, "Bleu Oil")
    second = await _product(client, admin_token, "Ysl Oil")
    combo = await _combo(
        client,
        admin_token,
        [first, second],
        # 7ml is not one of the standard bottle sizes, so neither perfume has one.
        sizes=[{"size_ml": 7, "price": "1500.00", "is_active": True}],
    )

    size = combo["sizes"][0]
    assert size["max_sets"] == 0
    assert all(component["reason"] == "not sold in this size" for component in size["components"])
    # No honest comparison to draw when a bottle does not exist.
    assert size["components_total"] is None


async def test_buying_a_combo_takes_stock_off_every_perfume(
    client, admin_token, customer_token
):
    first = await _product(client, admin_token, "Bleu Oil", stock=5)
    second = await _product(client, admin_token, "Ysl Oil", stock=5)
    combo = await _combo(client, admin_token, [first, second])
    size_id = combo["sizes"][0]["id"]
    headers = auth(customer_token)

    cart = await client.post(
        "/api/v1/cart/items", json={"combo_size_id": size_id, "quantity": 2}, headers=headers
    )
    assert cart.status_code == 200, cart.text
    line = cart.json()["items"][0]
    assert line["kind"] == "combo"
    assert line["variant_id"] is None
    assert line["unit_price"] == "1500.00"
    assert line["line_total"] == "3000.00"
    assert line["components"] == ["Bleu Oil", "Ysl Oil"]

    checkout = await client.post(
        "/api/v1/orders/checkout",
        json={"payment_method": "cod", "shipping_address": ADDRESS},
        headers=headers,
    )
    assert checkout.status_code == 201, checkout.text
    order = checkout.json()["order"]

    # One priced line, and the bottles it reserved hanging off it.
    item = order["items"][0]
    assert item["product_name"] == "Everyday Fresh"
    assert item["variant_name"] == "2 × 6ml"
    assert item["variant_id"] is None
    assert item["line_total"] == "3000.00"
    assert [c["product_name"] for c in item["components"]] == ["Bleu Oil", "Ysl Oil"]

    # Two combos took two bottles off each perfume, not off a stock figure the
    # combo kept for itself.
    for slug in ("bleu-oil", "ysl-oil"):
        product = (await client.get(f"/api/v1/products/{slug}")).json()
        assert product["variants"][0]["stock_quantity"] == 3


async def test_cancelling_a_combo_order_puts_every_bottle_back(
    client, admin_token, customer_token
):
    first = await _product(client, admin_token, "Bleu Oil", stock=5)
    second = await _product(client, admin_token, "Ysl Oil", stock=5)
    combo = await _combo(client, admin_token, [first, second])

    await client.post(
        "/api/v1/cart/items",
        json={"combo_size_id": combo["sizes"][0]["id"], "quantity": 2},
        headers=auth(customer_token),
    )
    checkout = await client.post(
        "/api/v1/orders/checkout",
        json={"payment_method": "cod", "shipping_address": ADDRESS},
        headers=auth(customer_token),
    )
    order_id = checkout.json()["order"]["id"]

    cancelled = await client.post(
        f"/api/v1/orders/{order_id}/cancel", headers=auth(customer_token)
    )
    assert cancelled.status_code == 200, cancelled.text

    for slug in ("bleu-oil", "ysl-oil"):
        product = (await client.get(f"/api/v1/products/{slug}")).json()
        assert product["variants"][0]["stock_quantity"] == 5


async def test_cannot_basket_more_combos_than_the_shelf_can_make(
    client, admin_token, customer_token
):
    first = await _product(client, admin_token, "Bleu Oil", stock=9)
    second = await _product(client, admin_token, "Ysl Oil", stock=2)
    combo = await _combo(client, admin_token, [first, second])

    response = await client.post(
        "/api/v1/cart/items",
        json={"combo_size_id": combo["sizes"][0]["id"], "quantity": 3},
        headers=auth(customer_token),
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "out_of_stock"


async def test_a_perfume_inside_a_combo_cannot_be_deleted(client, admin_token):
    first = await _product(client, admin_token, "Bleu Oil")
    second = await _product(client, admin_token, "Ysl Oil")
    await _combo(client, admin_token, [first, second])

    response = await client.delete(
        f"/api/v1/products/{first['id']}", headers=auth(admin_token)
    )
    assert response.status_code == 409
    assert "Everyday Fresh" in response.json()["error"]["message"]


async def test_editing_a_combo_keeps_the_size_rows_a_basket_points_at(
    client, admin_token, customer_token
):
    first = await _product(client, admin_token, "Bleu Oil")
    second = await _product(client, admin_token, "Ysl Oil")
    combo = await _combo(client, admin_token, [first, second])
    size_id = combo["sizes"][0]["id"]

    await client.post(
        "/api/v1/cart/items",
        json={"combo_size_id": size_id, "quantity": 1},
        headers=auth(customer_token),
    )

    # Correcting the price must not empty the baskets holding this combo, so the
    # row is reconciled by size rather than deleted and re-added.
    edited = await client.patch(
        f"/api/v1/combos/{combo['id']}",
        headers=auth(admin_token),
        json={"sizes": [{"size_ml": 6, "price": "1400.00", "is_active": True}]},
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["sizes"][0]["id"] == size_id

    cart = await client.get("/api/v1/cart", headers=auth(customer_token))
    assert cart.json()["items"][0]["unit_price"] == "1400.00"


async def test_stock_coverage_counts_how_often_each_perfume_is_carried(
    client, admin_token
):
    first = await _product(client, admin_token, "Bleu Oil")
    second = await _product(client, admin_token, "Ysl Oil")
    await _product(client, admin_token, "Lonely Oil")

    await _combo(client, admin_token, [first, second])
    await _combo(client, admin_token, [first, second], name="Office Ready")

    coverage = await client.get(
        "/api/v1/admin/combos/stock-coverage", headers=auth(admin_token)
    )
    assert coverage.status_code == 200, coverage.text
    body = coverage.json()

    assert body["total_combos"] == 2
    bleu = next(row for row in body["rows"] if row["product_name"] == "Bleu Oil")
    assert bleu["times_included"] == 2
    assert bleu["coverage_pct"] == 100.0
    assert sorted(bleu["combo_names"]) == ["Everyday Fresh", "Office Ready"]

    # The gap the campaign has not covered.
    assert [row["product_name"] for row in body["uncovered"]] == ["Lonely Oil"]


async def test_a_parked_combo_is_off_the_storefront_but_still_in_the_panel(
    client, admin_token
):
    first = await _product(client, admin_token, "Bleu Oil")
    second = await _product(client, admin_token, "Ysl Oil")
    combo = await _combo(client, admin_token, [first, second], is_active=False)

    assert (await client.get("/api/v1/combos")).json() == []

    panel = await client.get("/api/v1/admin/combos", headers=auth(admin_token))
    assert [row["id"] for row in panel.json()] == [combo["id"]]


async def test_a_combo_needs_two_perfumes_and_a_size(client, admin_token):
    first = await _product(client, admin_token, "Bleu Oil")

    too_few = await client.post(
        "/api/v1/combos",
        headers=auth(admin_token),
        json={
            "name": "Lonely",
            "products": [first["id"]],
            "sizes": [{"size_ml": 6, "price": "500.00", "is_active": True}],
        },
    )
    assert too_few.status_code == 422

    second = await _product(client, admin_token, "Ysl Oil")
    no_sizes = await client.post(
        "/api/v1/combos",
        headers=auth(admin_token),
        json={
            "name": "Priceless",
            "products": [first["id"], second["id"]],
            "sizes": [],
        },
    )
    assert no_sizes.status_code == 422

    repeated = await client.post(
        "/api/v1/combos",
        headers=auth(admin_token),
        json={
            "name": "Doubled",
            "products": [first["id"], first["id"]],
            "sizes": [{"size_ml": 6, "price": "500.00", "is_active": True}],
        },
    )
    assert repeated.status_code == 422
