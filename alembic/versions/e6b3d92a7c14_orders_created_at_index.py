"""index for sales report range scans

Every sales report filters `orders` on a `created_at` window, and until now
there was no index to filter it with: a one-day report read the whole table.
`status` is the second column because the money aggregates count only the
revenue statuses, so a composite lets the range scan discard pending and
cancelled rows without a heap fetch. A leading-column-only lookup still works,
which is why no separate `created_at` index is added alongside it.

Built CONCURRENTLY inside an autocommit block: `orders` is written on every
checkout and a plain CREATE INDEX would hold those off for the duration.
Concurrent builds cannot run inside a transaction, hence the block.

Revision ID: e6b3d92a7c14
Revises: d5a2b81c4f39
Create Date: 2026-08-26 12:30:00.000000

"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e6b3d92a7c14'
down_revision: str | Sequence[str] | None = 'd5a2b81c4f39'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INDEX = "ix_orders_created_at_status"


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.create_index(
            INDEX,
            "orders",
            ["created_at", "status"],
            unique=False,
            postgresql_concurrently=True,
            if_not_exists=True,
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.drop_index(
            INDEX,
            table_name="orders",
            postgresql_concurrently=True,
            if_exists=True,
        )
