from fastapi import APIRouter

from app.api.v1 import (
    admin,
    auth,
    captions,
    cart,
    categories,
    expenses,
    orders,
    products,
    settings,
    users,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(categories.router)
api_router.include_router(products.router)
api_router.include_router(cart.router)
api_router.include_router(orders.router)
api_router.include_router(admin.router)
api_router.include_router(expenses.router)
api_router.include_router(captions.router)
api_router.include_router(settings.router)

__all__ = ["api_router"]
