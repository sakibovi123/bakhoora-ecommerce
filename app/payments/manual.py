from typing import Any

from app.models.order import Order, PaymentStatus
from app.payments.base import PaymentIntent


class CashOnDeliveryProvider:
    name = "cod"
    label = "Cash on delivery"
    requires_prepayment = False

    async def create_payment(self, order: Order) -> PaymentIntent:
        # With an advance configured, "cash on delivery" is only true of the
        # remainder — saying otherwise would promise the customer they owe
        # nothing until the parcel lands, and the shop would chase them for it.
        advance = order.advance_required
        if advance > 0:
            message = (
                f"Send {advance} {order.currency} in advance to confirm this order, "
                f"then pay the remaining {order.total - advance} {order.currency} "
                f"to the courier on delivery."
            )
        else:
            message = f"Pay {order.total} {order.currency} to the courier when your order arrives."

        return PaymentIntent(
            provider=self.name,
            status=PaymentStatus.UNPAID,
            reference=order.order_number,
            instructions={
                "type": "cash_on_delivery",
                "advance_required": str(advance),
                "message": message,
            },
        )

    async def handle_callback(self, payload: dict[str, Any]) -> PaymentIntent:
        raise NotImplementedError("Cash on delivery has no callback")


class ManualBkashProvider:
    """Send money manually, then submit the trxID. Replace with the real gateway later."""

    name = "manual_bkash"
    label = "bKash (manual / send money)"
    requires_prepayment = True

    MERCHANT_NUMBER = "01XXXXXXXXX"

    async def create_payment(self, order: Order) -> PaymentIntent:
        return PaymentIntent(
            provider=self.name,
            status=PaymentStatus.PENDING,
            reference=order.order_number,
            instructions={
                "type": "manual_transfer",
                "wallet": "bKash",
                "number": self.MERCHANT_NUMBER,
                "amount": str(order.total),
                "reference": order.order_number,
                "message": (
                    f"Send {order.total} {order.currency} to {self.MERCHANT_NUMBER} "
                    f"using reference {order.order_number}, then submit your trxID."
                ),
            },
        )

    async def handle_callback(self, payload: dict[str, Any]) -> PaymentIntent:
        return PaymentIntent(
            provider=self.name,
            status=PaymentStatus.PENDING,
            reference=payload.get("trx_id"),
            raw_response=payload,
        )
