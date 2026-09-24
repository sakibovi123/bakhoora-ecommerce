"""Reading a photographed supplier bill into a draft expense.

The shop's bills are cash memos from Mirpur print shops and oil importers: a
printed letterhead with the figures written on by hand, often in Bengali
numerals, frequently with a business card laid across the middle of the page.
Nothing off-the-shelf reads those, so the photograph goes to a vision model —
the same OpenRouter account the caption assistant already uses, for the same
reason: the key stays on the server and only a signed-in staff session can spend
the credit.

What comes back is a *draft*. It is never written to the database here. The
panel fills a form with it and a person presses Save, because a misread total
does not announce itself — it just quietly moves the month's profit.
"""

import asyncio
import base64
import json
import uuid
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

import httpx
from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import BusinessRuleError
from app.models.expense import ExpenseCategory
from app.schemas.expense import ReceiptDraft, ReceiptLine
from app.services import expense_service, report_service
from app.services.caption_service import CaptionUnavailableError
from app.utils.uploads import (
    RECEIPTS_FOLDER,
    delete_stored,
    extension_of,
    store_image,
)

# What a vision model will actually accept. `store_image` takes a wider set —
# product photography can be AVIF or HEIC — but no provider reads those, and an
# unconvertible upload has to be refused before it is stored rather than sent
# and rejected with a provider error nobody can act on.
#
# Converting instead would mean Pillow plus pillow-heif, native wheels in the
# deploy image, for a case the phone usually handles itself: Safari and Chrome
# both re-encode HEIC to JPEG when a photo goes through a file input. The
# message below is for the times they do not.
_MIME = {
    "jpg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "gif": "image/gif",
}


SYSTEM = """\
You read photographs of supplier bills for a small perfume shop in Dhaka, \
Bangladesh, and return what is written on them as JSON. You are a transcriber, \
not an accountant: report what the paper says.

The bills are Bangladeshi cash memos. Expect a printed letterhead with the \
figures filled in by hand, Bengali (০১২৩৪৫৬৭৮৯) and Latin digits mixed freely, \
amounts in taka written with ৳ or /- or nothing at all, and Bangla and English \
in the same line. Handwriting may be unclear and objects may cover part of the \
page.

Today is {today}. The shop's expense categories are:
{categories}

Return ONLY a JSON object, no prose and no code fence, with these keys:
- "supplier": the business name from the letterhead, or null.
- "reference": the memo or bill number the shop printed on it, as written \
(e.g. "579"), or null.
- "spent_on": the date on the bill as "YYYY-MM-DD", or null. Convert Bengali \
numerals. A two-digit year is 20xx. If the date is ambiguous or unreadable, use \
null and say so in "warnings" — do not guess.
- "amount": the TOTAL of the bill as a number, no currency sign or commas. This \
is the full cost, even when only part of it has been paid. Null if unreadable.
- "amount_paid": how much has actually been handed over. On a memo with \
"Advance" and "Due" lines, this is the advance. When the bill shows no advance \
or due at all, it was paid in full: return the same figure as "amount". Null if \
unreadable.
- "description": a short plain-English summary of what was bought, under 200 \
characters, in the shop's own voice — "200 boxes" not "Purchase of goods".
- "category_slug": the slug of the best-fitting category from the list above, or \
null if none fits.
- "lines": an array of the itemised rows, each {{"description": str, \
"quantity": number|null, "unit_price": number|null, "amount": number|null}}. \
Empty array if the bill is not itemised.
- "confidence": "high" if the figures are printed and unambiguous, "medium" if \
handwritten but clear, "low" if you are reading through glare, a fold, an \
object laid on the page, or unclear handwriting.
- "warnings": an array of short sentences naming anything you were unsure of and \
what a person should check. Mention any figure you read from unclear \
handwriting, anything hidden behind an object, and any arithmetic on the bill \
that does not add up. Empty array only if you are certain of everything.

Rules:
- Never invent a figure. A field you cannot read is null with a warning, never a \
plausible guess.
- Do not correct the bill's own arithmetic. If total, advance and due disagree, \
report all three as written and put the discrepancy in "warnings".
- If the image is not a bill or receipt at all, return every field null with a \
warning saying what it appears to be instead.\
"""


def _categories_brief(categories: list[ExpenseCategory]) -> str:
    return "\n".join(
        f"- {category.slug}: {category.name}"
        + (f" — {category.description}" if category.description else "")
        for category in categories
    )


def _decimal(value: Any) -> Decimal | None:
    """A money figure from whatever JSON the model produced.

    Models return numbers, numeric strings, strings with a currency sign, and
    occasionally the word "null". Anything that will not resolve to a positive
    two-place decimal becomes None, which the panel shows as a blank field for
    someone to fill in — a wrong number would be worse than an empty one.
    """
    if value is None or isinstance(value, bool):
        return None
    try:
        # Strip what a transcriber might leave on: ৳, commas, /- and spaces.
        cleaned = str(value).strip().replace(",", "").replace("৳", "").replace("/-", "")
        amount = Decimal(cleaned.strip() or "x")
    except (InvalidOperation, ValueError):
        return None
    if amount < 0 or not amount.is_finite():
        return None
    # 12 digits total is what the column holds; anything past it is a misread.
    if amount >= Decimal("10000000000"):
        return None
    return amount.quantize(Decimal("0.01"))


def _date(value: Any) -> date | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = date.fromisoformat(value.strip())
    except ValueError:
        return None
    # A bill dated years out is a misread year, not a real bill. The shop cannot
    # have a receipt from the future either, beyond a day's timezone slack.
    today = report_service.today()
    if parsed.year < 2000 or parsed > today:
        return None
    return parsed


def _text(value: Any, limit: int) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = " ".join(value.split())[:limit].strip()
    return cleaned or None


def _lines(value: Any) -> list[ReceiptLine]:
    if not isinstance(value, list):
        return []
    out: list[ReceiptLine] = []
    for row in value[:20]:
        if not isinstance(row, dict):
            continue
        description = _text(row.get("description"), 200)
        if not description:
            continue
        out.append(
            ReceiptLine(
                description=description,
                quantity=_decimal(row.get("quantity")),
                unit_price=_decimal(row.get("unit_price")),
                amount=_decimal(row.get("amount")),
            )
        )
    return out


def _warnings(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [text for item in value[:10] if (text := _text(item, 200))]


def _payload_json(content: str) -> dict[str, Any]:
    """The JSON object out of a reply that may be fenced or prefaced.

    `response_format` is asked for, but not every model on OpenRouter honours
    it, so the fence and any surrounding chatter are stripped rather than
    trusted away.
    """
    text = content.strip()
    if text.startswith("```"):
        text = text.split("```")[1] if "```" in text[3:] else text[3:]
        if text.lstrip().startswith("json"):
            text = text.lstrip()[4:]
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise BusinessRuleError(
            "The receipt reader did not return a bill. Try a clearer photograph."
        )
    try:
        parsed = json.loads(text[start : end + 1])
    except json.JSONDecodeError as error:
        raise BusinessRuleError(
            "The receipt reader's answer could not be read. Try again."
        ) from error
    if not isinstance(parsed, dict):
        raise BusinessRuleError("The receipt reader returned an unexpected answer.")
    return parsed


async def _ask(image_url: str, system: str) -> tuple[str, str]:
    """Post the photograph to OpenRouter. Returns (content, model name)."""
    payload = {
        "model": settings.OPENROUTER_VISION_MODEL,
        "max_tokens": settings.OPENROUTER_MAX_TOKENS,
        # Transcription, not writing. Sampling variety here means a different
        # total on a second read of the same photograph.
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Read this bill."},
                    {"type": "image_url", "image_url": {"url": image_url}},
                ],
            },
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=settings.OPENROUTER_TIMEOUT_SECONDS) as http:
            response = await http.post(
                f"{settings.OPENROUTER_BASE_URL.rstrip('/')}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                    "HTTP-Referer": "https://bakhoora.bd",
                    "X-Title": "Bakhoora admin",
                },
                json=payload,
            )
    except httpx.TimeoutException as error:
        raise CaptionUnavailableError(
            "Reading the receipt took too long. Try again, or a smaller photograph."
        ) from error
    except httpx.HTTPError as error:
        raise CaptionUnavailableError(
            "Could not reach the receipt reader. Check the server's connection."
        ) from error

    if response.status_code == 401:
        raise CaptionUnavailableError("OpenRouter rejected the API key.")
    if response.status_code == 402:
        raise CaptionUnavailableError("The OpenRouter account is out of credit.")
    if response.status_code == 429:
        raise CaptionUnavailableError(
            "OpenRouter is rate limiting the shop. Wait a moment and try again."
        )
    if response.status_code >= 400:
        detail = ""
        try:
            detail = (response.json().get("error") or {}).get("message", "")
        except ValueError:
            pass
        raise CaptionUnavailableError(
            f"The receipt reader failed ({response.status_code})."
            + (f" {detail}" if detail else "")
        )

    body = response.json()
    choices = body.get("choices") or []
    if not choices:
        raise BusinessRuleError("The receipt reader returned nothing. Try again.")
    content = (choices[0].get("message") or {}).get("content") or ""
    if not content.strip():
        raise BusinessRuleError("The receipt reader returned an empty answer.")
    return content, body.get("model") or settings.OPENROUTER_VISION_MODEL


def _reconcile(
    amount: Decimal | None, paid: Decimal | None, warnings: list[str]
) -> tuple[Decimal | None, Decimal | None]:
    """Keep the pair sane before it reaches a form that will not accept nonsense.

    The model is told to report the bill as written, so it can hand back a paid
    figure above the total — that is either a misread or a genuinely odd memo.
    Either way the draft drops the paid figure and says why, rather than
    arriving at a form that refuses to save with no explanation.
    """
    if amount is None or paid is None:
        return amount, paid
    if paid > amount:
        warnings.append(
            f"The bill appears to show {paid:,.2f} paid against a total of "
            f"{amount:,.2f}. Check both figures — the paid amount was left blank."
        )
        return amount, None
    return amount, paid


async def read_receipt(db: AsyncSession, file: UploadFile) -> ReceiptDraft:
    """Store the photograph, read it, and return a draft expense from it.

    The image is kept even when the reading is poor: it is the evidence behind
    whatever figure is eventually saved, and the operator is about to look at it
    beside the form. It is removed again only if the reader could not be reached
    at all, which leaves nothing to attach it to.
    """
    if not settings.OPENROUTER_API_KEY.strip():
        raise CaptionUnavailableError(
            "The receipt reader is not configured. Set OPENROUTER_API_KEY and "
            "restart the server."
        )

    # Read once: `store_image` writes these same bytes, and re-reading a drained
    # UploadFile would send the model an empty image.
    raw = await file.read()

    # Checked against the file's own leading bytes, before anything is written:
    # storing an image that cannot then be read would leave a file on disk with
    # no expense to attach it to.
    extension = extension_of(raw)
    if extension is not None and extension not in _MIME:
        raise BusinessRuleError(
            f"A {extension.upper()} photo cannot be read. Re-take it, or save it "
            f"as JPEG first — on an iPhone, Settings › Camera › Formats › Most "
            f"Compatible."
        )

    url = await asyncio.to_thread(store_image, raw, file.filename, RECEIPTS_FOLDER)
    extension = url.rsplit(".", 1)[-1]
    data_url = (
        f"data:{_MIME.get(extension, 'image/jpeg')};base64,"
        f"{base64.b64encode(raw).decode()}"
    )

    categories = await expense_service.list_categories(db, include_inactive=False)
    system = SYSTEM.format(
        today=report_service.today().isoformat(),
        categories=_categories_brief(categories) or "- other: Other",
    )

    # Anything that fails between here and a returned draft leaves nothing that
    # could ever reference this file, so it would sit in the media folder
    # forever. A draft that comes back poorly read is a different matter: the
    # operator is about to look at the photograph beside the form, so it stays.
    try:
        content, model = await _ask(data_url, system)
        data = _payload_json(content)
    except Exception:
        delete_stored(url)
        raise

    warnings = _warnings(data.get("warnings"))
    amount, paid = _reconcile(
        _decimal(data.get("amount")), _decimal(data.get("amount_paid")), warnings
    )

    slug = _text(data.get("category_slug"), 140)
    category_id: uuid.UUID | None = next(
        (category.id for category in categories if category.slug == slug), None
    )

    lines = _lines(data.get("lines"))
    # The itemisation goes in the note, where it is visible against the entry
    # without a table of its own.
    note = "\n".join(
        " · ".join(
            part
            for part in (
                line.description,
                f"{line.quantity:g}" if line.quantity is not None else None,
                f"@ {line.unit_price:,.2f}" if line.unit_price is not None else None,
                f"= {line.amount:,.2f}" if line.amount is not None else None,
            )
            if part
        )
        for line in lines
    ) or None

    description = _text(data.get("description"), 200)
    supplier = _text(data.get("supplier"), 120)
    if not description and supplier:
        description = f"Bill from {supplier}"

    confidence = data.get("confidence")
    if confidence not in {"high", "medium", "low"}:
        confidence = "low"

    if amount is None:
        warnings.append("No total could be read from this bill. Enter it by hand.")
    elif paid is None:
        # A blank "paid" saves as settled in full, so a bill whose advance was
        # not read would quietly record no due at all. The operator is looking
        # straight at the paper; say which line to check rather than let the
        # default stand unremarked.
        warnings.append(
            "How much was paid could not be read, so this will save as paid in "
            "full. Check the bill for an advance or due line."
        )
    if _date(data.get("spent_on")) is None:
        warnings.append(
            "No usable date was read, so today's date is filled in. Correct it "
            "to the date on the bill."
        )

    return ReceiptDraft(
        receipt_url=url,
        supplier=supplier,
        reference=_text(data.get("reference"), 60),
        spent_on=_date(data.get("spent_on")),
        amount=amount,
        amount_paid=paid,
        description=description,
        note=note,
        category_id=category_id,
        lines=lines,
        confidence=confidence,
        warnings=warnings,
        model=model,
    )
