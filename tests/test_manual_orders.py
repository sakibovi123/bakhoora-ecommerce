"""Orders the shop takes by phone or at the counter.

The point of these is that a manual order is indistinguishable downstream: the
dashboard, best sellers, stock and the customer's history must all count it.
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


async def _product(client, admin_token, *, name="Counter Oud", stock=10):
    response = await client.post(
        "/api/v1/products",
        headers=auth(admin_token),
        json={"name": name, "variants": standard_variants(stock=stock)},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _create(client, token, **overrides):
    product = overrides.pop("product", None)
    body = {
        "items": overrides.pop("items", None)
        or [{"variant_id": product["variants"][0]["id"], "quantity": 2}],
        "shipping_address": ADDRESS,
        "payment_method": "cod",
        **overrides,
    }
    return await client.post("/api/v1/admin/orders", json=body, headers=auth(token))


# --- creating --------------------------------------------------------------

async def test_a_counter_order_looks_like_any_other(client, admin_token):
    product = await _product(client, admin_token)
    response = await _create(client, admin_token, product=product)
    assert response.status_code == 201, response.text

    order = response.json()
    assert order["order_number"].startswith("BKH-")
    assert order["status"] == "pending"
    assert order["payment_method"] == "cod"
    assert order["recipient_name"] == "Rahim Uddin"
    # 2 x 1000.00 + 70 shipping
    assert order["subtotal"] == "2000.00"
    assert order["shipping_fee"] == "70.00"
    assert order["total"] == "2070.00"

    item = order["items"][0]
    assert item["product_name"] == "Counter Oud"
    assert item["variant_name"] == "6ml"
    assert item["quantity"] == 2
    assert item["line_total"] == "2000.00"
    # A payment row is written, as checkout does.
    assert order["payments"][0]["provider"] == "cod"


async def test_stock_is_reserved(client, admin_token):
    product = await _product(client, admin_token, stock=10)
    await _create(client, admin_token, product=product)

    detail = await client.get(
        f"/api/v1/admin/products/{product['id']}", headers=auth(admin_token)
    )
    assert [v["stock_quantity"] for v in detail.json()["variants"]] == [8, 10, 10, 10]


async def test_more_than_the_shelf_holds_is_refused(client, admin_token):
    product = await _product(client, admin_token, stock=1)
    response = await _create(
        client,
        admin_token,
        items=[{"variant_id": product["variants"][0]["id"], "quantity": 5}],
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "out_of_stock"

    # Nothing was taken from the shelf.
    detail = await client.get(
        f"/api/v1/admin/products/{product['id']}", headers=auth(admin_token)
    )
    assert detail.json()["variants"][0]["stock_quantity"] == 1


async def test_several_sizes_on_one_order(client, admin_token):
    product = await _product(client, admin_token)
    response = await _create(
        client,
        admin_token,
        items=[
            {"variant_id": product["variants"][0]["id"], "quantity": 1},
            {"variant_id": product["variants"][2]["id"], "quantity": 3},
        ],
    )
    assert response.status_code == 201
    order = response.json()
    assert [i["variant_name"] for i in order["items"]] == ["6ml", "15ml"]
    # 1000 + 3 x 2000 = 7000, over the free-shipping threshold
    assert order["subtotal"] == "7000.00"
    assert order["shipping_fee"] == "0.00"


async def test_the_same_size_twice_is_refused(client, admin_token):
    product = await _product(client, admin_token)
    variant = product["variants"][0]["id"]
    response = await _create(
        client,
        admin_token,
        items=[{"variant_id": variant, "quantity": 1}, {"variant_id": variant, "quantity": 2}],
    )
    assert response.status_code == 422
    assert "more than one line" in response.text


async def test_an_inactive_size_cannot_be_sold(client, admin_token):
    product = await _product(client, admin_token)
    variant = product["variants"][0]
    await client.patch(
        f"/api/v1/products/variants/{variant['id']}",
        json={"is_active": False},
        headers=auth(admin_token),
    )
    response = await _create(client, admin_token, product=product)
    assert response.status_code == 422
    assert "is not on sale" in response.text


# --- the desk's overrides --------------------------------------------------

async def test_the_desk_can_agree_a_price(client, admin_token):
    product = await _product(client, admin_token)
    response = await _create(
        client,
        admin_token,
        product=product,
        shipping_fee="0.00",
        discount_total="200.00",
        status="confirmed",
        payment_status="paid",
        admin_note="Regular, collected in person",
    )
    assert response.status_code == 201
    order = response.json()
    assert order["shipping_fee"] == "0.00"
    assert order["discount_total"] == "200.00"
    assert order["total"] == "1800.00"
    assert order["status"] == "confirmed"
    assert order["payment_status"] == "paid"


async def test_a_discount_cannot_exceed_the_order(client, admin_token):
    product = await _product(client, admin_token)
    response = await _create(
        client, admin_token, product=product, discount_total="99999.00"
    )
    assert response.status_code == 422
    assert "larger than the order" in response.text


async def test_an_order_cannot_open_in_a_terminal_state(client, admin_token):
    product = await _product(client, admin_token)
    for bad in ("shipped", "delivered", "cancelled", "refunded"):
        response = await _create(client, admin_token, product=product, status=bad)
        assert response.status_code == 422, bad
        assert "can only start as" in response.text


# --- where it shows up -----------------------------------------------------

async def test_it_reaches_the_orders_list(client, admin_token):
    product = await _product(client, admin_token)
    created = (await _create(client, admin_token, product=product)).json()

    listing = await client.get("/api/v1/admin/orders", headers=auth(admin_token))
    assert [o["order_number"] for o in listing.json()["items"]] == [created["order_number"]]


async def test_it_counts_on_the_dashboard(client, admin_token):
    product = await _product(client, admin_token)
    order = (
        await _create(client, admin_token, product=product, status="confirmed")
    ).json()

    body = (await client.get("/api/v1/admin/dashboard", headers=auth(admin_token))).json()
    assert body["counters"]["total_orders"] == 1
    assert body["counters"]["revenue"] == order["total"]
    assert body["top_products"][0]["product_name"] == "Counter Oud"
    assert body["top_products"][0]["units"] == 2
    assert [o["order_number"] for o in body["recent_orders"]] == [order["order_number"]]
    assert sum(p["orders"] for p in body["revenue_series"]) == 1


async def test_linking_it_to_an_account_puts_it_in_their_history(
    client, admin_token, customer_token
):
    product = await _product(client, admin_token)
    customer_id = (await client.get("/api/v1/auth/me", headers=auth(customer_token))).json()["id"]

    order = (
        await _create(
            client, admin_token, product=product, user_id=customer_id, status="confirmed"
        )
    ).json()

    detail = (
        await client.get(f"/api/v1/admin/users/{customer_id}", headers=auth(admin_token))
    ).json()
    assert detail["order_count"] == 1
    assert detail["lifetime_value"] == order["total"]
    assert detail["orders"][0]["order_number"] == order["order_number"]

    # And the customer sees it on their own account.
    mine = await client.get("/api/v1/orders", headers=auth(customer_token))
    assert [o["order_number"] for o in mine.json()["items"]] == [order["order_number"]]


async def test_a_walk_in_belongs_to_nobody(client, admin_token, customer_token):
    product = await _product(client, admin_token)
    await _create(client, admin_token, product=product)
    customer_id = (await client.get("/api/v1/auth/me", headers=auth(customer_token))).json()["id"]

    detail = (
        await client.get(f"/api/v1/admin/users/{customer_id}", headers=auth(admin_token))
    ).json()
    assert detail["order_count"] == 0
    # It is still a real order in the shop's books.
    listing = await client.get("/api/v1/admin/orders", headers=auth(admin_token))
    assert listing.json()["total"] == 1


async def test_an_unknown_customer_is_refused(client, admin_token):
    product = await _product(client, admin_token)
    response = await _create(
        client,
        admin_token,
        product=product,
        user_id="00000000-0000-0000-0000-000000000000",
    )
    assert response.status_code == 404


async def test_it_drives_the_low_stock_warning(client, admin_token):
    product = await _product(client, admin_token, stock=6)
    await _create(
        client,
        admin_token,
        items=[{"variant_id": product["variants"][0]["id"], "quantity": 3}],
    )
    body = (await client.get("/api/v1/admin/dashboard", headers=auth(admin_token))).json()
    assert body["counters"]["low_stock_variants"] == 1
    assert body["low_stock"][0]["stock_quantity"] == 3


async def test_it_can_then_be_moved_through_the_usual_statuses(client, admin_token):
    product = await _product(client, admin_token)
    order = (await _create(client, admin_token, product=product)).json()
    for move in ("confirmed", "processing", "shipped", "delivered"):
        response = await client.patch(
            f"/api/v1/admin/orders/{order['id']}",
            json={"status": move},
            headers=auth(admin_token),
        )
        assert response.status_code == 200, move


# --- access ----------------------------------------------------------------

async def test_taking_an_order_needs_orders_manage(client, admin_token, customer_token):
    product = await _product(client, admin_token)
    response = await _create(client, customer_token, product=product)
    assert response.status_code == 403


# --- part payments and dues ------------------------------------------------
#
# The counter case: a customer takes a 1,000tk bottle, hands over the 100tk
# delivery charge now and owes 900 on delivery. The shop needs that 900 to be a
# number the system holds, not something a staff member remembers.

async def _one_thousand_taka_order(client, admin_token, **overrides):
    """One 6ml bottle at 1,000, shipping forced to 100 — total 1,100."""
    product = await _product(client, admin_token)
    return await _create(
        client,
        admin_token,
        items=[{"variant_id": product["variants"][0]["id"], "quantity": 1}],
        shipping_fee="100.00",
        **overrides,
    )


async def test_an_advance_leaves_the_rest_as_due(client, admin_token):
    response = await _one_thousand_taka_order(client, admin_token, amount_paid="100.00")
    assert response.status_code == 201, response.text

    order = response.json()
    assert order["total"] == "1100.00"
    assert order["amount_paid"] == "100.00"
    assert order["amount_due"] == "1000.00"
    # The badge is read off the money rather than set by hand.
    assert order["payment_status"] == "partial"


async def test_no_advance_leaves_the_whole_total_owed(client, admin_token):
    order = (await _one_thousand_taka_order(client, admin_token)).json()
    assert order["amount_paid"] == "0.00"
    assert order["amount_due"] == "1100.00"
    assert order["payment_status"] == "unpaid"


async def test_an_advance_is_written_into_the_ledger(client, admin_token):
    order = (
        await _one_thousand_taka_order(client, admin_token, amount_paid="100.00")
    ).json()
    receipts = [p for p in order["payments"] if p["status"] == "paid"]
    assert [p["amount"] for p in receipts] == ["100.00"]


async def test_paying_more_than_the_order_is_refused(client, admin_token):
    response = await _one_thousand_taka_order(client, admin_token, amount_paid="2000.00")
    assert response.status_code == 422, response.text
    assert "more than the order total" in response.json()["detail"]


async def test_settling_the_due_closes_the_order_out(client, admin_token):
    order = (
        await _one_thousand_taka_order(client, admin_token, amount_paid="100.00")
    ).json()

    response = await client.post(
        f"/api/v1/admin/orders/{order['id']}/payments",
        json={"amount": "1000.00", "reference": "collected by courier"},
        headers=auth(admin_token),
    )
    assert response.status_code == 201, response.text

    settled = response.json()
    assert settled["amount_paid"] == "1100.00"
    assert settled["amount_due"] == "0.00"
    assert settled["payment_status"] == "paid"
    assert "collected by courier" in [p["reference"] for p in settled["payments"]]


async def test_payments_accumulate_across_collections(client, admin_token):
    order = (await _one_thousand_taka_order(client, admin_token)).json()
    for amount in ("400.00", "400.00"):
        response = await client.post(
            f"/api/v1/admin/orders/{order['id']}/payments",
            json={"amount": amount},
            headers=auth(admin_token),
        )
        assert response.status_code == 201, response.text

    assert response.json()["amount_paid"] == "800.00"
    assert response.json()["amount_due"] == "300.00"
    assert response.json()["payment_status"] == "partial"


async def test_collecting_more_than_is_owed_is_refused(client, admin_token):
    order = (
        await _one_thousand_taka_order(client, admin_token, amount_paid="100.00")
    ).json()
    response = await client.post(
        f"/api/v1/admin/orders/{order['id']}/payments",
        json={"amount": "5000.00"},
        headers=auth(admin_token),
    )
    assert response.status_code == 422, response.text
    assert "still owed" in response.json()["detail"]


async def test_marking_an_order_paid_by_hand_clears_the_due(client, admin_token):
    """The dropdown and the arithmetic must not tell different stories."""
    order = (
        await _one_thousand_taka_order(client, admin_token, amount_paid="100.00")
    ).json()
    response = await client.patch(
        f"/api/v1/admin/orders/{order['id']}",
        json={"payment_status": "paid"},
        headers=auth(admin_token),
    )
    assert response.status_code == 200, response.text
    assert response.json()["amount_due"] == "0.00"
    assert response.json()["amount_paid"] == "1100.00"


async def test_partial_cannot_be_asserted_by_hand(client, admin_token):
    order = (await _one_thousand_taka_order(client, admin_token)).json()
    response = await client.patch(
        f"/api/v1/admin/orders/{order['id']}",
        json={"payment_status": "partial"},
        headers=auth(admin_token),
    )
    assert response.status_code == 422, response.text
    assert "Record a payment" in response.json()["detail"]


async def test_the_due_rides_along_on_the_orders_list(client, admin_token):
    await _one_thousand_taka_order(client, admin_token, amount_paid="100.00")
    response = await client.get("/api/v1/admin/orders", headers=auth(admin_token))
    assert response.status_code == 200, response.text
    assert response.json()["items"][0]["amount_due"] == "1000.00"


async def test_a_cancelled_order_takes_no_more_money(client, admin_token):
    order = (await _one_thousand_taka_order(client, admin_token)).json()
    cancelled = await client.patch(
        f"/api/v1/admin/orders/{order['id']}",
        json={"status": "cancelled"},
        headers=auth(admin_token),
    )
    assert cancelled.status_code == 200, cancelled.text

    response = await client.post(
        f"/api/v1/admin/orders/{order['id']}/payments",
        json={"amount": "100.00"},
        headers=auth(admin_token),
    )
    assert response.status_code == 422, response.text


# --- deleting --------------------------------------------------------------
#
# Deleting is for the row that should never have existed — the counter order
# typed in twice. Cancelling is what a real order that fell through wants, so
# the two have to differ in what they do to the shelf.

async def test_deleting_an_order_puts_its_stock_back(client, admin_token):
    product = await _product(client, admin_token, stock=10)
    order = (await _create(client, admin_token, product=product)).json()

    response = await client.delete(
        f"/api/v1/admin/orders/{order['id']}", headers=auth(admin_token)
    )
    assert response.status_code == 204, response.text

    gone = await client.get(
        f"/api/v1/admin/orders/{order['id']}", headers=auth(admin_token)
    )
    assert gone.status_code == 404

    listed = await client.get("/api/v1/admin/orders", headers=auth(admin_token))
    assert listed.json()["total"] == 0

    detail = await client.get(
        f"/api/v1/admin/products/{product['id']}", headers=auth(admin_token)
    )
    assert detail.json()["variants"][0]["stock_quantity"] == 10


async def test_deleting_a_delivered_order_leaves_the_shelf_alone(client, admin_token):
    """The goods physically left the shop. Erasing the paperwork cannot bring
    them back, so the stock stays where the delivery left it."""
    product = await _product(client, admin_token, stock=10)
    order = (await _create(client, admin_token, product=product)).json()
    for status in ("confirmed", "processing", "shipped", "delivered"):
        moved = await client.patch(
            f"/api/v1/admin/orders/{order['id']}",
            json={"status": status},
            headers=auth(admin_token),
        )
        assert moved.status_code == 200, moved.text

    response = await client.delete(
        f"/api/v1/admin/orders/{order['id']}", headers=auth(admin_token)
    )
    assert response.status_code == 204, response.text

    detail = await client.get(
        f"/api/v1/admin/products/{product['id']}", headers=auth(admin_token)
    )
    assert detail.json()["variants"][0]["stock_quantity"] == 8


async def test_deleting_a_cancelled_order_does_not_restock_twice(client, admin_token):
    product = await _product(client, admin_token, stock=10)
    order = (await _create(client, admin_token, product=product)).json()
    cancelled = await client.patch(
        f"/api/v1/admin/orders/{order['id']}",
        json={"status": "cancelled"},
        headers=auth(admin_token),
    )
    assert cancelled.status_code == 200, cancelled.text

    response = await client.delete(
        f"/api/v1/admin/orders/{order['id']}", headers=auth(admin_token)
    )
    assert response.status_code == 204, response.text

    detail = await client.get(
        f"/api/v1/admin/products/{product['id']}", headers=auth(admin_token)
    )
    assert detail.json()["variants"][0]["stock_quantity"] == 10


async def test_several_ticked_rows_go_in_one_request(client, admin_token):
    product = await _product(client, admin_token, stock=10)
    first = (await _create(client, admin_token, product=product)).json()
    second = (await _create(client, admin_token, product=product)).json()

    response = await client.post(
        "/api/v1/admin/orders/delete",
        json={"ids": [first["id"], second["id"]]},
        headers=auth(admin_token),
    )
    assert response.status_code == 200, response.text
    assert response.json()["deleted"] == 2

    listed = await client.get("/api/v1/admin/orders", headers=auth(admin_token))
    assert listed.json()["total"] == 0

    detail = await client.get(
        f"/api/v1/admin/products/{product['id']}", headers=auth(admin_token)
    )
    assert detail.json()["variants"][0]["stock_quantity"] == 10


async def test_an_id_that_is_already_gone_does_not_fail_the_batch(client, admin_token):
    """Two people tidying up the same duplicates. The second one's request must
    still delete what is left rather than erroring with nothing done."""
    product = await _product(client, admin_token, stock=10)
    order = (await _create(client, admin_token, product=product)).json()

    response = await client.post(
        "/api/v1/admin/orders/delete",
        json={"ids": [order["id"], "11111111-1111-4111-8111-111111111111"]},
        headers=auth(admin_token),
    )
    assert response.status_code == 200, response.text
    assert response.json()["deleted"] == 1


async def test_an_empty_selection_is_refused(client, admin_token):
    response = await client.post(
        "/api/v1/admin/orders/delete", json={"ids": []}, headers=auth(admin_token)
    )
    assert response.status_code == 422, response.text
