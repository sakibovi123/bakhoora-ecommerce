import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthenticationError, ConflictError, NotFoundError
from app.core.security import hash_password, verify_password
from app.models.address import Address
from app.models.user import User
from app.schemas.address import AddressCreate, AddressUpdate
from app.schemas.auth import RegisterRequest
from app.schemas.user import PasswordChange, UserUpdate
from app.services import role_service
from app.utils.menus import CUSTOMER_ROLE_SLUG


async def get_by_email(db: AsyncSession, email: str) -> User | None:
    return await db.scalar(select(User).where(User.email == email.lower()))


async def register(db: AsyncSession, data: RegisterRequest) -> User:
    if await get_by_email(db, data.email):
        raise ConflictError("An account with this email already exists")
    customer_role = await role_service.get_by_slug(db, CUSTOMER_ROLE_SLUG)
    user = User(
        email=data.email.lower(),
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        phone=data.phone,
        role_id=customer_role.id,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def authenticate(db: AsyncSession, email: str, password: str) -> User:
    user = await get_by_email(db, email)
    if user is None or not verify_password(password, user.hashed_password):
        raise AuthenticationError("Incorrect email or password")
    if not user.is_active:
        raise AuthenticationError("This account is disabled")
    return user


async def update_profile(db: AsyncSession, user: User, data: UserUpdate) -> User:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    await db.commit()
    await db.refresh(user)
    return user


async def change_password(db: AsyncSession, user: User, data: PasswordChange) -> None:
    if not verify_password(data.current_password, user.hashed_password):
        raise AuthenticationError("Current password is incorrect")
    user.hashed_password = hash_password(data.new_password)
    await db.commit()


# --- addresses -------------------------------------------------------------

async def list_addresses(db: AsyncSession, user_id: uuid.UUID) -> list[Address]:
    result = await db.scalars(
        select(Address).where(Address.user_id == user_id).order_by(
            Address.is_default.desc(), Address.created_at
        )
    )
    return list(result)


async def get_address(db: AsyncSession, user_id: uuid.UUID, address_id: uuid.UUID) -> Address:
    address = await db.scalar(
        select(Address).where(Address.id == address_id, Address.user_id == user_id)
    )
    if address is None:
        raise NotFoundError("Address not found")
    return address


async def _clear_other_defaults(
    db: AsyncSession, user_id: uuid.UUID, keep_id: uuid.UUID | None = None
) -> None:
    stmt = update(Address).where(Address.user_id == user_id).values(is_default=False)
    if keep_id is not None:
        stmt = stmt.where(Address.id != keep_id)
    await db.execute(stmt)


async def create_address(db: AsyncSession, user_id: uuid.UUID, data: AddressCreate) -> Address:
    existing = await list_addresses(db, user_id)
    address = Address(user_id=user_id, **data.model_dump())
    if not existing:
        address.is_default = True
    db.add(address)
    await db.flush()
    if address.is_default:
        await _clear_other_defaults(db, user_id, keep_id=address.id)
    await db.commit()
    await db.refresh(address)
    return address


async def update_address(
    db: AsyncSession, user_id: uuid.UUID, address_id: uuid.UUID, data: AddressUpdate
) -> Address:
    address = await get_address(db, user_id, address_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(address, field, value)
    if address.is_default:
        await _clear_other_defaults(db, user_id, keep_id=address.id)
    await db.commit()
    await db.refresh(address)
    return address


async def delete_address(db: AsyncSession, user_id: uuid.UUID, address_id: uuid.UUID) -> None:
    address = await get_address(db, user_id, address_id)
    await db.delete(address)
    await db.commit()
