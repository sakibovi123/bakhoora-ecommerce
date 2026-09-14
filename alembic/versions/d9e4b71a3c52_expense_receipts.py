"""bills, not just amounts: expenses gain paid/due, supplier and a receipt photo

The shop pays suppliers in parts. The Printing Touch memo behind this change
reads Total 7,000 / Advance 2,000 / Due 5,000, and an expense table with a
single `amount` could record only one of the three — so either the report
undercounted the cost or the shop lost track of what it still owed.

`amount` keeps its meaning: the full cost, which is what the month is charged
for. `amount_paid` is the cash that has actually moved. The due is derived from
the pair rather than stored, so the three can never disagree.

`supplier`, `reference` and `receipt_url` exist so a figure can be traced back
to the paper it came off — the last one is also how the panel knows an entry was
read from a photograph rather than typed.

Backfill assumes every expense already recorded was paid in full, which is the
only reading of the old data that is true: there was nowhere to record a due, so
nobody was recording one.

Revision ID: d9e4b71a3c52
Revises: c8f2a41d6b93
Create Date: 2026-09-14 10:30:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd9e4b71a3c52'
down_revision: str | Sequence[str] | None = 'c8f2a41d6b93'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # server_default fills existing rows in place rather than rewriting the
    # table twice, and stays on the column so an INSERT written against the old
    # shape cannot put a NULL there.
    op.add_column(
        "expenses",
        sa.Column(
            "amount_paid",
            sa.Numeric(12, 2),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column("expenses", sa.Column("supplier", sa.String(120), nullable=True))
    op.add_column("expenses", sa.Column("reference", sa.String(60), nullable=True))
    op.add_column("expenses", sa.Column("receipt_url", sa.String(500), nullable=True))

    # Everything already on the books predates any way of recording a due, so
    # it was entered as money that had gone.
    op.execute("UPDATE expenses SET amount_paid = amount")

    # The "what do I still owe" figure scans for rows where the two disagree,
    # which is a small minority of the table — a partial index keeps that off a
    # sequential scan without carrying the fully-paid majority.
    op.create_index(
        "ix_expenses_outstanding",
        "expenses",
        ["spent_on"],
        postgresql_where=sa.text("amount_paid < amount"),
    )


def downgrade() -> None:
    op.drop_index("ix_expenses_outstanding", table_name="expenses")
    op.drop_column("expenses", "receipt_url")
    op.drop_column("expenses", "reference")
    op.drop_column("expenses", "supplier")
    op.drop_column("expenses", "amount_paid")
