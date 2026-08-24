import uuid

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.cart import CartItemAdd, CartItemUpdate, CartOut
from app.services import cart_service

router = APIRouter(prefix="/cart", tags=["cart"])


@router.get("", response_model=CartOut)
async def get_cart(user: CurrentUser, db: DbSession) -> CartOut:
    return await cart_service.get_cart(db, user.id)


@router.post("/items", response_model=CartOut)
async def add_item(data: CartItemAdd, user: CurrentUser, db: DbSession) -> CartOut:
    return await cart_service.add_item(db, user.id, data)


@router.patch("/items/{item_id}", response_model=CartOut)
async def update_item(
    item_id: uuid.UUID, data: CartItemUpdate, user: CurrentUser, db: DbSession
) -> CartOut:
    return await cart_service.update_item(db, user.id, item_id, data)


@router.delete("/items/{item_id}", response_model=CartOut)
async def remove_item(item_id: uuid.UUID, user: CurrentUser, db: DbSession) -> CartOut:
    return await cart_service.remove_item(db, user.id, item_id)


@router.delete("", response_model=CartOut)
async def clear_cart(user: CurrentUser, db: DbSession) -> CartOut:
    return await cart_service.clear_cart(db, user.id)
