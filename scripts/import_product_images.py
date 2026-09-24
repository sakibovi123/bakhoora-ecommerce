"""Attach a folder of product photos to the matching products.

Either layout works, and they can be mixed:

    photos/Dior Sauvage.jpg            one file per product, named after it
    photos/dior-sauvage-2.png          a trailing number adds a further image
    photos/Dior Sauvage/front.jpg      a subfolder per product, any file names

Names are matched loosely (case, spaces, dashes and punctuation are ignored, and
the product slug works too). Anything that does not match exactly, or would go
over the per-product limit, is reported and left alone.

    uv run python -m scripts.import_product_images ~/Downloads/photos          # dry run
    uv run python -m scripts.import_product_images ~/Downloads/photos --apply

Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, so the images land in shared
storage rather than on this disk.
"""

import asyncio
import re
import sys
from collections import defaultdict
from difflib import get_close_matches
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.db.session import build_engine
from app.models.product import Product, ProductImage
from app.utils.uploads import PRODUCTS_FOLDER, delete_stored, extension_of, store_image

SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".heic"}


def _key(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


def _stem_key(path: Path) -> str:
    # "dior-sauvage-2" and "Dior Sauvage (2)" both belong to Dior Sauvage.
    stem = re.sub(r"[\s_\-()]*\d{1,2}\)?$", "", path.stem)
    return _key(stem)


def _collect(root: Path) -> dict[str, list[Path]]:
    found: dict[str, list[Path]] = defaultdict(list)
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in SUFFIXES:
            continue
        key = _key(path.parent.name) if path.parent != root else _stem_key(path)
        found[key].append(path)
    return found


async def main(root: Path, apply: bool) -> None:
    if not root.is_dir():
        sys.exit(f"Not a folder: {root}")
    if apply and not settings.uses_object_storage:
        sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.")

    engine = build_engine(settings.direct_url, poolclass=NullPool)
    session = async_sessionmaker(engine, expire_on_commit=False)
    async with session() as db:
        products = (await db.execute(select(Product))).scalars().all()
        counts = dict(
            (
                await db.execute(
                    select(ProductImage.product_id, func.count()).group_by(ProductImage.product_id)
                )
            ).all()
        )

        by_key: dict[str, Product] = {}
        for product in products:
            by_key[_key(product.name)] = product
            by_key[_key(product.slug)] = product

        for key, files in _collect(root).items():
            product = by_key.get(key)
            if product is None:
                # Only a hint: "Hawas Fire" is close to "Hawas Ice" and is a
                # different perfume, so a near miss is never attached. Rename
                # the file if the suggestion is right.
                close = get_close_matches(key, by_key, n=1, cutoff=0.6)
                hint = f" (did you mean {by_key[close[0]].name}?)" if close else ""
                print(f"? no product for: {', '.join(f.name for f in files)}{hint}")
                continue

            used = counts.get(product.id, 0)
            room = settings.MAX_PRODUCT_IMAGES - used
            if len(files) > room:
                skipped = files[room:]
                files = files[:room]
                print(f"! {product.name}: only {room} slot(s) free, skipping "
                      f"{', '.join(f.name for f in skipped)}")
            if not files:
                continue

            if not apply:
                print(f"  {product.name}: would add {', '.join(f.name for f in files)}")
                counts[product.id] = used + len(files)
                continue

            stored: list[str] = []
            try:
                for path in files:
                    payload = path.read_bytes()
                    if extension_of(payload[:16]) is None:
                        print(f"! {path.name}: not a readable image, skipped")
                        continue
                    stored.append(store_image(payload, path.name, PRODUCTS_FOLDER))
                for index, url in enumerate(stored):
                    db.add(
                        ProductImage(
                            product_id=product.id,
                            url=url,
                            alt_text=product.name,
                            position=used + index,
                            is_primary=used == 0 and index == 0,
                        )
                    )
                await db.commit()
            except Exception:
                await db.rollback()
                for url in stored:
                    delete_stored(url)
                raise
            counts[product.id] = used + len(stored)
            print(f"+ {product.name}: added {len(stored)}")

        missing = [p.name for p in products if not counts.get(p.id)]
        if missing:
            print(f"\nStill without images: {', '.join(missing)}")
    await engine.dispose()
    if not apply:
        print("\nDry run. Re-run with --apply to upload and attach.")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--apply"]
    if len(args) != 1:
        sys.exit(__doc__)
    asyncio.run(main(Path(args[0]).expanduser(), "--apply" in sys.argv))
