"""Storing uploaded product images.

Local disk today. Everything the rest of the app touches goes through
`save_image` / `delete_stored`, so swapping in Supabase Storage or S3 later is a
matter of reimplementing those two functions.
"""

import uuid
from pathlib import Path

from fastapi import UploadFile

from app.core.config import settings
from app.core.exceptions import BusinessRuleError

# Content type is whatever the client claims, so the file is identified by its
# own leading bytes instead.
_SIGNATURES: tuple[tuple[bytes, int, str], ...] = (
    (b"\xff\xd8\xff", 0, "jpg"),
    (b"\x89PNG\r\n\x1a\n", 0, "png"),
    (b"GIF87a", 0, "gif"),
    (b"GIF89a", 0, "gif"),
    (b"RIFF", 0, "webp"),      # confirmed against "WEBP" at offset 8 below
    (b"ftypavif", 4, "avif"),
    (b"ftypheic", 4, "heic"),
)

READABLE_TYPES = "JPEG, PNG, WebP, GIF, AVIF or HEIC"


def _extension(head: bytes) -> str | None:
    for magic, offset, ext in _SIGNATURES:
        if head[offset : offset + len(magic)] != magic:
            continue
        if ext == "webp" and head[8:12] != b"WEBP":
            continue
        return ext
    return None


def media_root() -> Path:
    root = Path(settings.MEDIA_ROOT) / "products"
    root.mkdir(parents=True, exist_ok=True)
    return root


async def save_image(file: UploadFile) -> str:
    """Validate and store one upload. Returns the URL to serve it from."""
    payload = await file.read()

    if not payload:
        raise BusinessRuleError(f"'{file.filename or 'file'}' is empty")
    if len(payload) > settings.MAX_IMAGE_BYTES:
        limit = settings.MAX_IMAGE_BYTES // (1024 * 1024)
        raise BusinessRuleError(
            f"'{file.filename or 'file'}' is larger than {limit}MB"
        )

    extension = _extension(payload[:16])
    if extension is None:
        raise BusinessRuleError(
            f"'{file.filename or 'file'}' is not an image the shop can use. "
            f"Accepted: {READABLE_TYPES}."
        )

    # Never reuse the client's filename: it may collide, contain a path, or
    # carry an extension that disagrees with the actual bytes.
    name = f"{uuid.uuid4().hex}.{extension}"
    (media_root() / name).write_bytes(payload)
    return f"{settings.MEDIA_URL}/products/{name}"


def delete_stored(url: str) -> None:
    """Remove a file this module wrote. Ignores anything it did not."""
    prefix = f"{settings.MEDIA_URL}/products/"
    if not url.startswith(prefix):
        return
    name = url[len(prefix) :]
    # Defend the storage root against a crafted row in the database.
    if "/" in name or "\\" in name or name in {"", ".", ".."}:
        return
    (media_root() / name).unlink(missing_ok=True)
