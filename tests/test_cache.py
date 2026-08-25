"""Cache behaviour: that it caches, that it stops caching when the data moves,
and that it never mixes one customer's orders into another's response."""

import time

import pytest

from app.core.cache import CATEGORIES, ORDERS, PRODUCTS, cache, make_key
from tests.conftest import auth, standard_variants

ADDRESS = {
    "recipient_name": "Rahim Uddin",
    "phone": "01712345678",
    "line1": "House 12, Road 5",
    "city": "Dhaka",
    "district": "Dhaka",
    "postal_code": "1205",
}


async def _create_product(client, token, name="Cached Oud", **extra):
    payload = {
        "name": name,
        "brand": "Bakhoora",
        "short_description": "Test",
        "variants": standard_variants(),
        **extra,
    }
    response = await client.post("/api/v1/products", json=payload, headers=auth(token))
    assert response.status_code == 201, response.text
    return response.json()


# --- it caches -------------------------------------------------------------

async def test_second_list_is_served_from_cache(client, admin_token):
    await _create_product(client, admin_token)

    first = await client.get("/api/v1/products")
    assert first.status_code == 200
    assert cache.stats.misses == 1 and cache.stats.hits == 0

    second = await client.get("/api/v1/products")
    assert second.json() == first.json()
    assert cache.stats.hits == 1, "identical request should not have queried again"


async def test_categories_list_and_tree_cache_separately(client, admin_token):
    await client.post(
        "/api/v1/categories", json={"name": "Attar"}, headers=auth(admin_token)
    )
    await client.get("/api/v1/categories")
    await client.get("/api/v1/categories/tree")
    # Two endpoints, two entries — the tree is a different shape of the same rows.
    assert cache.size(CATEGORIES) == 2

    await client.get("/api/v1/categories")
    assert cache.stats.hits == 1


async def test_different_filters_are_different_entries(client, admin_token):
    await _create_product(client, admin_token)

    await client.get("/api/v1/products?search=oud")
    await client.get("/api/v1/products?search=musk")
    await client.get("/api/v1/products?page=2")

    assert cache.size(PRODUCTS) == 3
    assert cache.stats.hits == 0, "different filters must not share an entry"


async def test_filter_values_are_not_confused(client, admin_token):
    """A key built by concatenation would collide here; a structured one does not."""
    assert make_key(search="ab", brand="c") != make_key(search="a", brand="bc")


# --- it stops caching when the data moves ----------------------------------

async def test_creating_a_product_invalidates_the_list(client, admin_token):
    await _create_product(client, admin_token, name="First")
    before = await client.get("/api/v1/products")
    assert before.json()["total"] == 1

    await _create_product(client, admin_token, name="Second")
    after = await client.get("/api/v1/products")
    assert after.json()["total"] == 2, "list still served the pre-insert result"


async def test_updating_a_product_invalidates_the_list(client, admin_token):
    product = await _create_product(client, admin_token, name="Before Rename")
    await client.get("/api/v1/products")

    await client.patch(
        f"/api/v1/products/{product['id']}",
        json={"name": "After Rename"},
        headers=auth(admin_token),
    )
    listed = await client.get("/api/v1/products")
    assert listed.json()["items"][0]["name"] == "After Rename"


async def test_creating_a_category_invalidates_categories(client, admin_token):
    await client.get("/api/v1/categories")
    assert cache.size(CATEGORIES) == 1

    await client.post(
        "/api/v1/categories", json={"name": "Oud"}, headers=auth(admin_token)
    )
    assert cache.size(CATEGORIES) == 0, "category write left a stale entry"

    listed = await client.get("/api/v1/categories")
    assert [c["name"] for c in listed.json()] == ["Oud"]


async def test_stock_change_invalidates_products_not_only_orders(
    client, admin_token, customer_token
):
    """The coupling worth testing: VariantOut publishes stock_quantity, so an
    order that moves stock has to drop the *product* cache as well."""
    product = await _create_product(client, admin_token)
    variant = product["variants"][0]

    await client.get("/api/v1/products")
    assert cache.size(PRODUCTS) == 1

    await client.post(
        "/api/v1/cart/items",
        json={"variant_id": variant["id"], "quantity": 2},
        headers=auth(customer_token),
    )
    await client.post(
        "/api/v1/orders/checkout",
        json={"payment_method": "cod", "shipping_address": ADDRESS},
        headers=auth(customer_token),
    )

    assert cache.size(PRODUCTS) == 0, "checkout moved stock but left the product list cached"
    listed = await client.get("/api/v1/products")
    sold = next(
        v for v in listed.json()["items"][0]["variants"] if v["id"] == variant["id"]
    )
    assert sold["stock_quantity"] == 8


# --- it never crosses customers --------------------------------------------

async def test_one_customers_orders_never_reach_another(client, admin_token):
    """The failure this cache could plausibly cause, tested directly."""
    product = await _create_product(client, admin_token)
    variant_id = product["variants"][0]["id"]

    tokens = {}
    for name in ("alice", "bob"):
        await client.post(
            "/api/v1/auth/register",
            json={
                "email": f"{name}@test.dev",
                "password": "Password123",
                "full_name": name.title(),
            },
        )
        login = await client.post(
            "/api/v1/auth/login",
            json={"email": f"{name}@test.dev", "password": "Password123"},
        )
        tokens[name] = login.json()["access_token"]

    # Only Alice orders.
    await client.post(
        "/api/v1/cart/items",
        json={"variant_id": variant_id, "quantity": 1},
        headers=auth(tokens["alice"]),
    )
    await client.post(
        "/api/v1/orders/checkout",
        json={"payment_method": "cod", "shipping_address": ADDRESS},
        headers=auth(tokens["alice"]),
    )

    alice = await client.get("/api/v1/orders", headers=auth(tokens["alice"]))
    assert alice.json()["total"] == 1

    # Same endpoint, same pagination, different bearer token.
    bob = await client.get("/api/v1/orders", headers=auth(tokens["bob"]))
    assert bob.json()["total"] == 0, "Bob was served Alice's cached order list"
    assert bob.json()["items"] == []

    # And Alice still sees her own.
    again = await client.get("/api/v1/orders", headers=auth(tokens["alice"]))
    assert again.json()["total"] == 1
    assert cache.size(ORDERS) == 2, "two customers should hold two entries"


async def test_placing_an_order_invalidates_that_customers_list(
    client, admin_token, customer_token
):
    product = await _create_product(client, admin_token)
    variant_id = product["variants"][0]["id"]

    empty = await client.get("/api/v1/orders", headers=auth(customer_token))
    assert empty.json()["total"] == 0

    await client.post(
        "/api/v1/cart/items",
        json={"variant_id": variant_id, "quantity": 1},
        headers=auth(customer_token),
    )
    await client.post(
        "/api/v1/orders/checkout",
        json={"payment_method": "cod", "shipping_address": ADDRESS},
        headers=auth(customer_token),
    )

    after = await client.get("/api/v1/orders", headers=auth(customer_token))
    assert after.json()["total"] == 1, "the customer's own new order was hidden by the cache"


# --- the store itself ------------------------------------------------------

async def test_expired_entries_are_not_served():
    calls = []

    async def factory():
        calls.append(1)
        return len(calls)

    assert await cache.get_or_set(PRODUCTS, "k", factory, ttl=60) == 1
    assert await cache.get_or_set(PRODUCTS, "k", factory, ttl=60) == 1

    # Age the entry rather than the clock. Patching time.monotonic would also
    # move it for the event loop, which schedules its own timers against it.
    cache._store[PRODUCTS]["k"].expires_at = time.monotonic() - 1
    assert await cache.get_or_set(PRODUCTS, "k", factory, ttl=60) == 2, "TTL was ignored"


async def test_lru_bound_is_enforced():
    small = type(cache)(max_entries=3)
    for index in range(10):
        small.set(PRODUCTS, f"key-{index}", index, ttl=60)
    assert small.size(PRODUCTS) == 3
    assert small.stats.evictions == 7
    found, _ = small.get(PRODUCTS, "key-0")
    assert found is False


async def test_concurrent_misses_query_once():
    import asyncio

    calls = []

    async def slow_factory():
        calls.append(1)
        await asyncio.sleep(0.05)
        return "value"

    results = await asyncio.gather(
        *(cache.get_or_set(PRODUCTS, "shared", slow_factory, ttl=60) for _ in range(5))
    )
    assert results == ["value"] * 5
    assert len(calls) == 1, "a cold cache stampeded the database"


@pytest.mark.parametrize("enabled", [True, False])
async def test_cache_can_be_switched_off(enabled, monkeypatch):
    monkeypatch.setattr("app.core.cache.settings.CACHE_ENABLED", enabled)
    calls = []

    async def factory():
        calls.append(1)
        return len(calls)

    await cache.get_or_set(PRODUCTS, "toggle", factory, ttl=60)
    await cache.get_or_set(PRODUCTS, "toggle", factory, ttl=60)
    assert len(calls) == (1 if enabled else 2)
