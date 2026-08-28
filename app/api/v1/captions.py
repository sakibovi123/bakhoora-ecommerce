from fastapi import APIRouter
from pydantic import BaseModel

from app.api.deps import AdminUser, DbSession
from app.core.config import settings
from app.schemas.caption import CaptionReply, CaptionRequest
from app.services import caption_service

router = APIRouter(prefix="/admin/captions", tags=["captions"])


class CaptionProduct(BaseModel):
    id: str
    label: str


class CaptionStatus(BaseModel):
    configured: bool
    model: str


@router.get("/status", response_model=CaptionStatus)
async def caption_status(_: AdminUser) -> CaptionStatus:
    """So the panel can hide the assistant rather than offer a broken button."""
    return CaptionStatus(
        configured=bool(settings.OPENROUTER_API_KEY.strip()),
        model=settings.OPENROUTER_MODEL,
    )


@router.get("/products", response_model=list[CaptionProduct])
async def caption_products(db: DbSession, _: AdminUser) -> list[CaptionProduct]:
    rows = await caption_service.product_options(db)
    return [CaptionProduct(id=str(pid), label=label) for pid, label in rows]


# Any staff account, rather than a menu of its own. This spends money, so it is
# not open to customers — but it is a writing tool rather than a part of the
# shop's records, and adding a menu would mean a role migration for something
# nobody would sensibly grant separately.
@router.post("/chat", response_model=CaptionReply)
async def caption_chat(data: CaptionRequest, db: DbSession, _: AdminUser) -> CaptionReply:
    return await caption_service.generate(db, data)
