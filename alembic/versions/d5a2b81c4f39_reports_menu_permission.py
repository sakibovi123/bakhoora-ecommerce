"""reports menu permission

`reports` joins MENUS, and a role with no row for a menu is denied it. Without
this backfill every existing staff role — the administrator included — would be
locked out of a menu they are meant to own, because seed.py only grants the
full menu set at the moment it creates the admin role, not on a later run.

So every staff role that can already see the dashboard gets the same grant on
reports; takings are takings. `can_manage` stays false throughout: there is
nothing to manage in a report, and the routes only ever ask for ReportsViewer.

Revision ID: d5a2b81c4f39
Revises: c3f81a9d5e27
Create Date: 2026-08-26 10:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd5a2b81c4f39'
down_revision: str | Sequence[str] | None = 'c3f81a9d5e27'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # gen_random_uuid() is core Postgres from 13 on, so no extension needed.
    op.execute(
        sa.text(
            """
            INSERT INTO role_permissions (id, role_id, menu, can_view, can_manage,
                                          created_at, updated_at)
            SELECT gen_random_uuid(), p.role_id, 'reports', p.can_view, false,
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
    op.execute(sa.text("DELETE FROM role_permissions WHERE menu = 'reports'"))
