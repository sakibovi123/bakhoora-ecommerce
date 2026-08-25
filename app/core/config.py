import os
from decimal import Decimal
from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL, make_url

# libpq accepts these in a connection URI; asyncpg raises TypeError on them.
# Supabase hands out libpq URIs, so they get stripped before SQLAlchemy sees them.
_LIBPQ_ONLY_ARGS = frozenset(
    {
        "sslmode",
        "sslrootcert",
        "sslcert",
        "sslkey",
        "gssencmode",
        "channel_binding",
        "target_session_attrs",
        "options",
    }
)

# Supabase exposes the transaction-mode pooler here and session mode on 5432.
TRANSACTION_POOLER_PORT = 6543

# Which file to read settings from. Lets a local database live in .env.dev
# without disturbing the .env that points at Supabase.
ENV_FILE = os.getenv("ENV_FILE", ".env")

# The markers left in .env.example. Matched exactly rather than by "looks like a
# bracket" so an IPv6 host — postgresql://u:p@[::1]:5432/db — is not flagged.
_PLACEHOLDERS = (
    "[YOUR-PASSWORD]",
    "[REGION]",
    "<project-ref>",
    "<db-password>",
    "<region>",
)


def _unfilled(url: str) -> list[str]:
    lowered = url.lower()
    return [token for token in _PLACEHOLDERS if token.lower() in lowered]


# Environments where a dev server may sit on whatever port happened to be free.
LOCAL_ENVIRONMENTS = frozenset({"local", "dev", "development", "test"})

# Any port on the loopback host. Not a wildcard: the scheme and host are pinned,
# so it can never match a real site, and CORSMiddleware still echoes back the
# one requesting origin rather than "*" (which is illegal with credentials).
LOCALHOST_ORIGIN_REGEX = r"^http://(localhost|127\.0\.0\.1)(:\d+)?$"


def _asyncpg_url(raw: str) -> URL:
    url = make_url(raw.strip())
    if "+" not in url.drivername:
        url = url.set(drivername="postgresql+asyncpg")
    return url.difference_update_query(_LIBPQ_ONLY_ARGS)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    PROJECT_NAME: str = "Bakhoora API backend"
    VERSION: str = "0.1.1"
    API_V1_PREFIX: str = "/api/v1"
    ENVIRONMENT: str = "local"
    DEBUG: bool = True

    # --- database (Supabase hosted postgres) ---
    # Runtime traffic: transaction pooler (port 6543).
    DATABASE_URL: str = ""
    # DDL / migrations / tests: session pooler or direct connection (port 5432).
    # Falls back to DATABASE_URL when unset.
    DIRECT_DATABASE_URL: str = ""
    # asyncpg ssl mode; Supabase requires TLS. Empty string leaves it to asyncpg.
    DB_SSL: str = "require"
    DB_ECHO: bool = False
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    # Tests build and drop the whole schema, so it must never be "public".
    TEST_SCHEMA: str = "bakhoora_test"

    # --- supabase platform (storage, auth, edge functions) ---
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""

    # --- auth ---
    SECRET_KEY: str = "change-me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # --- storefront rules ---
    # --- product images ---
    MAX_PRODUCT_IMAGES: int = 4
    MAX_IMAGE_BYTES: int = 5 * 1024 * 1024
    # Where uploads are written, and the path they are served from. Files are
    # stored under a relative URL so the database stays portable between
    # environments — the client resolves it against the API's own origin.
    MEDIA_ROOT: str = "media"
    MEDIA_URL: str = "/media"

    CURRENCY: str = "BDT"
    SHIPPING_FLAT_FEE: Decimal = Decimal("70")
    FREE_SHIPPING_THRESHOLD: Decimal = Decimal("3000")
    LOW_STOCK_THRESHOLD: int = 5

    # --- read cache (app.core.cache) ---
    # TTLs are the ceiling on staleness, not the main invalidation route: every
    # write invalidates its namespace immediately. They exist because each
    # uvicorn worker caches independently, so a write in one worker is only
    # visible to the others once their copies expire. Short TTLs on volatile
    # data, long ones on the catalogue's shape.
    CACHE_ENABLED: bool = True
    CACHE_MAX_ENTRIES: int = 512
    CACHE_TTL_CATEGORIES: int = 300
    CACHE_TTL_PRODUCTS: int = 60
    # Orders belong to one customer and change under them; kept brief so a
    # multi-worker deployment cannot show a stale list for long.
    CACHE_TTL_ORDERS: int = 15

    CORS_ORIGINS: str = "*"
    # Set explicitly to allow a pattern of origins in a deployed environment.
    # Left empty, local runs fall back to LOCALHOST_ORIGIN_REGEX (see below).
    CORS_ORIGIN_REGEX: str = ""

    FIRST_ADMIN_EMAIL: str = "admin@bakhoora.bd"
    FIRST_ADMIN_PASSWORD: str = "Admin123!"

    @model_validator(mode="after")
    def _check_database_url(self) -> "Settings":
        if not self.DATABASE_URL.strip():
            raise ValueError(
                f"DATABASE_URL is not set in {ENV_FILE}. Copy the connection string from "
                "Supabase > Project Settings > Database > Connection string > URI."
            )
        # Without this the app starts happily and then fails DNS on every single
        # request, which reads like a bug in the API rather than an unedited file.
        unfilled = _unfilled(self.DATABASE_URL) + _unfilled(self.DIRECT_DATABASE_URL)
        if unfilled:
            raise ValueError(
                f"{ENV_FILE} still contains the placeholder(s) "
                f"{', '.join(sorted(set(unfilled)))} in DATABASE_URL / DIRECT_DATABASE_URL. "
                "Replace them with the real values from Supabase > Project Settings > "
                "Database > Connection string, or run against a local database with "
                "ENV_FILE=.env.dev."
            )
        if self.TEST_SCHEMA.strip().lower() in {"public", ""}:
            raise ValueError("TEST_SCHEMA must be a dedicated schema, never 'public'.")
        return self

    @property
    def is_local(self) -> bool:
        return self.ENVIRONMENT.strip().lower() in LOCAL_ENVIRONMENTS

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def cors_origin_regex(self) -> str | None:
        """Pattern of allowed origins, on top of the explicit list.

        `next dev` takes the first free port — 3000, then 3001, 3002 — so
        pinning the list to one port means the browser starts refusing
        preflights the moment something else is already listening. Locally,
        trust any loopback port. Deployed, only what CORS_ORIGIN_REGEX says.
        """
        if self.CORS_ORIGIN_REGEX.strip():
            return self.CORS_ORIGIN_REGEX.strip()
        return LOCALHOST_ORIGIN_REGEX if self.is_local else None

    @property
    def db_url(self) -> URL:
        return _asyncpg_url(self.DATABASE_URL)

    @property
    def database_url(self) -> str:
        return self.db_url.render_as_string(hide_password=False)

    @property
    def direct_url(self) -> URL:
        return _asyncpg_url(self.DIRECT_DATABASE_URL or self.DATABASE_URL)

    @property
    def migration_database_url(self) -> str:
        """Direct/session connection: prepared statements and DDL work here."""
        return self.direct_url.render_as_string(hide_password=False)

    @property
    def uses_transaction_pooler(self) -> bool:
        return self.db_url.port == TRANSACTION_POOLER_PORT


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
