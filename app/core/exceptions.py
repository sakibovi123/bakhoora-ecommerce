import logging
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse

logger = logging.getLogger("app.errors")


class AppError(Exception):
    """Base class for every expected, user-facing failure."""

    status_code: int = 400
    code: str = "app_error"

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        code: str | None = None,
        details: Any = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        if status_code is not None:
            self.status_code = status_code
        if code is not None:
            self.code = code
        self.details = details


class AuthenticationError(AppError):
    status_code = 401
    code = "not_authenticated"


class PermissionDeniedError(AppError):
    status_code = 403
    code = "permission_denied"


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class ConflictError(AppError):
    status_code = 409
    code = "conflict"


class BusinessRuleError(AppError):
    status_code = 422
    code = "business_rule_violation"


class OutOfStockError(BusinessRuleError):
    code = "out_of_stock"


async def app_error_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, AppError)
    headers = {"WWW-Authenticate": "Bearer"} if exc.status_code == 401 else None
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
        headers=headers,
    )


async def database_unavailable_handler(request: Request, exc: Exception) -> JSONResponse:
    """The database could not be reached.

    Without this the client gets a bare 500 with an unparseable body, which
    reads as "the API is broken" rather than "the API cannot reach its
    database" — two very different things to go and fix.
    """
    logger.error("Database unreachable on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=503,
        content={
            "error": {
                "code": "database_unavailable",
                "message": (
                    "The API is running but cannot reach its database. "
                    "Check DATABASE_URL and that the database is accepting connections."
                ),
                "details": None,
            }
        },
    )
