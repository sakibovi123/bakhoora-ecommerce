"""Cache invalidation driven by the ORM, not by call sites.

The alternative is a `cache.invalidate(...)` line after every `db.commit()` in
the service layer. There are roughly fifteen of those and the failure mode of
forgetting one is silent: an endpoint keeps serving data that changed. Here the
session reports which mapped classes it wrote, and the namespaces follow from
that, so a new write path is covered the day it is written.

It also gets a coupling right that is easy to miss by hand. Checkout and
restock adjust `ProductVariant.stock_quantity`, and `VariantOut` exposes both
`stock_quantity` and `in_stock` — so placing an order has to invalidate the
*product* cache, not just the order cache. Because the variant rows are dirty
in the same flush, that happens without anyone remembering it.

Invalidation is deferred to `after_commit`: a flush that later rolls back must
not clear anything, and dropping entries early only costs a needless refill.
"""

from itertools import chain

from sqlalchemy import event
from sqlalchemy.orm import Session

from app.core.cache import (
    CATEGORIES,
    ORDERS,
    PRODUCTS,
    REPORTS,
    REPORTS_ARCHIVE,
    SETTINGS,
    cache,
)
from app.models.category import Category
from app.models.expense import Expense, ExpenseCategory
from app.models.order import Order, OrderItem
from app.models.payment import Payment
from app.models.product import Product, ProductImage, ProductVariant
from app.models.settings import ShopSettings

_SESSION_KEY = "pending_cache_namespaces"

# A category's slug and active flag are both filters on the product list, and
# deleting one moves products, so category writes clear the product cache too.
NAMESPACES: dict[type, frozenset[str]] = {
    Category: frozenset({CATEGORIES, PRODUCTS}),
    Product: frozenset({PRODUCTS}),
    ProductVariant: frozenset({PRODUCTS}),
    ProductImage: frozenset({PRODUCTS}),
    # REPORTS, not REPORTS_ARCHIVE: an order lands in the range it was placed
    # in, so a range that has already closed cannot gain one, and the archive is
    # left to expire on its TTL. See app/core/cache.py.
    Order: frozenset({ORDERS, REPORTS}),
    OrderItem: frozenset({ORDERS, REPORTS}),
    Payment: frozenset({ORDERS, REPORTS}),
    # Expenses break that rule, so they clear both shelves. Typing up last
    # Tuesday's receipt on Friday is the normal case rather than the exception,
    # and it changes a closed month — leaving the archive to expire would mean
    # the operator entering a figure and not seeing it for fifteen minutes, on
    # the one screen they use to check their own data entry. The archive exists
    # to stop a stream of checkouts discarding expensive historical reports;
    # expense writes are a handful of manual actions a day, so clearing it costs
    # one rebuild. Renaming a category relabels every cached breakdown, so it
    # counts too.
    Expense: frozenset({REPORTS, REPORTS_ARCHIVE}),
    ExpenseCategory: frozenset({REPORTS, REPORTS_ARCHIVE}),
    # The delivery charge is part of every cart total the storefront quotes and
    # the currency is on every price it prints, so a settings write clears the
    # product and category caches too rather than only its own.
    ShopSettings: frozenset({SETTINGS, PRODUCTS, CATEGORIES}),
}


def namespaces_for(instances) -> set[str]:
    dirty: set[str] = set()
    for instance in instances:
        dirty |= NAMESPACES.get(type(instance), frozenset())
    return dirty


@event.listens_for(Session, "after_flush")
def _collect(session: Session, flush_context) -> None:
    """Record what this flush touched. Reading it here is required — by
    `after_commit` the identity sets are already empty."""
    touched = namespaces_for(chain(session.new, session.dirty, session.deleted))
    if touched:
        session.info.setdefault(_SESSION_KEY, set()).update(touched)


@event.listens_for(Session, "after_commit")
def _invalidate(session: Session) -> None:
    pending = session.info.pop(_SESSION_KEY, None)
    if pending:
        cache.invalidate(*pending)


@event.listens_for(Session, "after_rollback")
def _discard(session: Session) -> None:
    session.info.pop(_SESSION_KEY, None)
