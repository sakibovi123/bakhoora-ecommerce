import re

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlalchemy.pool import NullPool

from app.core.cache import cache
from app.core.config import settings
from app.core.security import hash_password
from app.db.base import Base
from app.db.session import build_engine, connect_args, get_db
from app.main import app
from app.models.role import Role, RolePermission
from app.models.user import User
from app.utils.menus import ADMIN_ROLE_SLUG, CUSTOMER_ROLE_SLUG, MENUS
from app.utils.sizes import DEFAULT_VARIANT_SIZES_ML

# Supabase hosts a single database, so tests get an isolated schema inside it
# rather than a separate "..._test" database.
TEST_SCHEMA = settings.TEST_SCHEMA
assert re.fullmatch(r"[a-z_][a-z0-9_]*", TEST_SCHEMA), "TEST_SCHEMA must be a bare identifier"
assert TEST_SCHEMA != "public"


@pytest.fixture(autouse=True)
def reset_cache():
    """The cache is a module-level singleton; the database is not.

    Every test builds a fresh schema, so an entry left over from the previous
    test describes rows that no longer exist. Clearing between tests keeps that
    leakage out, and resets the hit/miss counters the cache tests assert on.
    """
    cache.clear()
    yield
    cache.clear()


@pytest_asyncio.fixture
async def engine():
    # DDL goes over the direct/session connection, never the transaction pooler.
    admin_engine = build_engine(settings.direct_url, poolclass=NullPool)
    async with admin_engine.begin() as conn:
        await conn.execute(text(f'DROP SCHEMA IF EXISTS "{TEST_SCHEMA}" CASCADE'))
        await conn.execute(text(f'CREATE SCHEMA "{TEST_SCHEMA}"'))
    await admin_engine.dispose()

    # search_path holds only the test schema, so an unqualified name can never
    # resolve to a production table in public.
    test_engine = build_engine(
        settings.direct_url,
        poolclass=NullPool,
        connect_args=connect_args(
            settings.direct_url, server_settings={"search_path": TEST_SCHEMA}
        ),
    )
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # The two system roles are part of the schema's contract: registering a
    # customer looks one up, so seed them the way the migration does.
    async with async_sessionmaker(test_engine, expire_on_commit=False)() as session:
        session.add(
            Role(
                name="Customer",
                slug=CUSTOMER_ROLE_SLUG,
                is_staff=False,
                is_system=True,
            )
        )
        administrator = Role(
            name="Administrator",
            slug=ADMIN_ROLE_SLUG,
            is_staff=True,
            is_system=True,
        )
        administrator.permissions = [
            RolePermission(menu=menu.key, can_view=True, can_manage=True) for menu in MENUS
        ]
        session.add(administrator)
        await session.commit()

    yield test_engine
    await test_engine.dispose()


@pytest_asyncio.fixture
async def session_factory(engine):
    return async_sessionmaker(engine, expire_on_commit=False, autoflush=False)


@pytest_asyncio.fixture
async def client(session_factory):
    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as async_client:
        yield async_client
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def admin_token(client, session_factory) -> str:
    async with session_factory() as session:
        administrator = await session.scalar(select(Role).where(Role.slug == ADMIN_ROLE_SLUG))
        session.add(
            User(
                email="admin@test.dev",
                hashed_password=hash_password("Password123"),
                full_name="Test Admin",
                role_id=administrator.id,
            )
        )
        await session.commit()
    response = await client.post(
        "/api/v1/auth/login", json={"email": "admin@test.dev", "password": "Password123"}
    )
    return response.json()["access_token"]


@pytest_asyncio.fixture
async def customer_token(client) -> str:
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "customer@test.dev",
            "password": "Password123",
            "full_name": "Test Customer",
        },
    )
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "customer@test.dev", "password": "Password123"},
    )
    return response.json()["access_token"]


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def standard_variants(*, base_price: int = 1000, stock: int = 10) -> list[dict[str, object]]:
    """Payload for the four mandatory bottle sizes, one price per size."""
    return [
        {"size_ml": size, "price": f"{base_price + 500 * index}.00", "stock_quantity": stock}
        for index, size in enumerate(DEFAULT_VARIANT_SIZES_ML)
    ]


async def role_id(session_factory, slug: str) -> str:
    """Look up a seeded role's id without going through the API."""
    async with session_factory() as session:
        role = await session.scalar(select(Role).where(Role.slug == slug))
        return str(role.id)
