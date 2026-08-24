from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable

from app.models.order import Order, PaymentStatus


@dataclass(slots=True)
class PaymentIntent:
    """What a provider hands back after a payment is initiated."""

    provider: str
    status: PaymentStatus
    reference: str | None = None
    instructions: dict[str, Any] = field(default_factory=dict)
    raw_response: dict[str, Any] | None = None


@runtime_checkable
class PaymentProvider(Protocol):
    name: str
    label: str
    requires_prepayment: bool

    async def create_payment(self, order: Order) -> PaymentIntent: ...

    async def handle_callback(self, payload: dict[str, Any]) -> PaymentIntent: ...
