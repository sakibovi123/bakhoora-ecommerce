from app.core.exceptions import BusinessRuleError
from app.payments.base import PaymentIntent, PaymentProvider
from app.payments.manual import CashOnDeliveryProvider, ManualBkashProvider

_PROVIDERS: dict[str, PaymentProvider] = {
    provider.name: provider
    for provider in (CashOnDeliveryProvider(), ManualBkashProvider())
}


def get_provider(name: str) -> PaymentProvider:
    try:
        return _PROVIDERS[name]
    except KeyError:
        raise BusinessRuleError(
            f"Unknown payment method '{name}'. Available: {', '.join(_PROVIDERS)}"
        ) from None


def available_providers() -> list[dict[str, object]]:
    return [
        {"name": p.name, "label": p.label, "requires_prepayment": p.requires_prepayment}
        for p in _PROVIDERS.values()
    ]


__all__ = ["PaymentIntent", "PaymentProvider", "available_providers", "get_provider"]
