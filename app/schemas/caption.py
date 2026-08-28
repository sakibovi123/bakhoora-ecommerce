import uuid
from typing import Literal

from pydantic import BaseModel, Field

Platform = Literal["reel", "facebook", "instagram", "whatsapp"]

PLATFORMS: dict[Platform, str] = {
    "reel": "a short-form video reel (Instagram Reels / Facebook Reels)",
    "facebook": "a Facebook feed post",
    "instagram": "an Instagram feed post",
    "whatsapp": "a WhatsApp Business broadcast",
}


class CaptionMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class CaptionRequest(BaseModel):
    # The whole visible conversation, resent each turn — the endpoint keeps no
    # server-side state, so the panel owns the thread.
    messages: list[CaptionMessage] = Field(min_length=1, max_length=30)
    platform: Platform = "reel"
    # When set, the real listing is read from the database and put in the
    # system prompt, so prices and sizes in a caption are the ones on the site.
    product_id: uuid.UUID | None = None


class CaptionReply(BaseModel):
    content: str
    model: str
