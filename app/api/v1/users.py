import uuid

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession
from app.models.address import Address
from app.models.user import User
from app.schemas.address import AddressCreate, AddressOut, AddressUpdate
from app.schemas.common import Message
from app.schemas.user import PasswordChange, UserOut, UserUpdate
from app.services import user_service

router = APIRouter(prefix="/users", tags=["users"])


@router.patch("/me", response_model=UserOut)
async def update_me(data: UserUpdate, user: CurrentUser, db: DbSession) -> User:
    return await user_service.update_profile(db, user, data)


@router.post("/me/password", response_model=Message)
async def change_password(data: PasswordChange, user: CurrentUser, db: DbSession) -> Message:
    await user_service.change_password(db, user, data)
    return Message(message="Password updated")


@router.get("/me/addresses", response_model=list[AddressOut])
async def list_addresses(user: CurrentUser, db: DbSession) -> list[Address]:
    return await user_service.list_addresses(db, user.id)


@router.post(
    "/me/addresses", response_model=AddressOut, status_code=status.HTTP_201_CREATED
)
async def create_address(data: AddressCreate, user: CurrentUser, db: DbSession) -> Address:
    return await user_service.create_address(db, user.id, data)


@router.patch("/me/addresses/{address_id}", response_model=AddressOut)
async def update_address(
    address_id: uuid.UUID, data: AddressUpdate, user: CurrentUser, db: DbSession
) -> Address:
    return await user_service.update_address(db, user.id, address_id, data)


@router.delete("/me/addresses/{address_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_address(address_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    await user_service.delete_address(db, user.id, address_id)
