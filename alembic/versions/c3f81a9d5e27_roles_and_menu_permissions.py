"""roles and menu permissions

Replaces the two-value `users.role` enum with a `roles` table plus a per-menu
permission grid. "Customer" and "Administrator" are seeded as system roles and
every existing account is moved onto the matching one before the enum is
dropped, so nobody is stranded without a role.

Revision ID: c3f81a9d5e27
Revises: b7c4e9a2f018
Create Date: 2026-08-24 14:10:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c3f81a9d5e27'
down_revision: str | Sequence[str] | None = 'b7c4e9a2f018'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Kept as a literal rather than imported from app.utils.menus: a migration has
# to keep describing the world as it was the day it was written.
MENUS = ("dashboard", "orders", "products", "categories", "customers", "roles")


def upgrade() -> None:
    op.create_table(
        'roles',
        sa.Column('name', sa.String(length=80), nullable=False),
        sa.Column('slug', sa.String(length=80), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_staff', sa.Boolean(), nullable=False),
        sa.Column('is_system', sa.Boolean(), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column(
            'created_at', sa.DateTime(timezone=True),
            server_default=sa.text('now()'), nullable=False,
        ),
        sa.Column(
            'updated_at', sa.DateTime(timezone=True),
            server_default=sa.text('now()'), nullable=False,
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )
    op.create_index(op.f('ix_roles_slug'), 'roles', ['slug'], unique=True)

    op.create_table(
        'role_permissions',
        sa.Column('role_id', sa.UUID(), nullable=False),
        sa.Column('menu', sa.String(length=40), nullable=False),
        sa.Column('can_view', sa.Boolean(), nullable=False),
        sa.Column('can_manage', sa.Boolean(), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column(
            'created_at', sa.DateTime(timezone=True),
            server_default=sa.text('now()'), nullable=False,
        ),
        sa.Column(
            'updated_at', sa.DateTime(timezone=True),
            server_default=sa.text('now()'), nullable=False,
        ),
        sa.ForeignKeyConstraint(['role_id'], ['roles.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('role_id', 'menu', name='uq_role_permission_menu'),
    )
    op.create_index(op.f('ix_role_permissions_role_id'), 'role_permissions', ['role_id'])

    # --- seed the two system roles ---
    op.execute(
        """
        INSERT INTO roles (id, name, slug, description, is_staff, is_system)
        VALUES
          (gen_random_uuid(), 'Customer', 'customer',
           'Shops on the storefront. No access to the admin panel.', false, true),
          (gen_random_uuid(), 'Administrator', 'admin',
           'Full access to every menu in the admin panel.', true, true)
        """
    )
    # Administrator gets every menu, view and manage.
    op.execute(
        """
        INSERT INTO role_permissions (id, role_id, menu, can_view, can_manage)
        SELECT gen_random_uuid(), r.id, m.menu, true, true
        FROM roles r
        CROSS JOIN (VALUES {}) AS m(menu)
        WHERE r.slug = 'admin'
        """.format(", ".join(f"('{menu}')" for menu in MENUS))
    )

    # --- move every account onto a role ---
    op.add_column('users', sa.Column('role_id', sa.UUID(), nullable=True))
    op.execute(
        """
        UPDATE users u
        SET role_id = r.id
        FROM roles r
        WHERE r.slug = CASE WHEN u.role = 'admin' THEN 'admin' ELSE 'customer' END
        """
    )
    # Leaving anyone role-less would lock them out on their next request.
    op.execute(
        """
        DO $$
        DECLARE stranded int;
        BEGIN
            SELECT count(*) INTO stranded FROM users WHERE role_id IS NULL;
            IF stranded > 0 THEN
                RAISE EXCEPTION 'Could not assign a role to % user(s)', stranded;
            END IF;
        END $$
        """
    )

    op.alter_column('users', 'role_id', nullable=False)
    op.create_index(op.f('ix_users_role_id'), 'users', ['role_id'])
    op.create_foreign_key(
        'fk_users_role_id_roles', 'users', 'roles', ['role_id'], ['id'], ondelete='RESTRICT'
    )
    op.drop_column('users', 'role')


def downgrade() -> None:
    op.add_column(
        'users',
        sa.Column('role', sa.String(length=20), nullable=False, server_default='customer'),
    )
    op.execute(
        """
        UPDATE users u
        SET role = CASE WHEN r.is_staff THEN 'admin' ELSE 'customer' END
        FROM roles r
        WHERE r.id = u.role_id
        """
    )
    op.alter_column('users', 'role', server_default=None)
    op.drop_constraint('fk_users_role_id_roles', 'users', type_='foreignkey')
    op.drop_index(op.f('ix_users_role_id'), table_name='users')
    op.drop_column('users', 'role_id')
    op.drop_index(op.f('ix_role_permissions_role_id'), table_name='role_permissions')
    op.drop_table('role_permissions')
    op.drop_index(op.f('ix_roles_slug'), table_name='roles')
    op.drop_table('roles')
