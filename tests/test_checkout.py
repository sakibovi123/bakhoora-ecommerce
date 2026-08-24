from tests.conftest import auth, standard_variants

ADDRESS = {
    "recipient_name": "Rahim Uddin",
    "phone": "01712345678",
    "line1": "House 12, Road 5",
    "city": "Dhaka",
    "district": "Dhaka",
    "postal_code": "1205",
}


async def _create_product(client, admin_token, *, stock: int = 5):
    response = await client.post(
        "/api/v1/products",
        headers=auth(admin_token),
        json={
            "name": "Checkout Oud",
            "variants": standard_variants(stock=stock),
        },
    )
    # The 6ml comes first and is priced at 1000.00.
    return response.json()["variants"][0]["id"]


async def test_cart_and_checkout_flow(client, admin_token, customer_token):
    variant_id = await _create_product(client, admin_token, stock=5)
    headers = auth(customer_token)

    cart = await client.post(
        "/api/v1/cart/items", json={"variant_id": variant_id, "quantity": 2}, headers=headers
    )
    assert cart.status_code == 200
    body = cart.json()
    assert body["item_count"] == 2
    assert body["subtotal"] == "2000.00"
    assert body["shipping_fee"] == "70.00"      # below the free shipping threshold
    assert body["total"] == "2070.00"

    checkout = await client.post(
        "/api/v1/orders/checkout",
        json={"payment_method": "cod", "shipping_address": ADDRESS},
        headers=headers,
    )
    assert checkout.status_code == 201
    order = checkout.json()["order"]
    assert order["status"] == "pending"
    assert order["payment_status"] == "unpaid"
    assert order["total"] == "2070.00"
    assert order["items"][0]["quantity"] == 2
    assert checkout.json()["payment_instructions"]["type"] == "cash_on_delivery"

    # stock went down and the cart was emptied
    product = await client.get("/api/v1/products/checkout-oud")
    assert product.json()["variants"][0]["stock_quantity"] == 3
    assert (await client.get("/api/v1/cart", headers=headers)).json()["items"] == []


async def test_cannot_add_more_than_stock(client, admin_token, customer_token):
    variant_id = await _create_product(client, admin_token, stock=2)
    response = await client.post(
        "/api/v1/cart/items",
        json={"variant_id": variant_id, "quantity": 3},
        headers=auth(customer_token),
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "out_of_stock"


async def test_checkout_with_empty_cart_fails(client, customer_token):
    response = await client.post(
        "/api/v1/orders/checkout",
        json={"payment_method": "cod", "shipping_address": ADDRESS},
        headers=auth(customer_token),
    )
    assert response.status_code == 422


async def test_cancelling_an_order_restocks(client, admin_token, customer_token):
    variant_id = await _create_product(client, admin_token, stock=5)
    headers = auth(customer_token)
    await client.post(
        "/api/v1/cart/items", json={"variant_id": variant_id, "quantity": 2}, headers=headers
    )
    order = (
        await client.post(
            "/api/v1/orders/checkout",
            json={"payment_method": "cod", "shipping_address": ADDRESS},
            headers=headers,
        )
    ).json()["order"]

    cancelled = await client.post(f"/api/v1/orders/{order['id']}/cancel", headers=headers)
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"

    product = await client.get("/api/v1/products/checkout-oud")
    assert product.json()["variants"][0]["stock_quantity"] == 5
