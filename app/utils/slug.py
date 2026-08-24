from collections.abc import Awaitable, Callable

from slugify import slugify


async def unique_slug(
    value: str,
    exists: Callable[[str], Awaitable[bool]],
) -> str:
    """Slugify `value`, appending -2, -3 ... until `exists(slug)` is False."""
    base = slugify(value) or "item"
    candidate = base
    suffix = 2
    while await exists(candidate):
        candidate = f"{base}-{suffix}"
        suffix += 1
    return candidate
