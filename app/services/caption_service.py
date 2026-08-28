"""The caption assistant, via OpenRouter.

The API key lives here and never leaves the server. The panel posts to our own
endpoint, this calls OpenRouter, and the reply comes back — so a signed-in staff
session is the only thing that can spend the credit. Putting the key in the
browser would publish it to anyone who opened the network tab.
"""

import uuid

import httpx

from app.core.config import settings
from app.core.exceptions import AppError, BusinessRuleError
from app.models.product import Product
from app.models.settings import ShopSettings
from app.schemas.caption import PLATFORMS, CaptionReply, CaptionRequest
from app.services import product_service, report_service, settings_service
from sqlalchemy.ext.asyncio import AsyncSession


class CaptionUnavailableError(AppError):
    """Configuration is missing, or OpenRouter would not answer."""

    status_code = 503


def _shop_brief(shop: ShopSettings) -> str:
    return (
        f"The shop is {shop.site_title}, a perfume decanter in Dhaka, Bangladesh. "
        f"It buys designer bottles and market perfume oil and pours them into "
        f"6ml, 10ml, 15ml and 30ml glass to order. It is an independent decanter, "
        f"not an authorised dealer for any fragrance house. Prices are in "
        f"{shop.currency_code} and are written with the {shop.currency_symbol} sign."
    )


def _product_brief(product: Product) -> str:
    """The real listing, so a caption cannot invent a size or a price."""
    sizes = ", ".join(
        f"{variant.name} at {variant.price:.0f}"
        for variant in sorted(product.variants, key=lambda v: v.size_ml)
        if variant.is_active
    )
    lines = [f"The post is about this product, and these details are the truth:",
             f"- Name: {product.name}"]
    if product.brand:
        lines.append(f"- House: {product.brand}")
    if product.category:
        lines.append(f"- Category: {product.category.name}")
    if product.short_description:
        lines.append(f"- How the shop describes it: {product.short_description}")
    if sizes:
        lines.append(f"- Sizes and prices: {sizes}")
    lines.append(
        "- In stock" if product.variants and any(v.stock_quantity > 0 for v in product.variants)
        else "- Currently out of stock, so do not promise availability"
    )
    return "\n".join(lines)


SYSTEM = """\
You write social media captions for a small perfume shop. You are talking to the \
shop's own staff, not to customers.

{shop}

You are writing {platform}. Today is {today}.

How to write:
- Short. A caption is read in two seconds. Lead with the hook, not the brand name.
- Write the way the shop's own owner would, not like an advertising agency. No \
"Elevate your senses", no "Indulge in luxury", no em-dash-heavy copywriter voice.
- Bangladeshi audience. A little Bangla mixed into English is natural where it \
fits; do not force it. Pick one script per caption and stay in it — either \
Bengali script throughout or Latin transliteration throughout. Never mix the two \
inside a word or a sentence, and leave Bangla out entirely rather than write \
something you are unsure of.
- 3 to 8 relevant hashtags at the end, lowercase, no invented brand tags.
- Emoji sparingly — one or two, or none.

What you must not do:
- Never invent a price, a size, a note, or a claim about how long something lasts. \
If you were not given a detail, write around it or ask for it.
- Never put a year in a hashtag or the text unless it is the current year given \
above, and never guess a date, a deadline or a festival cutoff — ask instead.
- Never call the shop an official stockist, authorised dealer, or partner of any \
fragrance house. It decants independently and says so.
- Never promise delivery times or discounts you were not told about.

Offer two or three distinct options rather than one, so there is something to \
choose between. Keep your own commentary to a single line.\
"""


async def _build_system(db: AsyncSession, data: CaptionRequest) -> str:
    shop = await settings_service.get(db)
    system = SYSTEM.format(
        shop=_shop_brief(shop),
        platform=PLATFORMS[data.platform],
        # Shop-local, not the server's UTC date, and not the model's guess —
        # left to itself it reaches for whatever year its training suggests.
        today=report_service.today().strftime("%-d %B %Y"),
    )
    if data.product_id is not None:
        product = await product_service.get_by_id(db, data.product_id)
        system = f"{system}\n\n{_product_brief(product)}"
    return system


async def generate(db: AsyncSession, data: CaptionRequest) -> CaptionReply:
    if not settings.OPENROUTER_API_KEY.strip():
        raise CaptionUnavailableError(
            "The caption assistant is not configured. Set OPENROUTER_API_KEY and "
            "restart the server."
        )

    system = await _build_system(db, data)
    payload = {
        "model": settings.OPENROUTER_MODEL,
        "max_tokens": settings.OPENROUTER_MAX_TOKENS,
        "messages": [
            {"role": "system", "content": system},
            *({"role": m.role, "content": m.content} for m in data.messages),
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=settings.OPENROUTER_TIMEOUT_SECONDS) as http:
            response = await http.post(
                f"{settings.OPENROUTER_BASE_URL.rstrip('/')}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                    # OpenRouter attributes usage to these; they are not secrets.
                    "HTTP-Referer": "https://bakhoora.bd",
                    "X-Title": "Bakhoora admin",
                },
                json=payload,
            )
    except httpx.TimeoutException as error:
        raise CaptionUnavailableError(
            "The caption assistant took too long to answer. Try again."
        ) from error
    except httpx.HTTPError as error:
        raise CaptionUnavailableError(
            "Could not reach the caption assistant. Check the server's connection."
        ) from error

    if response.status_code == 401:
        raise CaptionUnavailableError("OpenRouter rejected the API key.")
    if response.status_code == 402:
        raise CaptionUnavailableError(
            "The OpenRouter account is out of credit."
        )
    if response.status_code == 429:
        raise CaptionUnavailableError(
            "OpenRouter is rate limiting the shop. Wait a moment and try again."
        )
    if response.status_code >= 400:
        # The provider's own message is more useful than a generic failure, but
        # it is quoted rather than trusted — it goes to staff, not customers.
        detail = ""
        try:
            detail = (response.json().get("error") or {}).get("message", "")
        except ValueError:
            pass
        raise CaptionUnavailableError(
            f"The caption assistant failed ({response.status_code})."
            + (f" {detail}" if detail else "")
        )

    body = response.json()
    choices = body.get("choices") or []
    if not choices:
        raise BusinessRuleError("The caption assistant returned nothing. Try again.")

    content = (choices[0].get("message") or {}).get("content") or ""
    if not content.strip():
        raise BusinessRuleError("The caption assistant returned an empty reply.")

    return CaptionReply(content=content.strip(), model=body.get("model") or settings.OPENROUTER_MODEL)


async def product_options(db: AsyncSession) -> list[tuple[uuid.UUID, str]]:
    """Products to choose from, newest first. Id and a display label only."""
    items, _ = await product_service.list_products(db, page=1, size=100, sort="name")
    return [
        (item.id, f"{item.brand} · {item.name}" if item.brand else item.name)
        for item in items
    ]
