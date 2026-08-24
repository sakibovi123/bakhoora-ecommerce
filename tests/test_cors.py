"""CORS, because `next dev` moves between ports and the browser is unforgiving."""

import pytest

from app.core.config import LOCALHOST_ORIGIN_REGEX, Settings

PREFLIGHT = {"Access-Control-Request-Method": "POST"}


def _settings(**overrides) -> Settings:
    base = {
        "DATABASE_URL": "postgresql://u:p@localhost:5432/db",
        "TEST_SCHEMA": "bakhoora_test",
    }
    return Settings(**{**base, **overrides})


@pytest.mark.parametrize(
    "origin",
    [
        "http://localhost:3000",
        "http://localhost:3002",   # the port that broke
        "http://localhost:3100",
        "http://127.0.0.1:5173",
        "http://localhost",
    ],
)
async def test_any_loopback_port_is_allowed_locally(client, origin):
    response = await client.options(
        "/api/v1/auth/login", headers={"Origin": origin, **PREFLIGHT}
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin


@pytest.mark.parametrize(
    "origin",
    [
        "https://evil.com",
        "http://localhost.evil.com",     # the anchor stops the suffix trick
        "http://evil.com:3002",
        "https://localhost:3000",        # scheme is pinned too
        "http://notlocalhost:3000",
    ],
)
async def test_other_origins_are_refused(client, origin):
    response = await client.options(
        "/api/v1/auth/login", headers={"Origin": origin, **PREFLIGHT}
    )
    assert "access-control-allow-origin" not in response.headers


def test_the_loopback_pattern_is_only_a_local_convenience():
    assert _settings(ENVIRONMENT="local").cors_origin_regex == LOCALHOST_ORIGIN_REGEX
    assert _settings(ENVIRONMENT="development").cors_origin_regex == LOCALHOST_ORIGIN_REGEX
    # Deployed, nothing is trusted unless it is spelled out.
    assert _settings(ENVIRONMENT="production").cors_origin_regex is None
    assert _settings(ENVIRONMENT="staging").cors_origin_regex is None


def test_an_explicit_pattern_wins_everywhere():
    settings = _settings(
        ENVIRONMENT="production", CORS_ORIGIN_REGEX=r"^https://.*\.bakhoora\.bd$"
    )
    assert settings.cors_origin_regex == r"^https://.*\.bakhoora\.bd$"
