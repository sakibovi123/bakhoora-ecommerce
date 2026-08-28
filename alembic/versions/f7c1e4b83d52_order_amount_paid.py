"""track part-payments: orders.amount_paid

A shop that takes 100 taka of delivery charge at the counter and collects the
other 900 on delivery had nowhere to record the split: `payment_status` was a
flag with no figure behind it, so a part-paid order had to be filed as either
unpaid or paid and the due lived in someone's head.

`amount_paid` is a column rather than a sum over `payments` because that table
also holds provider intents — a bKash instruction is written for the full total
before any money moves — so summing it would count takings the shop never had.

Backfill reads the flag that was there: orders already marked paid have had
their total collected, everything else has had nothing. That is the only
reading of the old data that is true, and it leaves no order claiming money it
cannot account for.

Revision ID: f7c1e4b83d52
Revises: e6b3d92a7c14
Create Date: 2026-08-27 11:20:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f7c1e4b83d52'
down_revision: str | Sequence[str] | None = 'e6b3d92a7c14'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # server_default fills the existing rows without rewriting the table twice;
    # it stays on the column so a plain INSERT that predates the model change
    # cannot write a NULL into it.
    op.add_column(
        "orders",
        sa.Column(
            "amount_paid",
            sa.Numeric(12, 2),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.execute(
        """
        UPDATE orders
           SET amount_paid = total
         WHERE payment_status = 'paid'
        """
    )


def downgrade() -> None:
    op.drop_column("orders", "amount_paid")
