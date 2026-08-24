from tests.conftest import auth


async def test_register_then_login(client):
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": "New@Example.com", "password": "Password123", "full_name": "New User"},
    )
    assert response.status_code == 201
    assert response.json()["email"] == "new@example.com"

    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "new@example.com", "password": "Password123"},
    )
    assert response.status_code == 200
    assert response.json()["access_token"]


async def test_duplicate_email_is_rejected(client):
    payload = {"email": "dup@example.com", "password": "Password123", "full_name": "Dup"}
    assert (await client.post("/api/v1/auth/register", json=payload)).status_code == 201
    second = await client.post("/api/v1/auth/register", json=payload)
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "conflict"


async def test_wrong_password_is_401(client, customer_token):
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "customer@test.dev", "password": "wrong-password"},
    )
    assert response.status_code == 401


async def test_me_requires_a_token(client, customer_token):
    assert (await client.get("/api/v1/auth/me")).status_code == 401
    response = await client.get("/api/v1/auth/me", headers=auth(customer_token))
    assert response.status_code == 200
    assert response.json()["role"]["slug"] == "customer"
