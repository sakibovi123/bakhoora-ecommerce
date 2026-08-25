"""A small in-process read cache for list endpoints.

Deliberately not Redis. The API talks to Supabase over the public internet, so
a list query costs a round trip measured in tens of milliseconds; serving a
repeated one from local memory removes that entirely without adding a service
to run, deploy and monitor. What that trades away is stated plainly:

  * Each uvicorn worker holds its own copy. With N workers a write invalidates
    one worker's view immediately and the other N-1 within CACHE_TTL_* seconds.
    That is why the TTLs are short — they are the backstop for cross-worker
    staleness, not the primary invalidation mechanism.
  * Nothing survives a restart, which is fine for data this cheap to rebuild.

`get_or_set` is the whole interface, so swapping the store for Redis later is a
change to this module and nothing else. Values are stored already serialised to
JSON-safe primitives, which is both what a Redis backend would require and what
keeps ORM objects — bound to a database session that ends with the request —
from ever entering the cache.
"""

import asyncio
import hashlib
import json
import time
from collections import OrderedDict
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from app.core.config import settings

# Namespaces. Invalidation works on a whole namespace: the alternative is
# tracking which of the ~200 possible filter combinations a given product
# appears in, which is far more code and gets it wrong quietly.
CATEGORIES = "categories"
PRODUCTS = "products"
ORDERS = "orders"


def make_key(*parts: Any, **kwargs: Any) -> str:
    """A stable key for a set of query parameters.

    Sorted JSON rather than str(dict) or hash(): dict ordering and Python's
    per-process hash randomisation both make keys that differ between requests
    that should share an entry.
    """
    payload = json.dumps([parts, sorted(kwargs.items())], sort_keys=True, default=str)
    return hashlib.blake2b(payload.encode(), digest_size=16).hexdigest()


@dataclass
class _Entry:
    value: Any
    expires_at: float


@dataclass
class Stats:
    hits: int = 0
    misses: int = 0
    evictions: int = 0
    invalidations: int = 0

    @property
    def hit_rate(self) -> float:
        total = self.hits + self.misses
        return self.hits / total if total else 0.0

    def as_dict(self) -> dict[str, float | int]:
        return {
            "hits": self.hits,
            "misses": self.misses,
            "evictions": self.evictions,
            "invalidations": self.invalidations,
            "hit_rate": round(self.hit_rate, 4),
        }


@dataclass
class TTLCache:
    max_entries: int = 512
    _store: dict[str, OrderedDict[str, _Entry]] = field(default_factory=dict)
    _locks: dict[tuple[str, str], asyncio.Lock] = field(default_factory=dict)
    stats: Stats = field(default_factory=Stats)

    # --- internals ---------------------------------------------------------

    def _bucket(self, namespace: str) -> OrderedDict[str, _Entry]:
        return self._store.setdefault(namespace, OrderedDict())

    def _evict_if_needed(self, bucket: OrderedDict[str, _Entry]) -> None:
        while len(bucket) > self.max_entries:
            bucket.popitem(last=False)  # oldest use first
            self.stats.evictions += 1

    def _peek(self, namespace: str, key: str) -> tuple[bool, Any]:
        bucket = self._bucket(namespace)
        entry = bucket.get(key)
        if entry is None:
            return False, None
        if entry.expires_at <= time.monotonic():
            # Expired entries are dropped on read; there is no sweeper thread,
            # and the LRU bound stops forgotten keys accumulating.
            del bucket[key]
            return False, None
        bucket.move_to_end(key)
        return True, entry.value

    # --- public ------------------------------------------------------------

    def get(self, namespace: str, key: str) -> tuple[bool, Any]:
        return self._peek(namespace, key)

    def set(self, namespace: str, key: str, value: Any, ttl: float) -> None:
        bucket = self._bucket(namespace)
        bucket[key] = _Entry(value=value, expires_at=time.monotonic() + ttl)
        bucket.move_to_end(key)
        self._evict_if_needed(bucket)

    async def get_or_set(
        self,
        namespace: str,
        key: str,
        factory: Callable[[], Awaitable[Any]],
        ttl: float,
    ) -> Any:
        """Return the cached value, or await `factory()` and store the result.

        Concurrent misses on the same key wait on one another instead of all
        querying: a cold cache under load is exactly when the database can
        least afford N identical queries.
        """
        if not settings.CACHE_ENABLED or ttl <= 0:
            return await factory()

        found, value = self._peek(namespace, key)
        if found:
            self.stats.hits += 1
            return value

        lock = self._locks.setdefault((namespace, key), asyncio.Lock())
        async with lock:
            # A second look: whoever held the lock has just filled this in.
            found, value = self._peek(namespace, key)
            if found:
                self.stats.hits += 1
                return value

            self.stats.misses += 1
            try:
                value = await factory()
                self.set(namespace, key, value, ttl)
            finally:
                # Only the holder clears it, and only while holding it, so a
                # waiter never drops a lock another task is queued on.
                self._locks.pop((namespace, key), None)
        return value

    def invalidate(self, *namespaces: str) -> int:
        """Drop every entry in these namespaces. Returns how many went.

        Synchronous on purpose: it is called from inside service functions
        right after a commit, and making it awaitable would add an await point
        between the write landing and the cache reflecting it.
        """
        dropped = 0
        for namespace in namespaces:
            bucket = self._store.get(namespace)
            if bucket:
                dropped += len(bucket)
                bucket.clear()
        if dropped:
            self.stats.invalidations += 1
        return dropped

    def clear(self) -> None:
        self._store.clear()
        self._locks.clear()
        self.stats = Stats()

    def size(self, namespace: str | None = None) -> int:
        if namespace is not None:
            return len(self._store.get(namespace, ()))
        return sum(len(bucket) for bucket in self._store.values())


cache = TTLCache(max_entries=settings.CACHE_MAX_ENTRIES)


def invalidate(*namespaces: str) -> int:
    """Module-level shortcut so call sites read as `cache.invalidate(PRODUCTS)`
    without each one importing the instance."""
    return cache.invalidate(*namespaces)
