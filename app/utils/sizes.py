"""Bottle sizes.

A perfume is sold by volume, so the size *is* the variation. Every product is
created carrying the four standard sizes; anything larger or one-off (a 50ml
spray, a 250ml mist) is added afterwards through the add-variant endpoint.
"""

DEFAULT_VARIANT_SIZES_ML: tuple[int, ...] = (6, 10, 15, 30)

MIN_SIZE_ML = 1
MAX_SIZE_ML = 10_000


def size_label(size_ml: int) -> str:
    """Display label. Stored on the variant and snapshotted onto order lines."""
    return f"{size_ml}ml"


def size_list(sizes: tuple[int, ...] | list[int]) -> str:
    """Human-readable list for validation messages."""
    return ", ".join(size_label(size) for size in sizes)


def combo_size_label(count: int, size_ml: int) -> str:
    """`5 × 6ml` — the label a combo line carries onto an invoice.

    Stored nowhere: a combo's contents can be edited, so the label is derived
    when it is shown and snapshotted onto the order line at checkout.
    """
    return f"{count} × {size_label(size_ml)}"
