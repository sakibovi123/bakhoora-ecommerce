"""The price sheet, and changes that wait for approval.

Two things carry the weight here. The first is that `cost_price` is what the
shop pays its suppliers and must never reach a customer — `VariantOut` is the
same schema `GET /products` serves to anyone with a browser, so there is a test
that watches that boundary rather than trusting it.

The second is that proposing must not move a price. Everything else in the panel
writes when you press save; this one deliberately does not, and the test that
matters is the one asserting the catalogue is untouched while a sheet sits in
the queue.
"""

from decimal import Decimal, InvalidOperation

from tests.conftest import auth, staff_account, standard_variants


def _looks_like_money(value: str) -> bool:
    try:
        Decimal(value)
    except InvalidOperation:
        return False
    return True


async def _product(client, admin_token, *, name="Creed Aventus", stock=10):
    response = await client.post(
        "/api/v1/products",
        headers=auth(admin_token),
        json={"name": name, "variants": standard_variants(stock=stock)},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _sheet(client, token, **params):
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return await client.get(
        f"/api/v1/admin/pricing/sheet{'?' + query if query else ''}", headers=auth(token)
    )


async def _propose(client, token, lines, note=None):
    return await client.post(
        "/api/v1/admin/pricing/reviews",
        headers=auth(token),
        json={"lines": lines, "note": note},
    )


async def _row(client, token, sku):
    rows = (await _sheet(client, token)).json()
    return next(row for row in rows if row["sku"] == sku)


# --- the sheet --------------------------------------------------------------


async def test_the_sheet_lists_every_size_with_its_margin(client, admin_token):
    product = await _product(client, admin_token)
    sku = product["variants"][0]["sku"]

    response = await _sheet(client, admin_token)
    assert response.status_code == 200, response.text
    row = next(entry for entry in response.json() if entry["sku"] == sku)

    assert row["product_name"] == "Creed Aventus"
    assert row["price"] == "1000.00"
    # Nothing has been bought yet, so there is no cost and therefore no margin —
    # None rather than a 100% that would be a lie.
    assert row["cost_price"] is None
    assert row["profit"] is None
    assert row["margin_pct"] is None


async def test_a_known_cost_gives_a_profit_and_a_margin(client, admin_token):
    product = await _product(client, admin_token)
    variant = product["variants"][0]

    approved = await _approve(
        client,
        admin_token,
        [{"variant_id": variant["id"], "cost_price": "420.00", "price": "780.00"}],
    )
    assert approved.status_code == 200, approved.text

    row = await _row(client, admin_token, variant["sku"])
    assert row["cost_price"] == "420.00"
    assert row["price"] == "780.00"
    assert row["profit"] == "360.00"
    assert row["margin_pct"] == "46.2"


async def test_the_buying_price_never_reaches_the_storefront(client, admin_token):
    """The boundary this whole module is built around.

    `VariantOut` is shared with `GET /products`, which is public. A cost field
    added there would publish the shop's supplier prices to its customers.
    """
    product = await _product(client, admin_token)
    variant = product["variants"][0]
    await _approve(
        client,
        admin_token,
        [{"variant_id": variant["id"], "cost_price": "420.00", "price": "780.00"}],
    )

    public = await client.get(f"/api/v1/products/{product['slug']}")
    assert public.status_code == 200
    assert "cost_price" not in public.text

    # Asserted on the shape rather than by searching the body for "420": the
    # payload carries half a dozen UUIDs, and a three-digit run turns up inside
    # hex often enough to fail this roughly one run in twenty. The real
    # guarantee is that the field is not in the schema at all.
    variant = public.json()["variants"][0]
    assert set(variant) == {
        "id",
        "size_ml",
        "name",
        "sku",
        "price",
        "compare_at_price",
        "stock_quantity",
        "is_active",
        "in_stock",
    }
    assert Decimal("420.00") not in {
        Decimal(value)
        for value in variant.values()
        if isinstance(value, str) and _looks_like_money(value)
    }
    # And the new selling price did reach it, so the cache was cleared.
    assert variant["price"] == "780.00"


# --- proposing --------------------------------------------------------------


async def test_proposing_changes_nothing_until_it_is_approved(client, admin_token):
    product = await _product(client, admin_token)
    variant = product["variants"][0]

    proposed = await _propose(
        client,
        admin_token,
        [{"variant_id": variant["id"], "cost_price": "420.00", "price": "780.00"}],
    )
    assert proposed.status_code == 201, proposed.text
    review = proposed.json()
    assert review["status"] == "pending"
    assert review["reference"].startswith("PR-")
    assert review["line_count"] == 1

    line = review["lines"][0]
    assert line["from_price"] == "1000.00"
    assert line["to_price"] == "780.00"
    assert line["to_profit"] == "360.00"

    # The catalogue is untouched. This is the point of the whole module.
    row = await _row(client, admin_token, variant["sku"])
    assert row["price"] == "1000.00"
    assert row["cost_price"] is None


async def test_a_pending_row_is_flagged_on_the_sheet(client, admin_token):
    """So nobody proposes a second change against a price that is about to move."""
    product = await _product(client, admin_token)
    variant = product["variants"][0]
    proposed = await _propose(
        client, admin_token, [{"variant_id": variant["id"], "price": "780.00"}]
    )
    reference = proposed.json()["reference"]

    row = await _row(client, admin_token, variant["sku"])
    assert row["pending_reference"] == reference


async def test_rows_that_did_not_change_are_dropped(client, admin_token):
    product = await _product(client, admin_token)
    unchanged, changed = product["variants"][0], product["variants"][1]

    proposed = await _propose(
        client,
        admin_token,
        [
            {"variant_id": unchanged["id"], "price": unchanged["price"]},
            {"variant_id": changed["id"], "price": "1999.00"},
        ],
    )
    assert proposed.status_code == 201, proposed.text
    # Only the row that actually moves is part of the decision.
    assert proposed.json()["line_count"] == 1
    assert proposed.json()["lines"][0]["sku"] == changed["sku"]


async def test_a_sheet_that_changes_nothing_is_refused(client, admin_token):
    product = await _product(client, admin_token)
    variant = product["variants"][0]
    response = await _propose(
        client, admin_token, [{"variant_id": variant["id"], "price": variant["price"]}]
    )
    assert response.status_code == 422
    assert "different" in response.json()["error"]["message"]


async def test_the_same_size_twice_is_refused(client, admin_token):
    product = await _product(client, admin_token)
    variant = product["variants"][0]
    response = await _propose(
        client,
        admin_token,
        [
            {"variant_id": variant["id"], "price": "900.00"},
            {"variant_id": variant["id"], "price": "950.00"},
        ],
    )
    assert response.status_code == 422


# --- deciding ---------------------------------------------------------------


async def _approve(client, token, lines, note=None):
    proposed = await _propose(client, token, lines)
    assert proposed.status_code == 201, proposed.text
    return await client.post(
        f"/api/v1/admin/pricing/reviews/{proposed.json()['id']}/approve",
        headers=auth(token),
        json={"note": note},
    )


async def test_approving_applies_every_line(client, admin_token):
    product = await _product(client, admin_token)
    first, second = product["variants"][0], product["variants"][1]

    response = await _approve(
        client,
        admin_token,
        [
            {"variant_id": first["id"], "cost_price": "420.00", "price": "780.00"},
            {"variant_id": second["id"], "cost_price": "260.00", "price": "550.00"},
        ],
        note="February import prices",
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["updated"] == 2
    assert body["skipped"] == []
    assert body["review"]["status"] == "approved"
    assert body["review"]["review_note"] == "February import prices"
    assert body["review"]["reviewed_at"] is not None
    assert body["review"]["reviewed_by"] is not None

    assert (await _row(client, admin_token, first["sku"]))["price"] == "780.00"
    assert (await _row(client, admin_token, second["sku"]))["cost_price"] == "260.00"


async def test_rejecting_leaves_the_prices_alone(client, admin_token):
    product = await _product(client, admin_token)
    variant = product["variants"][0]
    proposed = await _propose(
        client,
        admin_token,
        [{"variant_id": variant["id"], "price": "780.00"}],
    )

    response = await client.post(
        f"/api/v1/admin/pricing/reviews/{proposed.json()['id']}/reject",
        headers=auth(admin_token),
        json={"note": "Too steep for the 6ml"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "rejected"
    assert response.json()["review_note"] == "Too steep for the 6ml"
    assert (await _row(client, admin_token, variant["sku"]))["price"] == "1000.00"


async def test_a_decided_sheet_cannot_be_decided_again(client, admin_token):
    product = await _product(client, admin_token)
    variant = product["variants"][0]
    proposed = await _propose(
        client,
        admin_token,
        [{"variant_id": variant["id"], "price": "780.00"}],
    )
    review_id = proposed.json()["id"]

    first = await client.post(
        f"/api/v1/admin/pricing/reviews/{review_id}/approve",
        headers=auth(admin_token), json={},
    )
    assert first.status_code == 200

    again = await client.post(
        f"/api/v1/admin/pricing/reviews/{review_id}/approve",
        headers=auth(admin_token), json={},
    )
    assert again.status_code == 409
    assert "already approved" in again.json()["error"]["message"]

    rejected_after = await client.post(
        f"/api/v1/admin/pricing/reviews/{review_id}/reject",
        headers=auth(admin_token), json={},
    )
    assert rejected_after.status_code == 409


async def test_a_price_moved_since_the_sheet_was_drawn_up_is_flagged(client, admin_token):
    """Approving overwrites whoever moved it, so the reviewer is told first."""
    product = await _product(client, admin_token)
    variant = product["variants"][0]
    proposed = await _propose(
        client,
        admin_token,
        [{"variant_id": variant["id"], "price": "780.00"}],
    )
    review_id = proposed.json()["id"]

    # Somebody edits the product directly in the meantime.
    await client.patch(
        f"/api/v1/products/variants/{variant['id']}",
        headers=auth(admin_token),
        json={"price": "1200.00"},
    )

    review = await client.get(
        f"/api/v1/admin/pricing/reviews/{review_id}", headers=auth(admin_token)
    )
    assert review.status_code == 200, review.text
    line = review.json()["lines"][0]
    assert line["from_price"] == "1000.00"
    assert line["current_price"] == "1200.00"
    assert line["drifted"] is True


async def test_selling_below_cost_is_shown_not_refused(client, admin_token):
    """A loss-leader is a real decision; an accident is what review is for."""
    product = await _product(client, admin_token)
    variant = product["variants"][0]
    proposed = await _propose(
        client,
        admin_token,
        [{"variant_id": variant["id"], "cost_price": "900.00", "price": "700.00"}],
    )
    assert proposed.status_code == 201, proposed.text
    line = proposed.json()["lines"][0]
    assert line["below_cost"] is True
    assert line["to_profit"] == "-200.00"


async def test_a_size_deleted_before_approval_is_skipped_and_named(client, admin_token):
    product = await _product(client, admin_token)
    keep = product["variants"][0]

    # An extra size, because the four standard ones cannot be deleted — only
    # deactivated — and this test needs a variant that can genuinely vanish.
    added = await client.post(
        f"/api/v1/products/{product['id']}/variants",
        headers=auth(admin_token),
        json={"size_ml": 50, "price": "2500.00", "stock_quantity": 2},
    )
    assert added.status_code == 201, added.text
    doomed = next(v for v in added.json()["variants"] if v["size_ml"] == 50)

    proposed = await _propose(
        client,
        admin_token,
        [
            {"variant_id": keep["id"], "price": "780.00"},
            {"variant_id": doomed["id"], "price": "1500.00"},
        ],
    )
    review_id = proposed.json()["id"]

    gone = await client.delete(
        f"/api/v1/products/variants/{doomed['id']}", headers=auth(admin_token)
    )
    assert gone.status_code in (200, 204), gone.text

    response = await client.post(
        f"/api/v1/admin/pricing/reviews/{review_id}/approve",
        headers=auth(admin_token), json={},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["updated"] == 1
    # Named, because "1 of 2 applied" without saying which is not actionable.
    assert len(body["skipped"]) == 1
    assert "Creed Aventus" in body["skipped"][0]
    assert (await _row(client, admin_token, keep["sku"]))["price"] == "780.00"


async def test_the_queue_lists_what_is_waiting(client, admin_token):
    product = await _product(client, admin_token)
    await _propose(
        client,
        admin_token,
        [{"variant_id": product["variants"][0]["id"], "price": "780.00"}],
    )
    await _approve(
        client,
        admin_token,
        [{"variant_id": product["variants"][1]["id"], "price": "999.00"}],
    )

    pending = await client.get(
        "/api/v1/admin/pricing/reviews?status=pending", headers=auth(admin_token)
    )
    assert pending.status_code == 200, pending.text
    assert pending.json()["total"] == 1
    assert pending.json()["items"][0]["status"] == "pending"
    assert pending.json()["items"][0]["proposed_by"] is not None

    everything = await client.get("/api/v1/admin/pricing/reviews", headers=auth(admin_token))
    assert everything.json()["total"] == 2


# --- who may do it ----------------------------------------------------------


async def test_seeing_the_sheet_is_not_being_able_to_change_it(client, admin_token):
    """A staff role can be given the pricing menu; deciding stays the owner's."""
    product = await _product(client, admin_token)
    variant = product["variants"][0]
    proposed = await _propose(
        client,
        admin_token,
        [{"variant_id": variant["id"], "price": "780.00"}],
    )
    review_id = proposed.json()["id"]

    _, token = await staff_account(
        client,
        admin_token,
        name="Shop floor",
        permissions=[{"menu": "pricing", "can_view": True, "can_manage": True}],
    )

    # Viewing is allowed, and shows the buying price — this is a back-office menu.
    assert (await _sheet(client, token)).status_code == 200
    assert (
        await client.get(f"/api/v1/admin/pricing/reviews/{review_id}", headers=auth(token))
    ).status_code == 200

    # Proposing and deciding are not.
    refused = await _propose(client, token, [{"variant_id": variant["id"], "price": "900.00"}])
    assert refused.status_code == 403
    assert (
        await client.post(
            f"/api/v1/admin/pricing/reviews/{review_id}/approve", headers=auth(token), json={}
        )
    ).status_code == 403
    assert (
        await client.post(
            f"/api/v1/admin/pricing/reviews/{review_id}/reject", headers=auth(token), json={}
        )
    ).status_code == 403


async def test_the_sheet_is_staff_only(client, customer_token):
    assert (await client.get("/api/v1/admin/pricing/sheet")).status_code == 401
    assert (await _sheet(client, customer_token)).status_code == 403
    assert (
        await client.get("/api/v1/admin/pricing/reviews", headers=auth(customer_token))
    ).status_code == 403
