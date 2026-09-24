"""Storing uploaded product images.

Supabase Storage when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set, local
disk otherwise. Everything the rest of the app touches goes through
`save_image` / `delete_stored`.

Object storage is what makes an upload visible everywhere: the database is
shared between local and production, but a server's disk is not, so a
`/media/...` path written on one machine is a 404 on every other one. Stored
objects are recorded by their absolute public URL for the same reason.
"""

import asyncio
import uuid
from pathlib import Path
from typing import NamedTuple

import httpx
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


def extension_of(head: bytes) -> str | None:
    """The file's kind, from its own leading bytes. None if unrecognised.

    Public because a caller may need to refuse a format *before* storing it —
    the receipt reader accepts a narrower set than this module does, since no
    vision model reads AVIF or HEIC.
    """
    for magic, offset, ext in _SIGNATURES:
        if head[offset : offset + len(magic)] != magic:
            continue
        if ext == "webp" and head[8:12] != b"WEBP":
            continue
        return ext
    return None


# Uploads are filed by what they are. Branding is a handful of files that live
# as long as the shop does; product images churn. Keeping them apart means
# `delete_stored` can never be talked into removing a logo by way of a product
# image row, and a future move to object storage can treat them differently.
PRODUCTS_FOLDER = "products"
BRANDING_FOLDER = "branding"
# Photographed supplier bills. Kept apart from product imagery because these are
# the shop's own books rather than anything a customer sees.
#
# Worth knowing: `main.py` mounts the whole media root as StaticFiles, so a
# receipt is reachable by anyone holding its URL — the protection is that the
# filename is a random UUID and appears nowhere but the admin panel, the same
# footing product images are on. That is deliberate for now (an <img> in the
# panel cannot send a bearer token), and the folder is separate so a private
# bucket or a signed-URL route can be put in front of just these later.
RECEIPTS_FOLDER = "receipts"
_FOLDERS = frozenset({PRODUCTS_FOLDER, BRANDING_FOLDER, RECEIPTS_FOLDER})


def media_root(folder: str = PRODUCTS_FOLDER) -> Path:
    if folder not in _FOLDERS:
        raise ValueError(f"Unknown media folder: {folder!r}")
    root = Path(settings.MEDIA_ROOT) / folder
    root.mkdir(parents=True, exist_ok=True)
    return root


async def save_image(file: UploadFile, folder: str = PRODUCTS_FOLDER) -> str:
    """Validate and store one upload. Returns the URL to serve it from."""
    # Off the event loop: with object storage this is a network round trip.
    return await asyncio.to_thread(store_image, await file.read(), file.filename, folder)


def store_image(payload: bytes, filename: str | None, folder: str = PRODUCTS_FOLDER) -> str:
    """The half of `save_image` that works on bytes already in hand.

    Split out for the receipt reader, which has to send the same bytes to the
    vision model as it writes to disk. `UploadFile.read()` drains the stream, so
    a caller that needs the payload twice cannot go through `save_image` — and
    re-reading would silently store an empty file rather than fail.
    """
    file = _Named(filename)

    if not payload:
        raise BusinessRuleError(f"'{file.filename or 'file'}' is empty")
    if len(payload) > settings.MAX_IMAGE_BYTES:
        limit = settings.MAX_IMAGE_BYTES // (1024 * 1024)
        raise BusinessRuleError(
            f"'{file.filename or 'file'}' is larger than {limit}MB"
        )

    extension = extension_of(payload[:16])
    if extension is None:
        raise BusinessRuleError(
            f"'{file.filename or 'file'}' is not an image the shop can use. "
            f"Accepted: {READABLE_TYPES}."
        )

    # Never reuse the client's filename: it may collide, contain a path, or
    # carry an extension that disagrees with the actual bytes.
    name = f"{uuid.uuid4().hex}.{extension}"
    if settings.uses_object_storage:
        return _upload_object(f"{folder}/{name}", payload, extension)
    (media_root(folder) / name).write_bytes(payload)
    return f"{settings.MEDIA_URL}/{folder}/{name}"


_CONTENT_TYPES = {
    "jpg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
    "avif": "image/avif",
    "heic": "image/heic",
}


def _storage_api() -> str:
    return f"{settings.SUPABASE_URL.rstrip('/')}/storage/v1"


def public_url(key: str) -> str:
    """Where a stored object is served from. The bucket must be public."""
    return f"{_storage_api()}/object/public/{settings.MEDIA_BUCKET}/{key}"


def _headers() -> dict[str, str]:
    key = settings.SUPABASE_SERVICE_ROLE_KEY
    return {"Authorization": f"Bearer {key}", "apikey": key}


def _upload_object(key: str, payload: bytes, extension: str) -> str:
    response = httpx.post(
        f"{_storage_api()}/object/{settings.MEDIA_BUCKET}/{key}",
        content=payload,
        headers={
            **_headers(),
            "Content-Type": _CONTENT_TYPES[extension],
            # Names are random and never rewritten, so the file never changes.
            "Cache-Control": "max-age=31536000",
        },
        timeout=30,
    )
    if response.is_error:
        raise BusinessRuleError(
            f"The image could not be stored ({response.status_code}): {response.text[:200]}"
        )
    return public_url(key)


class _Named(NamedTuple):
    """Just enough of an UploadFile to keep the messages above unchanged."""

    filename: str | None


def delete_stored(url: str) -> None:
    """Remove a file this module wrote. Ignores anything it did not."""
    for folder in _FOLDERS:
        local_prefix = f"{settings.MEDIA_URL}/{folder}/"
        object_prefix = public_url(f"{folder}/") if settings.SUPABASE_URL.strip() else None
        if url.startswith(local_prefix):
            name = url[len(local_prefix) :]
        elif object_prefix and url.startswith(object_prefix):
            name = url[len(object_prefix) :]
        else:
            continue
        # Defend the storage root against a crafted row in the database.
        if "/" in name or "\\" in name or name in {"", ".", ".."}:
            return
        if url.startswith(local_prefix):
            (media_root(folder) / name).unlink(missing_ok=True)
        elif settings.uses_object_storage:
            # Best effort, like the local unlink: an orphaned object costs a
            # few KB, failing the request that removed its row costs more.
            try:
                httpx.request(
                    "DELETE",
                    f"{_storage_api()}/object/{settings.MEDIA_BUCKET}",
                    json={"prefixes": [f"{folder}/{name}"]},
                    headers=_headers(),
                    timeout=15,
                )
            except httpx.HTTPError:
                pass
        return
