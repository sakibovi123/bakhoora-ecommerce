"""Move files uploaded to local disk into Supabase Storage.

Rows written before uploads went to object storage hold `/media/...` paths that
only resolve on the machine that received the upload. For every such row whose
file is on this disk, this uploads the file and rewrites the row to its public
URL, so every environment sharing the database can show it.

    uv run python -m scripts.migrate_media_to_storage          # dry run
    uv run python -m scripts.migrate_media_to_storage --apply

Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Safe to re-run: rows already
pointing at storage no longer match.
"""

import asyncio
import sys
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.db.session import build_engine
from app.utils.uploads import _upload_object, extension_of

COLUMNS = (
    ("product_images", "url"),
    ("categories", "image_url"),
    ("combos", "image_url"),
    ("order_items", "image_url"),
    ("expenses", "receipt_url"),
    ("shop_settings", "logo_url"),
    ("shop_settings", "favicon_url"),
)


async def main(apply: bool) -> None:
    if not settings.uses_object_storage:
        sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.")

    prefix = f"{settings.MEDIA_URL}/"
    uploaded: dict[str, str] = {}
    engine = build_engine(settings.direct_url, poolclass=NullPool)
    async with engine.begin() as conn:
        for table, column in COLUMNS:
            rows = await conn.execute(
                text(f"select distinct {column} from {table} where {column} like :p"),
                {"p": f"{prefix}%"},
            )
            for (old,) in rows:
                key = old[len(prefix) :]
                path = Path(settings.MEDIA_ROOT) / key
                if not path.is_file():
                    print(f"  missing on this disk, skipped: {table}.{column} {old}")
                    continue
                if not apply:
                    print(f"  would move: {table}.{column} {old}")
                    continue
                if old not in uploaded:
                    payload = path.read_bytes()
                    uploaded[old] = _upload_object(key, payload, extension_of(payload[:16]))
                await conn.execute(
                    text(f"update {table} set {column} = :new where {column} = :old"),
                    {"new": uploaded[old], "old": old},
                )
                print(f"  moved: {table}.{column} {old} -> {uploaded[old]}")
    await engine.dispose()
    if not apply:
        print("Dry run. Re-run with --apply to upload and rewrite.")


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
