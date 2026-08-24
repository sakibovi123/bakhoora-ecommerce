from app.utils.sizes import DEFAULT_VARIANT_SIZES_ML
from tests.conftest import auth, standard_variants

PRODUCT = {
    "name": "Test Oud",
    "short_description": "For tests",
    "variants": standard_variants(),
    "images": [{"url": "https://example.com/a.jpg"}],
}


async def _create(client, token, **overrides):
    return await client.post(
        "/api/v1/products", json={**PRODUCT, **overrides}, headers=auth(token)
    )


async def test_customer_cannot_create_products(client, customer_token):
    response = await client.post(
        "/api/v1/products", json=PRODUCT, headers=auth(customer_token)
    )
    assert response.status_code == 403


async def test_admin_creates_and_lists_products(client, admin_token):
    created = await _create(client, admin_token)
    assert created.status_code == 201
    body = created.json()
    assert body["slug"] == "test-oud"
    assert body["price_from"] == "1000.00"
    assert body["price_to"] == "2500.00"
    assert body["in_stock"] is True
    assert body["primary_image"] == "https://example.com/a.jpg"

    listing = await client.get("/api/v1/products")
    assert listing.status_code == 200
    assert listing.json()["total"] == 1

    detail = await client.get("/api/v1/products/test-oud")
    assert detail.status_code == 200
    assert len(detail.json()["variants"]) == len(DEFAULT_VARIANT_SIZES_ML)


async def test_every_product_gets_the_four_standard_sizes(client, admin_token):
    body = (await _create(client, admin_token)).json()
    assert [v["size_ml"] for v in body["variants"]] == list(DEFAULT_VARIANT_SIZES_ML)
    assert [v["name"] for v in body["variants"]] == ["6ml", "10ml", "15ml", "30ml"]
    # Each size carries its own price.
    prices = [v["price"] for v in body["variants"]]
    assert len(set(prices)) == len(prices)


async def test_variants_come_back_smallest_first(client, admin_token):
    shuffled = list(reversed(standard_variants()))
    body = (await _create(client, admin_token, variants=shuffled)).json()
    assert [v["size_ml"] for v in body["variants"]] == list(DEFAULT_VARIANT_SIZES_ML)


async def test_missing_standard_size_is_rejected(client, admin_token):
    incomplete = [v for v in standard_variants() if v["size_ml"] != 15]
    response = await _create(client, admin_token, variants=incomplete)
    assert response.status_code == 422
    assert "15ml" in response.text


async def test_repeated_size_is_rejected(client, admin_token):
    doubled = [*standard_variants(), {"size_ml": 6, "price": "999.00"}]
    response = await _create(client, admin_token, variants=doubled)
    assert response.status_code == 422
    assert "6ml" in response.text


async def test_skus_are_generated_from_slug_and_size(client, admin_token):
    body = (await _create(client, admin_token)).json()
    assert [v["sku"] for v in body["variants"]] == [
        "TEST-OUD-006ML",
        "TEST-OUD-010ML",
        "TEST-OUD-015ML",
        "TEST-OUD-030ML",
    ]


async def test_explicit_sku_is_kept_and_duplicates_rejected(client, admin_token):
    mine = standard_variants()
    mine[0]["sku"] = "MY-OWN-SKU"
    first = await _create(client, admin_token, variants=mine)
    assert first.status_code == 201
    assert first.json()["variants"][0]["sku"] == "MY-OWN-SKU"

    clash = await _create(client, admin_token, name="Another Oud", variants=mine)
    assert clash.status_code == 409


async def test_extra_size_can_be_added_later(client, admin_token):
    product_id = (await _create(client, admin_token)).json()["id"]

    added = await client.post(
        f"/api/v1/products/{product_id}/variants",
        json={"size_ml": 50, "price": "4200.00", "stock_quantity": 6},
        headers=auth(admin_token),
    )
    assert added.status_code == 201
    sizes = [v["size_ml"] for v in added.json()["variants"]]
    assert sizes == [6, 10, 15, 30, 50]
    assert added.json()["variants"][-1]["sku"] == "TEST-OUD-050ML"
    assert added.json()["price_to"] == "4200.00"


async def test_adding_a_size_the_product_already_has_is_rejected(client, admin_token):
    product_id = (await _create(client, admin_token)).json()["id"]
    response = await client.post(
        f"/api/v1/products/{product_id}/variants",
        json={"size_ml": 10, "price": "1234.00"},
        headers=auth(admin_token),
    )
    assert response.status_code == 409
    assert "10ml" in response.text


async def test_standard_size_cannot_be_deleted_but_an_extra_one_can(client, admin_token):
    product = (await _create(client, admin_token)).json()
    standard_id = product["variants"][0]["id"]

    refused = await client.delete(
        f"/api/v1/products/variants/{standard_id}", headers=auth(admin_token)
    )
    assert refused.status_code == 409

    with_extra = (
        await client.post(
            f"/api/v1/products/{product['id']}/variants",
            json={"size_ml": 100, "price": "7000.00"},
            headers=auth(admin_token),
        )
    ).json()
    extra_id = next(v["id"] for v in with_extra["variants"] if v["size_ml"] == 100)

    removed = await client.delete(
        f"/api/v1/products/variants/{extra_id}", headers=auth(admin_token)
    )
    assert removed.status_code == 204


async def test_standard_size_can_be_taken_off_sale(client, admin_token):
    product = (await _create(client, admin_token)).json()
    variant_id = product["variants"][0]["id"]

    response = await client.patch(
        f"/api/v1/products/variants/{variant_id}",
        json={"is_active": False},
        headers=auth(admin_token),
    )
    assert response.status_code == 200
    assert response.json()["is_active"] is False

    detail = await client.get("/api/v1/products/test-oud")
    assert detail.json()["price_from"] == "1500.00"     # the 6ml no longer counts
    assert len(detail.json()["variants"]) == 4          # but it is still there


async def test_resizing_a_variant_relabels_it(client, admin_token):
    product = (await _create(client, admin_token)).json()
    variant_id = next(v["id"] for v in product["variants"] if v["size_ml"] == 30)

    response = await client.patch(
        f"/api/v1/products/variants/{variant_id}",
        json={"size_ml": 35},
        headers=auth(admin_token),
    )
    assert response.status_code == 200
    assert response.json()["name"] == "35ml"


async def test_missing_product_is_404(client):
    assert (await client.get("/api/v1/products/nope")).status_code == 404
