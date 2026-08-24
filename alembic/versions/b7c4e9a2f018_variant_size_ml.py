"""variants are sized in ml

Replaces the free-text variant label with an integer `size_ml`, which becomes
the thing that makes a variant unique within a product. `name` stays as a
derived display label because order lines snapshot it. `position` goes away:
sizes sort themselves.

Revision ID: b7c4e9a2f018
Revises: a1d2c56f1cd9
Create Date: 2026-08-24 12:20:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b7c4e9a2f018'
down_revision: str | Sequence[str] | None = 'a1d2c56f1cd9'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('product_variants', sa.Column('size_ml', sa.Integer(), nullable=True))

    # Existing labels are "6ml", "250 ml", "12ML" — take the leading number.
    op.execute(
        """
        UPDATE product_variants
        SET size_ml = (substring(name from '([0-9]+)'))::int
        WHERE name ~ '[0-9]'
        """
    )
    # Inventing a size for a label we cannot read would silently corrupt prices,
    # so stop and let a human fix the row instead.
    op.execute(
        """
        DO $$
        DECLARE unparsed int;
        BEGIN
            SELECT count(*) INTO unparsed FROM product_variants WHERE size_ml IS NULL;
            IF unparsed > 0 THEN
                RAISE EXCEPTION
                    'Cannot derive size_ml for % variant(s) whose name has no number. '
                    'Set product_variants.size_ml by hand, then re-run this migration.',
                    unparsed;
            END IF;
        END $$
        """
    )

    op.alter_column('product_variants', 'size_ml', nullable=False)
    op.create_index(
        op.f('ix_product_variants_size_ml'), 'product_variants', ['size_ml'], unique=False
    )

    # Normalise the labels now that the size is authoritative.
    op.execute("UPDATE product_variants SET name = size_ml || 'ml'")

    op.drop_constraint('uq_variant_product_name', 'product_variants', type_='unique')
    op.create_unique_constraint(
        'uq_variant_product_size', 'product_variants', ['product_id', 'size_ml']
    )
    op.drop_column('product_variants', 'position')


def downgrade() -> None:
    op.add_column(
        'product_variants',
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
    )
    op.alter_column('product_variants', 'position', server_default=None)
    # Restore a stable order from the size we are about to drop.
    op.execute(
        """
        UPDATE product_variants pv
        SET position = ranked.rn - 1
        FROM (
            SELECT id, row_number() OVER (PARTITION BY product_id ORDER BY size_ml) AS rn
            FROM product_variants
        ) ranked
        WHERE pv.id = ranked.id
        """
    )
    op.drop_constraint('uq_variant_product_size', 'product_variants', type_='unique')
    op.create_unique_constraint(
        'uq_variant_product_name', 'product_variants', ['product_id', 'name']
    )
    op.drop_index(op.f('ix_product_variants_size_ml'), table_name='product_variants')
    op.drop_column('product_variants', 'size_ml')
