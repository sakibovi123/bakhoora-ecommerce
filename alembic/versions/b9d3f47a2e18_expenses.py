"""expenses

Two tables and a permission backfill.

`expense_categories` is maintained by the shop; `expenses` holds one row per
payment made. `expenses.spent_on` is a bare DATE rather than a timestamp: it is
the day the money left, asserted by whoever typed it in, and is routinely not
the day the row was created. It is also already shop-local, so unlike
`orders.created_at` it needs no timezone conversion to bucket in a report.

`category_id` is NOT NULL with ondelete RESTRICT. A product without a category
still lists and still sells, but an expense without one is a hole in the report,
so a category in use cannot be deleted — it gets turned off instead.

The backfill is the part that matters operationally: MENUS gained an `expenses`
key, a role with no `role_permissions` row for a menu is denied it, and seed.py
only grants the full set at the moment it creates a role. Without this every
existing staff role — the administrator included — would be locked out of a page
it is meant to own. Modelled on d5a2b81c4f39.

Revision ID: b9d3f47a2e18
Revises: a8e5f21c9b74
Create Date: 2026-08-28 09:40:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b9d3f47a2e18'
down_revision: str | Sequence[str] | None = 'a8e5f21c9b74'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "expense_categories",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("slug", sa.String(140), nullable=False, unique=True),
        sa.Column("description", sa.Text()),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
    )
    op.create_index("ix_expense_categories_slug", "expense_categories", ["slug"])

    op.create_table(
        "expenses",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column("spent_on", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("description", sa.String(200), nullable=False),
        sa.Column("note", sa.Text()),
        sa.Column(
            "category_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("expense_categories.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
    )
    op.create_index("ix_expenses_spent_on", "expenses", ["spent_on"])
    op.create_index("ix_expenses_category_id", "expenses", ["category_id"])
    # The report filters on the date and groups by category; the list screen
    # filters on both. Mirrors ix_orders_created_at_status.
    op.create_index(
        "ix_expenses_spent_on_category", "expenses", ["spent_on", "category_id"]
    )

    # Whoever can already see the dashboard gets the same on expenses, and
    # whoever can manage it can manage these. gen_random_uuid() is core Postgres
    # from 13 on, so no extension is needed.
    op.execute(
        sa.text(
            """
            INSERT INTO role_permissions (id, role_id, menu, can_view, can_manage,
                                          created_at, updated_at)
            SELECT gen_random_uuid(), p.role_id, 'expenses', p.can_view, p.can_manage,
                   now(), now()
              FROM role_permissions p
              JOIN roles r ON r.id = p.role_id
             WHERE p.menu = 'dashboard'
               AND r.is_staff
            ON CONFLICT ON CONSTRAINT uq_role_permission_menu DO NOTHING
            """
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM role_permissions WHERE menu = 'expenses'"))
    op.drop_table("expenses")
    op.drop_table("expense_categories")
