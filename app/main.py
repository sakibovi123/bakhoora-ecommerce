from collections.abc import AsyncIterator
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import InterfaceError, OperationalError

from app.api.deps import DbSession
from app.api.v1 import api_router
from app.core.config import settings
from app.core.exceptions import AppError, app_error_handler, database_unavailable_handler
from app.db.session import engine


logger = logging.getLogger("bakhoora")


def _warn_if_browsers_are_locked_out() -> None:
    """Say so at boot when a deployment has no browser origin configured.

    Without this the symptom surfaces hours later, in someone else's browser
    console, as a CORS preflight failure that says nothing about which variable
    is wrong. It warns rather than refuses to start: the storefront renders
    server-side and does not need CORS, so a hard failure would take a working
    shop down to fix a broken admin login.
    """
    if settings.is_local or settings.cors_origins or settings.cors_origin_regex:
        return
    logger.warning(
        "CORS: ENVIRONMENT=%s and no CORS_ORIGINS is set, so every browser "
        "origin will be refused and the admin panel cannot sign in. Set "
        "CORS_ORIGINS to the frontend's origin, e.g. "
        "CORS_ORIGINS=https://your-frontend.example.com",
        settings.ENVIRONMENT,
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    _warn_if_browsers_are_locked_out()
    yield
    await engine.dispose()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Bakhoora - single vendor perfume store API",
    lifespan=lifespan,
    openapi_url=f"{settings.API_V1_PREFIX}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Uploaded product images. The directory is created on first use, but mounting
# StaticFiles needs it to exist now.
Path(settings.MEDIA_ROOT).mkdir(parents=True, exist_ok=True)
app.mount(settings.MEDIA_URL, StaticFiles(directory=settings.MEDIA_ROOT), name="media")

app.add_exception_handler(AppError, app_error_handler)
# Connection failures surface either as SQLAlchemy wrappers or, when DNS fails
# before a connection exists, as a raw OSError.
for _failure in (OperationalError, InterfaceError, OSError):
    app.add_exception_handler(_failure, database_unavailable_handler)
app.include_router(api_router, prefix=settings.API_V1_PREFIX)


@app.get("/health", tags=["meta"])
async def health(db: DbSession) -> dict[str, Any]:
    await db.execute(text("SELECT 1"))
    return {"status": "ok", "environment": settings.ENVIRONMENT, "version": settings.VERSION}
