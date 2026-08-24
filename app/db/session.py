from collections.abc import AsyncGenerator
from typing import Any
from uuid import uuid4

from sqlalchemy.engine import URL, make_url
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.core.config import TRANSACTION_POOLER_PORT, settings


def _is_transaction_pooler(url: URL) -> bool:
    return url.port == TRANSACTION_POOLER_PORT


def connect_args(url: str | URL, **extra: Any) -> dict[str, Any]:
    """asyncpg connect arguments for a Supabase endpoint."""
    url = make_url(url) if isinstance(url, str) else url
    args: dict[str, Any] = {}
    if settings.DB_SSL:
        args["ssl"] = settings.DB_SSL
    if _is_transaction_pooler(url):
        # The transaction pooler hands every transaction a different backend, so
        # server-side prepared statements can neither be reused nor keep their
        # sequential names unique. Turn both caches off and randomise the names.
        args["statement_cache_size"] = 0
        args["prepared_statement_cache_size"] = 0
        args["prepared_statement_name_func"] = lambda: f"__asyncpg_{uuid4()}__"
    args.update(extra)
    return args


def build_engine(url: str | URL, **overrides: Any) -> AsyncEngine:
    url = make_url(url) if isinstance(url, str) else url
    options: dict[str, Any] = {
        "echo": settings.DB_ECHO,
        "connect_args": connect_args(url),
    }
    if _is_transaction_pooler(url):
        # PgBouncer already pools; a second pool on top only strands connections.
        options["poolclass"] = NullPool
    options.update(overrides)

    # Sizing arguments are only meaningful to a real pool, and NullPool rejects
    # them outright — so apply them after the caller has had its say.
    if options.get("poolclass") is not NullPool:
        options.setdefault("pool_pre_ping", True)
        options.setdefault("pool_size", settings.DB_POOL_SIZE)
        options.setdefault("max_overflow", settings.DB_MAX_OVERFLOW)
    return create_async_engine(url, **options)


engine = build_engine(settings.db_url)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """One session per request. Services commit explicitly; we only clean up."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
