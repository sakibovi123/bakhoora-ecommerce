"""buying prices, and price changes that wait for approval

Three things at once, because they are one feature:

`product_variants.cost_price` is what the shop pays for a bottle. Nullable, not
defaulted to zero: it is genuinely unknown for everything bought before it was
recorded, and a 0.00 there would claim the stock was free and report a 100%
margin on it. It is deliberately absent from `VariantOut`, which is the schema
`GET /products` serves to the storefront.

`price_reviews` and `price_review_lines` hold a batch of proposed changes and
what every figure was before it. Nothing on `product_variants` moves until a
review is approved, which is also what makes the history readable afterwards:
who moved the Creed to 780, when, and what it was before.

The `pricing` menu is granted to every staff role that can already see
products — a role with no row for a menu is denied it, and seed.py only grants
the full set at the moment it first creates the admin role, so without this
backfill the administrator would be locked out of a menu they own.

Revision ID: e1a7c95f2d84
Revises: d9e4b71a3c52
Create Date: 2026-09-14 12:10:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e1a7c95f2d84'
down_revision: str | Sequence[str] | None = 'd9e4b71a3c52'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "product_variants", sa.Column("cost_price", sa.Numeric(12, 2), nullable=True)
    )

    op.create_table(
        "price_reviews",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("reference", sa.String(32), nullable=False),
        # native_enum=False: a VARCHAR with a CHECK, so adding a status later is
        # an ordinary migration rather than an ALTER TYPE.
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("note", sa.Text()),
        sa.Column(
            "proposed_by_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
        sa.Column(
            "reviewed_by_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.Column("review_note", sa.Text()),
    )
    op.create_index("ix_price_reviews_reference", "price_reviews", ["reference"], unique=True)
    op.create_index("ix_price_reviews_status", "price_reviews", ["status"])
    op.create_index(
        "ix_price_reviews_status_created", "price_reviews", ["status", "created_at"]
    )
    op.create_index("ix_price_reviews_proposed_by_id", "price_reviews", ["proposed_by_id"])
    op.create_index("ix_price_reviews_reviewed_by_id", "price_reviews", ["reviewed_by_id"])

    op.create_table(
        "price_review_lines",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column(
            "review_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("price_reviews.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # SET NULL, not CASCADE: a variant deleted between proposal and approval
        # leaves a line that can still be read but no longer applied.
        sa.Column(
            "variant_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("product_variants.id", ondelete="SET NULL"),
        ),
        sa.Column("product_name", sa.String(200), nullable=False),
        sa.Column("variant_name", sa.String(80), nullable=False),
        sa.Column("sku", sa.String(64), nullable=False),
        sa.Column("size_ml", sa.Integer(), nullable=False),
        sa.Column("from_cost", sa.Numeric(12, 2)),
        sa.Column("from_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("to_cost", sa.Numeric(12, 2)),
        sa.Column("to_price", sa.Numeric(12, 2), nullable=False),
    )
    op.create_index("ix_price_review_lines_review_id", "price_review_lines", ["review_id"])
    op.create_index("ix_price_review_lines_variant_id", "price_review_lines", ["variant_id"])

    # Same shape as the reports-menu backfill: whoever can see products can see
    # pricing, and manage follows manage.
    op.execute(
        sa.text(
            """
            INSERT INTO role_permissions (id, role_id, menu, can_view, can_manage,
                                          created_at, updated_at)
            SELECT gen_random_uuid(), p.role_id, 'pricing', p.can_view, p.can_manage,
                   now(), now()
              FROM role_permissions p
              JOIN roles r ON r.id = p.role_id
             WHERE p.menu = 'products'
               AND r.is_staff
            ON CONFLICT ON CONSTRAINT uq_role_permission_menu DO NOTHING
            """
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM role_permissions WHERE menu = 'pricing'"))
    op.drop_table("price_review_lines")
    op.drop_table("price_reviews")
    op.drop_column("product_variants", "cost_price")
