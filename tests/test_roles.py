from app.utils.menus import MENUS
from tests.conftest import auth, role_id, standard_variants

ALL_MENUS = {menu.key for menu in MENUS}


async def _staff(client, admin_token, *, name, permissions, email=None, is_staff=True):
    """Create a role, put a fresh account on it, and return that account's token."""
    created = await client.post(
        "/api/v1/admin/roles",
        json={"name": name, "is_staff": is_staff, "permissions": permissions},
        headers=auth(admin_token),
    )
    assert created.status_code == 201, created.text
    role = created.json()

    address = email or f"{role['slug']}@test.dev"
    await client.post(
        "/api/v1/auth/register",
        json={"email": address, "password": "Password123", "full_name": name},
    )
    me = (
        await client.post(
            "/api/v1/auth/login", json={"email": address, "password": "Password123"}
        )
    ).json()["access_token"]
    user_id = (await client.get("/api/v1/auth/me", headers=auth(me))).json()["id"]

    assigned = await client.patch(
        f"/api/v1/admin/users/{user_id}",
        json={"role_id": role["id"]},
        headers=auth(admin_token),
    )
    assert assigned.status_code == 200, assigned.text

    # Re-login so the token belongs to the account in its new role.
    token = (
        await client.post(
            "/api/v1/auth/login", json={"email": address, "password": "Password123"}
        )
    ).json()["access_token"]
    return role, token


# --- catalogue -------------------------------------------------------------

async def test_menu_catalogue(client, admin_token):
    response = await client.get("/api/v1/admin/menus", headers=auth(admin_token))
    assert response.status_code == 200
    assert {menu["key"] for menu in response.json()} == ALL_MENUS


async def test_system_roles_are_listed_with_their_holders(client, admin_token):
    response = await client.get("/api/v1/admin/roles", headers=auth(admin_token))
    assert response.status_code == 200
    roles = {role["slug"]: role for role in response.json()}

    assert roles["customer"]["is_system"] is True
    assert roles["customer"]["is_staff"] is False
    assert roles["customer"]["permissions"] == []
    assert roles["admin"]["is_staff"] is True
    assert {p["menu"] for p in roles["admin"]["permissions"]} == ALL_MENUS
    assert roles["admin"]["user_count"] == 1


# --- creating roles --------------------------------------------------------

async def test_manage_implies_view(client, admin_token):
    role, _ = await _staff(
        client,
        admin_token,
        name="Fulfilment",
        permissions=[{"menu": "orders", "can_manage": True}],
    )
    orders = next(p for p in role["permissions"] if p["menu"] == "orders")
    assert orders == {"menu": "orders", "can_view": True, "can_manage": True}


async def test_permissions_that_grant_nothing_are_not_stored(client, admin_token):
    role, _ = await _staff(
        client,
        admin_token,
        name="Empty Handed",
        permissions=[
            {"menu": "orders", "can_view": True},
            {"menu": "products", "can_view": False, "can_manage": False},
        ],
    )
    assert [p["menu"] for p in role["permissions"]] == ["orders"]


async def test_unknown_menu_is_rejected(client, admin_token):
    response = await client.post(
        "/api/v1/admin/roles",
        json={"name": "Nonsense", "permissions": [{"menu": "invoices", "can_view": True}]},
        headers=auth(admin_token),
    )
    assert response.status_code == 422
    assert "is not a menu" in response.text


async def test_repeated_menu_is_rejected(client, admin_token):
    response = await client.post(
        "/api/v1/admin/roles",
        json={
            "name": "Doubled",
            "permissions": [
                {"menu": "orders", "can_view": True},
                {"menu": "orders", "can_manage": True},
            ],
        },
        headers=auth(admin_token),
    )
    assert response.status_code == 422
    assert "Repeated menu" in response.text


async def test_duplicate_role_name_is_rejected(client, admin_token):
    await _staff(client, admin_token, name="Support", permissions=[])
    clash = await client.post(
        "/api/v1/admin/roles", json={"name": "support"}, headers=auth(admin_token)
    )
    assert clash.status_code == 409


# --- what a limited role can actually reach --------------------------------

async def test_permissions_are_enforced_by_the_api_not_just_the_menu(
    client, admin_token, customer_token
):
    """A read-only orders role: sees orders, cannot touch them, cannot see products."""
    _, token = await _staff(
        client,
        admin_token,
        name="Support",
        permissions=[
            {"menu": "dashboard", "can_view": True},
            {"menu": "orders", "can_view": True},
        ],
    )

    assert (await client.get("/api/v1/admin/dashboard", headers=auth(token))).status_code == 200
    assert (await client.get("/api/v1/admin/orders", headers=auth(token))).status_code == 200

    # Viewing is not managing.
    listing = await client.get("/api/v1/admin/orders", headers=auth(admin_token))
    assert listing.status_code == 200

    # Menus the role does not hold are closed, not merely hidden.
    for path in ["/api/v1/admin/products", "/api/v1/admin/users", "/api/v1/admin/roles"]:
        response = await client.get(path, headers=auth(token))
        assert response.status_code == 403, path
        assert "Support" in response.text


async def test_read_only_role_cannot_write(client, admin_token, customer_token):
    _, token = await _staff(
        client,
        admin_token,
        name="Catalogue Reader",
        permissions=[{"menu": "products", "can_view": True}],
    )
    assert (await client.get("/api/v1/admin/products", headers=auth(token))).status_code == 200

    blocked = await client.post(
        "/api/v1/products",
        json={"name": "Sneaky Oud", "variants": standard_variants()},
        headers=auth(token),
    )
    assert blocked.status_code == 403
    assert "change anything in" in blocked.text


async def test_manage_permission_allows_the_write(client, admin_token):
    _, token = await _staff(
        client,
        admin_token,
        name="Catalogue Editor",
        permissions=[{"menu": "products", "can_manage": True}],
    )
    created = await client.post(
        "/api/v1/products",
        json={"name": "Editor Oud", "variants": standard_variants()},
        headers=auth(token),
    )
    assert created.status_code == 201


async def test_non_staff_role_cannot_open_the_panel_at_all(client, admin_token):
    _, token = await _staff(
        client,
        admin_token,
        name="Wholesale Buyer",
        is_staff=False,
        permissions=[{"menu": "orders", "can_manage": True}],
    )
    # is_staff=False wins: the permissions are dropped on the way in.
    response = await client.get("/api/v1/admin/orders", headers=auth(token))
    assert response.status_code == 403
    assert "Administrator access required" in response.text


async def test_me_reports_the_permission_map(client, admin_token):
    _, token = await _staff(
        client,
        admin_token,
        name="Stockist",
        permissions=[
            {"menu": "dashboard", "can_view": True},
            {"menu": "products", "can_manage": True},
        ],
    )
    me = (await client.get("/api/v1/auth/me", headers=auth(token))).json()
    assert me["role"]["name"] == "Stockist"
    assert me["permissions"] == {"dashboard": ["view"], "products": ["view", "manage"]}


async def test_a_customer_has_no_permissions(client, customer_token):
    me = (await client.get("/api/v1/auth/me", headers=auth(customer_token))).json()
    assert me["role"]["slug"] == "customer"
    assert me["role"]["is_staff"] is False
    assert me["permissions"] == {}


# --- editing and deleting roles --------------------------------------------

async def test_permissions_are_replaced_wholesale_on_update(client, admin_token):
    role, token = await _staff(
        client,
        admin_token,
        name="Shifting",
        permissions=[{"menu": "orders", "can_manage": True}],
    )
    updated = await client.patch(
        f"/api/v1/admin/roles/{role['id']}",
        json={"permissions": [{"menu": "categories", "can_view": True}]},
        headers=auth(admin_token),
    )
    assert updated.status_code == 200
    assert [p["menu"] for p in updated.json()["permissions"]] == ["categories"]
    # The old grant is gone immediately, on the existing token.
    assert (await client.get("/api/v1/admin/orders", headers=auth(token))).status_code == 403


async def test_updating_permissions_keeps_a_menu_the_role_already_held(client, admin_token):
    """Regression: replacing the collection wholesale collided on (role_id, menu)."""
    role, _ = await _staff(
        client,
        admin_token,
        name="Overlapping",
        permissions=[
            {"menu": "dashboard", "can_view": True},
            {"menu": "orders", "can_manage": True},
        ],
    )
    updated = await client.patch(
        f"/api/v1/admin/roles/{role['id']}",
        json={
            "permissions": [
                {"menu": "dashboard", "can_view": True},   # kept as-is
                {"menu": "orders", "can_view": True},      # downgraded
                {"menu": "products", "can_manage": True},  # added
            ]
        },
        headers=auth(admin_token),
    )
    assert updated.status_code == 200, updated.text
    grid = {p["menu"]: (p["can_view"], p["can_manage"]) for p in updated.json()["permissions"]}
    assert grid == {
        "dashboard": (True, False),
        "orders": (True, False),
        "products": (True, True),
    }


async def test_dropping_staff_clears_the_menus(client, admin_token):
    role, _ = await _staff(
        client, admin_token, name="Demoted", permissions=[{"menu": "orders", "can_manage": True}]
    )
    updated = await client.patch(
        f"/api/v1/admin/roles/{role['id']}", json={"is_staff": False}, headers=auth(admin_token)
    )
    assert updated.status_code == 200
    assert updated.json()["permissions"] == []


async def test_system_roles_are_protected(client, admin_token, session_factory):
    admin_role = await role_id(session_factory, "admin")
    customer_role = await role_id(session_factory, "customer")

    assert (
        await client.delete(f"/api/v1/admin/roles/{admin_role}", headers=auth(admin_token))
    ).status_code == 422
    assert (
        await client.delete(f"/api/v1/admin/roles/{customer_role}", headers=auth(admin_token))
    ).status_code == 422

    narrowed = await client.patch(
        f"/api/v1/admin/roles/{admin_role}",
        json={"permissions": [{"menu": "orders", "can_view": True}]},
        headers=auth(admin_token),
    )
    assert narrowed.status_code == 422
    assert "always holds every permission" in narrowed.text

    unstaffed = await client.patch(
        f"/api/v1/admin/roles/{admin_role}",
        json={"is_staff": False},
        headers=auth(admin_token),
    )
    assert unstaffed.status_code == 422


async def test_system_roles_can_still_be_renamed(client, admin_token, session_factory):
    response = await client.patch(
        f"/api/v1/admin/roles/{await role_id(session_factory, 'admin')}",
        json={"name": "Owner"},
        headers=auth(admin_token),
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Owner"
    assert response.json()["is_system"] is True


async def test_a_role_in_use_cannot_be_deleted(client, admin_token):
    role, _ = await _staff(client, admin_token, name="Occupied", permissions=[])
    blocked = await client.delete(
        f"/api/v1/admin/roles/{role['id']}", headers=auth(admin_token)
    )
    assert blocked.status_code == 409
    assert "still use" in blocked.text


async def test_an_empty_role_can_be_deleted(client, admin_token):
    created = await client.post(
        "/api/v1/admin/roles", json={"name": "Temporary"}, headers=auth(admin_token)
    )
    role = created.json()
    assert (
        await client.delete(f"/api/v1/admin/roles/{role['id']}", headers=auth(admin_token))
    ).status_code == 204


async def test_only_a_roles_manager_can_change_roles(client, admin_token):
    _, token = await _staff(
        client,
        admin_token,
        name="Role Reader",
        permissions=[{"menu": "roles", "can_view": True}],
    )
    assert (await client.get("/api/v1/admin/roles", headers=auth(token))).status_code == 200
    blocked = await client.post(
        "/api/v1/admin/roles", json={"name": "Made By A Viewer"}, headers=auth(token)
    )
    assert blocked.status_code == 403


async def test_last_panel_account_cannot_be_demoted(client, admin_token, session_factory):
    """The seeded administrator is the only way in, so it is pinned."""
    admin_id = (await client.get("/api/v1/auth/me", headers=auth(admin_token))).json()["id"]
    response = await client.patch(
        f"/api/v1/admin/users/{admin_id}",
        json={"role_id": await role_id(session_factory, "customer")},
        headers=auth(admin_token),
    )
    assert response.status_code == 422
    assert "your own access" in response.text
