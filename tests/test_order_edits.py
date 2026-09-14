"""Editing a placed order.

Two things make this worth its own suite. The first is stock: an edit puts back
everything the order was holding and then takes what the new lines need, so the
cases that matter are the ones where those two halves have to cancel out
exactly — editing an order that is holding the last bottles on the shelf, and
editing one in a way the shelf cannot satisfy, which must leave the order
untouched rather than half-rewritten.

The second is who may do it. The panel already has a "manage orders" permission
and a counter assistant can hold it; rewriting what was bought is deliberately
narrower than that, so the interesting test is not that an admin can, but that
somebody with orders/manage cannot.
"""

from tests.conftest import auth, staff_account, standard_variants

ADDRESS = {
    "recipient_name": "Rahim Uddin",
    "phone": "01712345678",
    "line1": "House 12, Road 5",
    "city": "Dhaka",
    "district": "Dhaka",
    "postal_code": "1205",
}

ELSEWHERE = {
    "recipient_name": "Karim Mia",
    "phone": "01898765432",
    "line1": "Flat 3B, Road 11",
    "city": "Chattogram",
    "district": "Chattogram",
    "postal_code": "4000",
}


async def _product(client, admin_token, *, name="Counter Oud", stock=10):
    response = await client.post(
        "/api/v1/products",
        headers=auth(admin_token),
        json={"name": name, "variants": standard_variants(stock=stock)},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _order(client, admin_token, product, *, quantity=2, **overrides):
    response = await client.post(
        "/api/v1/admin/orders",
        headers=auth(admin_token),
        json={
            "items": [{"variant_id": product["variants"][0]["id"], "quantity": quantity}],
            "shipping_address": ADDRESS,
            "payment_method": "cod",
            **overrides,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _edit(client, token, order_id, **body):
    return await client.put(
        f"/api/v1/admin/orders/{order_id}",
        headers=auth(token),
        json={"shipping_address": ADDRESS, **body},
    )


async def _stock(client, admin_token, product, index=0):
    fresh = await client.get(
        f"/api/v1/admin/products/{product['id']}", headers=auth(admin_token)
    )
    return fresh.json()["variants"][index]["stock_quantity"]


# --- what an edit changes ---------------------------------------------------


async def test_changing_a_quantity_restates_the_totals(client, admin_token):
    product = await _product(client, admin_token)
    order = await _order(client, admin_token, product, quantity=2)
    assert order["subtotal"] == "2000.00"

    response = await _edit(
        client,
        admin_token,
        order["id"],
        items=[{"variant_id": product["variants"][0]["id"], "quantity": 1}],
    )
    assert response.status_code == 200, response.text
    edited = response.json()
    assert edited["subtotal"] == "1000.00"
    assert edited["shipping_fee"] == "70.00"
    assert edited["total"] == "1070.00"
    # Same order, not a new one — the number on the customer's invoice stands.
    assert edited["order_number"] == order["order_number"]
    assert edited["id"] == order["id"]


async def test_an_edit_re_applies_the_free_delivery_rule(client, admin_token):
    """Shipping is recalculated, not carried over.

    An order edited up past the shop's free-delivery threshold has to lose its
    delivery charge, exactly as it would have done had it been placed at the
    new size. Keeping the original 70 would quietly overcharge a customer whose
    order the shop itself grew.
    """
    product = await _product(client, admin_token)
    order = await _order(client, admin_token, product, quantity=2)
    assert order["shipping_fee"] == "70.00"

    response = await _edit(
        client,
        admin_token,
        order["id"],
        items=[{"variant_id": product["variants"][0]["id"], "quantity": 3}],
    )
    assert response.status_code == 200, response.text
    edited = response.json()
    assert edited["subtotal"] == "3000.00"
    assert edited["shipping_fee"] == "0.00"
    assert edited["total"] == "3000.00"


async def test_an_explicit_delivery_charge_survives_an_edit(client, admin_token):
    """The override still wins — a negotiated charge is not recalculated away."""
    product = await _product(client, admin_token)
    order = await _order(client, admin_token, product, quantity=2)

    response = await _edit(
        client,
        admin_token,
        order["id"],
        items=[{"variant_id": product["variants"][0]["id"], "quantity": 3}],
        shipping_fee="120.00",
    )
    assert response.status_code == 200, response.text
    assert response.json()["shipping_fee"] == "120.00"
    assert response.json()["total"] == "3120.00"


async def test_the_shelf_is_corrected_by_the_difference(client, admin_token):
    product = await _product(client, admin_token, stock=10)
    order = await _order(client, admin_token, product, quantity=2)
    assert await _stock(client, admin_token, product) == 8

    await _edit(
        client,
        admin_token,
        order["id"],
        items=[{"variant_id": product["variants"][0]["id"], "quantity": 5}],
    )
    assert await _stock(client, admin_token, product) == 5

    # And back down again.
    await _edit(
        client,
        admin_token,
        order["id"],
        items=[{"variant_id": product["variants"][0]["id"], "quantity": 1}],
    )
    assert await _stock(client, admin_token, product) == 9


async def test_an_order_holding_the_last_of_the_stock_can_still_be_edited(
    client, admin_token
):
    """The case a naive diff gets wrong.

    The order holds every bottle on the shelf. Editing it — even just to change
    the address — must not be refused for want of stock that the order itself is
    the one holding.
    """
    product = await _product(client, admin_token, stock=3)
    order = await _order(client, admin_token, product, quantity=3)
    assert await _stock(client, admin_token, product) == 0

    response = await _edit(
        client,
        admin_token,
        order["id"],
        items=[{"variant_id": product["variants"][0]["id"], "quantity": 3}],
        shipping_address=ELSEWHERE,
    )
    assert response.status_code == 200, response.text
    assert response.json()["city"] == "Chattogram"
    assert await _stock(client, admin_token, product) == 0


async def test_a_line_can_be_added_and_another_dropped(client, admin_token):
    product = await _product(client, admin_token, stock=10)
    order = await _order(client, admin_token, product, quantity=1)

    response = await _edit(
        client,
        admin_token,
        order["id"],
        items=[{"variant_id": product["variants"][1]["id"], "quantity": 2}],
    )
    assert response.status_code == 200, response.text
    items = response.json()["items"]
    assert len(items) == 1
    assert items[0]["variant_name"] == "10ml"
    # The 6ml it used to hold went back.
    assert await _stock(client, admin_token, product, 0) == 10
    assert await _stock(client, admin_token, product, 1) == 8


async def test_the_desk_can_restate_a_price(client, admin_token):
    product = await _product(client, admin_token)
    order = await _order(client, admin_token, product, quantity=1)

    response = await _edit(
        client,
        admin_token,
        order["id"],
        items=[
            {
                "variant_id": product["variants"][0]["id"],
                "quantity": 1,
                "unit_price": "850.00",
            }
        ],
    )
    assert response.status_code == 200, response.text
    assert response.json()["items"][0]["unit_price"] == "850.00"
    assert response.json()["subtotal"] == "850.00"


async def test_the_delivery_address_can_be_corrected(client, admin_token):
    product = await _product(client, admin_token)
    order = await _order(client, admin_token, product)

    response = await _edit(
        client,
        admin_token,
        order["id"],
        items=[{"variant_id": product["variants"][0]["id"], "quantity": 2}],
        shipping_address=ELSEWHERE,
    )
    assert response.status_code == 200, response.text
    edited = response.json()
    assert edited["recipient_name"] == "Karim Mia"
    assert edited["city"] == "Chattogram"


# --- what an edit refuses ---------------------------------------------------


async def test_an_edit_the_shelf_cannot_satisfy_leaves_the_order_alone(
    client, admin_token
):
    """The rollback case. The order is restocked before the new lines are taken,
    so a failure half way through must not leave it holding nothing."""
    product = await _product(client, admin_token, stock=5)
    order = await _order(client, admin_token, product, quantity=2)

    response = await _edit(
        client,
        admin_token,
        order["id"],
        items=[{"variant_id": product["variants"][0]["id"], "quantity": 99}],
    )
    assert response.status_code == 422, response.text

    # Both the order and the shelf are exactly as they were.
    assert await _stock(client, admin_token, product) == 3
    unchanged = (
        await client.get(f"/api/v1/admin/orders/{order['id']}", headers=auth(admin_token))
    ).json()
    assert unchanged["items"][0]["quantity"] == 2
    assert unchanged["subtotal"] == "2000.00"


async def test_a_shipped_order_can_no_longer_be_edited(client, admin_token):
    product = await _product(client, admin_token)
    order = await _order(client, admin_token, product)

    for status in ("confirmed", "processing", "shipped"):
        moved = await client.patch(
            f"/api/v1/admin/orders/{order['id']}",
            headers=auth(admin_token),
            json={"status": status},
        )
        assert moved.status_code == 200, moved.text

    response = await _edit(
        client,
        admin_token,
        order["id"],
        items=[{"variant_id": product["variants"][0]["id"], "quantity": 1}],
    )
    assert response.status_code == 422
    assert "no longer be edited" in response.json()["error"]["message"]


async def test_a_cancelled_order_cannot_be_edited(client, admin_token):
    """It has already handed its stock back; re-reserving would take it twice."""
    product = await _product(client, admin_token, stock=10)
    order = await _order(client, admin_token, product, quantity=2)
    await client.patch(
        f"/api/v1/admin/orders/{order['id']}",
        headers=auth(admin_token),
        json={"status": "cancelled"},
    )
    assert await _stock(client, admin_token, product) == 10

    response = await _edit(
        client,
        admin_token,
        order["id"],
        items=[{"variant_id": product["variants"][0]["id"], "quantity": 2}],
    )
    assert response.status_code == 422
    assert await _stock(client, admin_token, product) == 10


async def test_an_order_cannot_be_edited_below_what_was_collected(client, admin_token):
    product = await _product(client, admin_token)
    order = await _order(
        client, admin_token, product, quantity=2, amount_paid="1500.00"
    )

    response = await _edit(
        client,
        admin_token,
        order["id"],
        items=[{"variant_id": product["variants"][0]["id"], "quantity": 1}],
    )
    assert response.status_code == 422
    assert "already been collected" in response.json()["error"]["message"]


async def test_a_duplicate_line_is_refused(client, admin_token):
    product = await _product(client, admin_token)
    order = await _order(client, admin_token, product)
    variant = product["variants"][0]["id"]

    response = await _edit(
        client,
        admin_token,
        order["id"],
        items=[
            {"variant_id": variant, "quantity": 1},
            {"variant_id": variant, "quantity": 2},
        ],
    )
    assert response.status_code == 422


async def test_an_edit_cannot_empty_an_order(client, admin_token):
    """An order with no lines is a deletion, and deletion has its own endpoint
    that restocks and warns."""
    product = await _product(client, admin_token)
    order = await _order(client, admin_token, product)
    response = await _edit(client, admin_token, order["id"], items=[])
    assert response.status_code == 422


# --- who may do it ----------------------------------------------------------


async def test_managing_orders_is_not_enough_to_edit_one(client, admin_token):
    """The requirement. A counter assistant confirms orders and takes payments;
    rewriting what was bought is the owner's alone."""
    product = await _product(client, admin_token)
    order = await _order(client, admin_token, product)

    _, token = await staff_account(
        client,
        admin_token,
        name="Counter staff",
        permissions=[{"menu": "orders", "can_view": True, "can_manage": True}],
    )

    # The permission it does have still works, so this is a real staff account.
    moved = await client.patch(
        f"/api/v1/admin/orders/{order['id']}",
        headers=auth(token),
        json={"status": "confirmed"},
    )
    assert moved.status_code == 200, moved.text

    response = await _edit(
        client,
        token,
        order["id"],
        items=[{"variant_id": product["variants"][0]["id"], "quantity": 5}],
    )
    assert response.status_code == 403
    assert "administrator" in response.json()["error"]["message"].lower()


async def test_editing_an_order_needs_a_session_at_all(client, admin_token):
    product = await _product(client, admin_token)
    order = await _order(client, admin_token, product)
    response = await client.put(
        f"/api/v1/admin/orders/{order['id']}",
        json={
            "items": [{"variant_id": product["variants"][0]["id"], "quantity": 1}],
            "shipping_address": ADDRESS,
        },
    )
    assert response.status_code == 401


async def test_a_customer_cannot_edit_an_order(client, admin_token, customer_token):
    product = await _product(client, admin_token)
    order = await _order(client, admin_token, product)
    response = await _edit(
        client,
        customer_token,
        order["id"],
        items=[{"variant_id": product["variants"][0]["id"], "quantity": 1}],
    )
    assert response.status_code == 403


async def test_an_edit_leaves_the_notes_alone(client, admin_token):
    """`admin_note` is write-only, so a form cannot round-trip it.

    If an edit carried notes, an absent field would erase one nobody meant to
    touch — and the customer's own note from checkout is not the shop's to
    rewrite. Both are left to the PATCH endpoint that owns them.
    """
    product = await _product(client, admin_token)
    order = await _order(
        client,
        admin_token,
        product,
        customer_note="Leave with the guard",
        admin_note="Regular — call before delivery",
    )
    assert order["customer_note"] == "Leave with the guard"

    response = await _edit(
        client,
        admin_token,
        order["id"],
        items=[{"variant_id": product["variants"][0]["id"], "quantity": 1}],
    )
    assert response.status_code == 200, response.text
    assert response.json()["customer_note"] == "Leave with the guard"

    # The admin note is not on OrderOut, so it is checked the only way a client
    # can see it: the endpoint that owns it still reports it unchanged.
    patched = await client.patch(
        f"/api/v1/admin/orders/{order['id']}",
        headers=auth(admin_token),
        json={"status": "confirmed"},
    )
    assert patched.status_code == 200
