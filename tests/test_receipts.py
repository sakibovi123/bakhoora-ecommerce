"""Reading a photographed supplier bill into a draft expense.

The model call itself is stubbed throughout — what is worth pinning is not that
OpenRouter answers, but what happens to the answer once it arrives. A vision
model transcribing Bengali numerals off a creased cash memo returns numbers as
strings, strings with currency signs, dates it guessed, and occasionally a paid
figure larger than the total. None of that may reach the database, and none of
it may reach a form as a silent blank either — an operator who cannot tell that
a figure was dropped will not know to type it back in.
"""

import io
import json
from datetime import timedelta
from decimal import Decimal

import pytest

from app.core.config import settings
from app.core.exceptions import BusinessRuleError
from app.services import receipt_service, report_service
from tests.conftest import auth

# A 1x1 PNG. `store_image` identifies uploads by their leading bytes, so the
# test file has to be a real one — a text file named .png is rejected, correctly.
PNG = bytes.fromhex(
    "89504e470d0a1a0a"                          # signature
    "0000000d4948445200000001000000010806000000" "1f15c489"   # IHDR, 1x1 RGBA
    "0000000a49444154789c6300010000050001" "0d0a2db4"         # IDAT
    "0000000049454e44" "ae426082"                             # IEND
)


def _upload(payload: bytes = PNG, name: str = "memo.png"):
    return {"file": (name, io.BytesIO(payload), "image/png")}


async def _category(client, admin_token, name="Packaging"):
    response = await client.post(
        "/api/v1/admin/expense-categories",
        headers=auth(admin_token),
        json={"name": name},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _stub(monkeypatch, payload: dict | str, model: str = "test/vision"):
    """Answer the next reading with this, without touching the network.

    The key is set too: `read_receipt` refuses before it calls anything when
    OPENROUTER_API_KEY is blank, which is the right behaviour and exactly what
    `.env.dev` has. Without this every test here would pass its assertions
    against a 503 instead of a draft.
    """
    monkeypatch.setattr(settings, "OPENROUTER_API_KEY", "sk-test-not-a-real-key")
    content = payload if isinstance(payload, str) else json.dumps(payload)

    async def fake_ask(image_url: str, system: str) -> tuple[str, str]:
        # The photograph really does have to reach the call as an inline data
        # URL: a local /media path would be unreachable from the provider.
        assert image_url.startswith("data:image/"), image_url
        return content, model

    monkeypatch.setattr(receipt_service, "_ask", fake_ask)


# --- reading the figures off the reply ---------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (7000, Decimal("7000.00")),
        ("7000", Decimal("7000.00")),
        ("7,000", Decimal("7000.00")),          # thousands separator
        ("৳7000", Decimal("7000.00")),          # taka sign
        ("5000/-", Decimal("5000.00")),         # how a memo writes it
        ("  2000.5 ", Decimal("2000.50")),
        (None, None),
        ("null", None),
        ("", None),
        ("two thousand", None),                 # words are not a figure
        (-5, None),                             # a bill is never negative
        (True, None),                           # JSON true is not 1 taka
        ("1e400", None),                        # would not fit the column
    ],
)
def test_money_is_read_or_refused_never_guessed(raw, expected):
    assert receipt_service._decimal(raw) == expected


def test_a_date_beyond_the_bill_is_refused():
    today = report_service.today()
    assert receipt_service._date(str(today)) == today
    # A misread year is far more likely than a bill from the future.
    assert receipt_service._date(str(today + timedelta(days=2))) is None
    assert receipt_service._date("1998-01-01") is None
    assert receipt_service._date("20/2/26") is None
    assert receipt_service._date(None) is None


def test_a_fenced_reply_is_still_read():
    """Not every model on OpenRouter honours response_format."""
    parsed = receipt_service._payload_json('```json\n{"amount": "7000"}\n```')
    assert parsed == {"amount": "7000"}
    assert receipt_service._payload_json('Here it is: {"amount": 1} — hope that helps')


def test_a_reply_with_no_object_in_it_is_an_error():
    with pytest.raises(BusinessRuleError):
        receipt_service._payload_json("I could not read that image.")


def test_paid_above_the_total_is_dropped_and_explained():
    """Either figure could be the misread one, so neither is quietly preferred.

    Keeping the paid figure would produce a negative due; silently clamping it
    to the total would invent a settled bill. The draft drops it and says why,
    so the form opens with one blank field rather than a wrong one.
    """
    warnings: list[str] = []
    amount, paid = receipt_service._reconcile(
        Decimal("100.00"), Decimal("150.00"), warnings
    )
    assert (amount, paid) == (Decimal("100.00"), None)
    assert warnings and "150.00" in warnings[0] and "100.00" in warnings[0]


# --- the endpoint ------------------------------------------------------------


async def test_a_memo_comes_back_as_a_draft_and_saves_nothing(
    client, admin_token, monkeypatch
):
    """The Printing Touch memo, as the model would report it."""
    category = await _category(client, admin_token)
    today = report_service.today()
    _stub(
        monkeypatch,
        {
            "supplier": "Printing Touch",
            "reference": "579",
            "spent_on": str(today),
            "amount": "7,000",
            "amount_paid": "2000",
            "description": "200 boxes",
            "category_slug": category["slug"],
            "lines": [
                {"description": "BOX", "quantity": 200, "unit_price": None,
                 "amount": "7000"}
            ],
            "confidence": "medium",
            "warnings": ["The date is handwritten in Bengali numerals."],
        },
    )

    response = await client.post(
        "/api/v1/admin/expenses/read-receipt",
        headers=auth(admin_token),
        files=_upload(),
    )
    assert response.status_code == 200, response.text
    draft = response.json()

    assert draft["supplier"] == "Printing Touch"
    assert draft["reference"] == "579"
    assert draft["amount"] == "7000.00"
    assert draft["amount_paid"] == "2000.00"
    assert draft["category_id"] == category["id"]
    assert draft["confidence"] == "medium"
    assert draft["warnings"] == ["The date is handwritten in Bengali numerals."]
    # The itemisation is carried into the note, where it stays visible against
    # the entry without a table of its own.
    assert "BOX" in draft["note"]
    # The photograph is kept: it is the evidence behind whatever is saved.
    assert draft["receipt_url"].startswith("/media/receipts/")

    # And nothing has been written. This is the whole point of the review step.
    listed = await client.get("/api/v1/admin/expenses", headers=auth(admin_token))
    assert listed.json()["total"] == 0


async def test_the_draft_becomes_an_expense_that_keeps_the_photograph(
    client, admin_token, monkeypatch
):
    category = await _category(client, admin_token)
    _stub(
        monkeypatch,
        {
            "supplier": "Printing Touch",
            "reference": "579",
            "spent_on": str(report_service.today()),
            "amount": "7000",
            "amount_paid": "2000",
            "description": "200 boxes",
            "category_slug": category["slug"],
            "confidence": "medium",
            "warnings": [],
        },
    )
    draft = (
        await client.post(
            "/api/v1/admin/expenses/read-receipt",
            headers=auth(admin_token),
            files=_upload(),
        )
    ).json()

    # What the panel sends once a person has looked at it.
    created = await client.post(
        "/api/v1/admin/expenses",
        headers=auth(admin_token),
        json={
            "spent_on": draft["spent_on"],
            "amount": draft["amount"],
            "amount_paid": draft["amount_paid"],
            "description": draft["description"],
            "supplier": draft["supplier"],
            "reference": draft["reference"],
            "receipt_url": draft["receipt_url"],
            "category_id": draft["category_id"],
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["amount_due"] == "5000.00"
    assert body["receipt_url"] == draft["receipt_url"]

    # And it reaches the report, which is the point of recording it at all.
    today = report_service.today()
    report = (
        await client.get(
            f"/api/v1/admin/reports/daily?start={today}&end={today}",
            headers=auth(admin_token),
        )
    ).json()
    assert report["summary"]["expenses"] == "7000.00"
    assert report["summary"]["outstanding"] == "5000.00"


async def test_an_unreadable_total_still_returns_a_usable_draft(
    client, admin_token, monkeypatch
):
    """A blank field with a warning beats a plausible invention."""
    await _category(client, admin_token)
    _stub(
        monkeypatch,
        {
            "supplier": "Printing Touch",
            "amount": None,
            "amount_paid": None,
            "spent_on": None,
            "description": None,
            "category_slug": None,
            "confidence": "low",
            "warnings": [],
        },
    )

    draft = (
        await client.post(
            "/api/v1/admin/expenses/read-receipt",
            headers=auth(admin_token),
            files=_upload(),
        )
    ).json()

    assert draft["amount"] is None
    assert draft["spent_on"] is None
    # The operator is told both, rather than left to notice the empty boxes.
    assert any("total" in warning for warning in draft["warnings"])
    assert any("date" in warning for warning in draft["warnings"])
    # With no description read, the supplier is enough to name the entry.
    assert draft["description"] == "Bill from Printing Touch"


async def test_an_unknown_category_is_left_for_the_operator(
    client, admin_token, monkeypatch
):
    await _category(client, admin_token)
    _stub(
        monkeypatch,
        {
            "amount": "500",
            "spent_on": str(report_service.today()),
            "description": "Something",
            "category_slug": "a-category-that-does-not-exist",
            "confidence": "high",
            "warnings": [],
        },
    )
    draft = (
        await client.post(
            "/api/v1/admin/expenses/read-receipt",
            headers=auth(admin_token),
            files=_upload(),
        )
    ).json()
    # Null, not the first category in the list: a wrong category is filed away
    # silently, while a blank one stops the form from saving.
    assert draft["category_id"] is None


async def test_a_file_that_is_not_an_image_is_refused(client, admin_token, monkeypatch):
    _stub(monkeypatch, {"amount": "1"})
    response = await client.post(
        "/api/v1/admin/expenses/read-receipt",
        headers=auth(admin_token),
        files={"file": ("notes.png", io.BytesIO(b"this is not a png"), "image/png")},
    )
    # Identified by its leading bytes, not by what the upload claimed to be.
    assert response.status_code == 422


async def test_reading_a_receipt_needs_permission_to_manage_expenses(
    client, customer_token
):
    """It spends OpenRouter credit, so it is not a read-only action."""
    path = "/api/v1/admin/expenses/read-receipt"
    assert (await client.post(path, files=_upload())).status_code == 401
    assert (
        await client.post(path, headers=auth(customer_token), files=_upload())
    ).status_code == 403


async def test_a_format_no_vision_model_reads_is_refused_before_it_is_stored(
    client, admin_token, monkeypatch
):
    """HEIC is a real upload: it is what an iPhone stores by default.

    `store_image` accepts it — product photography can be HEIC — but no provider
    will read one, so it is refused here with the setting to change rather than
    stored and then failed on by OpenRouter.
    """
    _stub(monkeypatch, {"amount": "1"})
    heic = b"\x00\x00\x00\x18ftypheic" + b"\x00" * 32

    response = await client.post(
        "/api/v1/admin/expenses/read-receipt",
        headers=auth(admin_token),
        files={"file": ("IMG_0001.heic", io.BytesIO(heic), "image/heic")},
    )
    assert response.status_code == 422
    assert "Most Compatible" in response.json()["error"]["message"]


async def test_a_total_without_a_paid_figure_is_flagged_not_assumed_settled(
    client, admin_token, monkeypatch
):
    """A blank paid field saves as settled in full — so say so before it does.

    This is the quiet failure the review step exists for: the total is right,
    the form looks complete, and a due the shop actually owes never gets
    recorded because one line of the memo was unreadable.
    """
    await _category(client, admin_token)
    _stub(
        monkeypatch,
        {
            "amount": "7000",
            "amount_paid": None,
            "spent_on": str(report_service.today()),
            "description": "200 boxes",
            "category_slug": "packaging",
            "confidence": "low",
            "warnings": [],
        },
    )
    draft = (
        await client.post(
            "/api/v1/admin/expenses/read-receipt",
            headers=auth(admin_token),
            files=_upload(),
        )
    ).json()

    assert draft["amount"] == "7000.00"
    assert draft["amount_paid"] is None
    assert any("paid in full" in warning for warning in draft["warnings"])
