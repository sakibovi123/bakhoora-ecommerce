"""shop settings

Three things at once, because they are one feature:

  * `shop_settings` — the single row behind the panel's Settings page.
  * `orders.advance_required` — what the shop asked for up front, snapshotted
    onto the order like every other money column, so changing the rule later
    cannot make historical orders retrospectively underpaid.
  * a `settings` grant for existing staff roles. MENUS gained a key, and a role
    with no row for a menu is denied it, so without this backfill the
    administrator would be locked out of a page they are meant to own —
    seed.py only grants the full set at the moment it creates the role.

The settings row itself is not inserted here. `settings_service.get` creates it
on first read, seeded from config.py, which keeps one definition of the
defaults instead of a second copy in SQL that would drift.

Revision ID: a8e5f21c9b74
Revises: f7c1e4b83d52
Create Date: 2026-08-27 15:20:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a8e5f21c9b74'
down_revision: str | Sequence[str] | None = 'f7c1e4b83d52'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "shop_settings",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column("site_title", sa.String(120), nullable=False, server_default="Bakhoora"),
        sa.Column("tagline", sa.String(200)),
        sa.Column("logo_url", sa.String(500)),
        sa.Column("favicon_url", sa.String(500)),
        sa.Column("currency_code", sa.String(3), nullable=False, server_default="BDT"),
        sa.Column("currency_symbol", sa.String(8), nullable=False, server_default="৳"),
        sa.Column(
            "delivery_charge", sa.Numeric(12, 2), nullable=False, server_default="70.00"
        ),
        sa.Column("free_delivery_threshold", sa.Numeric(12, 2)),
        # native_enum=False on the model, so this is a VARCHAR with a check
        # constraint rather than a Postgres ENUM type — adding a mode later is
        # then a code change, not a migration that locks the table.
        sa.Column(
            "advance_mode",
            sa.String(16),
            nullable=False,
            server_default="none",
        ),
        sa.Column("advance_amount", sa.Numeric(12, 2), nullable=False, server_default="0.00"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
    )

    op.add_column(
        "orders",
        sa.Column(
            "advance_required",
            sa.Numeric(12, 2),
            nullable=False,
            server_default="0.00",
        ),
    )

    op.execute(
        sa.text(
            """
            INSERT INTO role_permissions (id, role_id, menu, can_view, can_manage,
                                          created_at, updated_at)
            SELECT gen_random_uuid(), p.role_id, 'settings', p.can_view, p.can_manage,
                   now(), now()
              FROM role_permissions p
              JOIN roles r ON r.id = p.role_id
             WHERE p.menu = 'roles'
               AND r.is_staff
            ON CONFLICT ON CONSTRAINT uq_role_permission_menu DO NOTHING
            """
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM role_permissions WHERE menu = 'settings'"))
    op.drop_column("orders", "advance_required")
    op.drop_table("shop_settings")
