import uuid
from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, status
from fastapi.security import OAuth2PasswordRequestForm

from app.api.deps import CurrentUser, DbSession
from app.core.exceptions import AuthenticationError
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.models.user import User
from app.schemas.auth import LoginRequest, RefreshRequest, RegisterRequest, TokenPair
from app.schemas.user import AuthMe, UserOut
from app.services import user_service

router = APIRouter(prefix="/auth", tags=["auth"])


def _issue_tokens(user: User) -> TokenPair:
    subject = str(user.id)
    return TokenPair(
        access_token=create_access_token(subject),
        refresh_token=create_refresh_token(subject),
    )


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, db: DbSession) -> User:
    return await user_service.register(db, data)


@router.post("/login", response_model=TokenPair)
async def login(data: LoginRequest, db: DbSession) -> TokenPair:
    user = await user_service.authenticate(db, data.email, data.password)
    return _issue_tokens(user)


@router.post("/token", response_model=TokenPair, summary="Form login (Swagger Authorize)")
async def login_form(
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: DbSession,
) -> TokenPair:
    user = await user_service.authenticate(db, form.username, form.password)
    return _issue_tokens(user)


@router.post("/refresh", response_model=TokenPair)
async def refresh(data: RefreshRequest, db: DbSession) -> TokenPair:
    try:
        payload = decode_token(data.refresh_token, "refresh")
    except jwt.PyJWTError as exc:
        raise AuthenticationError("Invalid or expired refresh token") from exc

    user = await db.get(User, uuid.UUID(payload["sub"]))
    if user is None or not user.is_active:
        raise AuthenticationError("This account no longer exists or is disabled")
    return _issue_tokens(user)


@router.get("/me", response_model=AuthMe)
async def me(user: CurrentUser) -> AuthMe:
    """Profile plus what this account may do — the panel builds its menu from it."""
    return AuthMe(
        **UserOut.model_validate(user).model_dump(),
        permissions=user.role.menu_map,
    )
