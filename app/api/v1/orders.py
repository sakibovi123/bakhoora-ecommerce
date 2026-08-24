import uuid
from typing import Any

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession, PageParams
from app.models.order import Order
from app.payments import available_providers
from app.schemas.common import Page
from app.schemas.order import CheckoutRequest, CheckoutResponse, OrderListItem, OrderOut
from app.services import order_service

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("/payment-methods")
async def payment_methods() -> list[dict[str, Any]]:
    return available_providers()


@router.post("/checkout", response_model=CheckoutResponse, status_code=status.HTTP_201_CREATED)
async def checkout(data: CheckoutRequest, user: CurrentUser, db: DbSession) -> CheckoutResponse:
    order, intent = await order_service.checkout(db, user, data)
    return CheckoutResponse(
        order=OrderOut.model_validate(order),
        payment_instructions=intent.instructions,
    )


@router.get("", response_model=Page[OrderListItem])
async def my_orders(user: CurrentUser, db: DbSession, params: PageParams) -> Page[OrderListItem]:
    items, total = await order_service.list_orders(
        db, page=params.page, size=params.size, user_id=user.id
    )
    return Page.create(
        [OrderListItem.model_validate(item) for item in items], total, params.page, params.size
    )


@router.get("/{order_id}", response_model=OrderOut)
async def get_order(order_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Order:
    return await order_service.get_order(db, order_id, user=user)


@router.post("/{order_id}/cancel", response_model=OrderOut)
async def cancel_order(order_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Order:
    return await order_service.cancel_order(db, order_id, user)
