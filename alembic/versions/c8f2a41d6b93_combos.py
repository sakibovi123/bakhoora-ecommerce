"""combos

Three tables for the campaign itself, one for what a combo put in the box, and
two columns that let an existing basket and an existing order carry one.

The shape follows from a combo holding *products* rather than sizes. `combos`
is the campaign, `combo_items` is which perfumes are in it, and `combo_sizes`
is what is actually buyable: the whole bundle at one bottle size, at one flat
price. A combo has no stock column anywhere — what can be sold is worked out
from the component variants when it is asked for, which is what stops a bundle
and its oils keeping two different sets of books on the same bottles.

`combo_items.product_id` is RESTRICT rather than CASCADE. Deleting an oil a
live campaign is built on must not quietly turn a five-oil bundle into a
four-oil one that keeps selling at the five-oil price; product_service asks
first and names the combos instead.

`cart_items.variant_id` becomes nullable so a line can be a combo instead, with
a CHECK that exactly one of the two is set. Postgres treats NULLs as distinct
in a unique index, so the existing uq_cart_item_variant and the new
uq_cart_item_combo_size coexist without either one catching the other's rows.

`order_item_components` is the part that matters operationally. A combo line
has no variant of its own, so without these snapshotted rows a cancellation
could not tell which bottles to put back — and reading the combo's *current*
contents instead would restock whatever the campaign holds today rather than
what actually went out of the door.

The permission backfill is modelled on d5a2b81c4f39. MENUS gained a `combos`
key, a role with no row for a menu is denied it, and seed.py only grants the
full set at the moment it creates a role — so without this every existing staff
role, the administrator included, would be locked out of a page it owns. The
grant mirrors each role's `products` row, because a combo is catalogue work:
whoever may price a perfume may price a bundle of them.

Revision ID: c8f2a41d6b93
Revises: b9d3f47a2e18
Create Date: 2026-09-11 10:30:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c8f2a41d6b93'
down_revision: str | Sequence[str] | None = 'b9d3f47a2e18'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
    ]


def upgrade() -> None:
    op.create_table(
        "combos",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(220), nullable=False, unique=True),
        sa.Column("tagline", sa.String(300)),
        sa.Column("description", sa.Text()),
        sa.Column("use_case", sa.String(120)),
        sa.Column("occasion", sa.String(300)),
        sa.Column("image_url", sa.String(500)),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_featured", sa.Boolean(), nullable=False, server_default=sa.false()),
        *_timestamps(),
    )
    op.create_index("ix_combos_name", "combos", ["name"])
    op.create_index("ix_combos_slug", "combos", ["slug"])
    op.create_index("ix_combos_is_active", "combos", ["is_active"])

    op.create_table(
        "combo_items",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column("combo_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("product_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        *_timestamps(),
        sa.ForeignKeyConstraint(["combo_id"], ["combos.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("combo_id", "product_id", name="uq_combo_item_product"),
    )
    op.create_index("ix_combo_items_combo_id", "combo_items", ["combo_id"])
    op.create_index("ix_combo_items_product_id", "combo_items", ["product_id"])

    op.create_table(
        "combo_sizes",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column("combo_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("size_ml", sa.Integer(), nullable=False),
        sa.Column("sku", sa.String(64), nullable=False, unique=True),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        *_timestamps(),
        sa.ForeignKeyConstraint(["combo_id"], ["combos.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("combo_id", "size_ml", name="uq_combo_size_ml"),
    )
    op.create_index("ix_combo_sizes_combo_id", "combo_sizes", ["combo_id"])
    op.create_index("ix_combo_sizes_size_ml", "combo_sizes", ["size_ml"])
    op.create_index("ix_combo_sizes_sku", "combo_sizes", ["sku"])

    # --- an order line can now be a combo ----------------------------------
    op.add_column("order_items", sa.Column("combo_id", sa.UUID(as_uuid=True)))
    op.create_foreign_key(
        "fk_order_items_combo_id", "order_items", "combos", ["combo_id"], ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_order_items_combo_id", "order_items", ["combo_id"])

    op.create_table(
        "order_item_components",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column("order_item_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("variant_id", sa.UUID(as_uuid=True)),
        sa.Column("product_name", sa.String(200), nullable=False),
        sa.Column("variant_name", sa.String(80), nullable=False),
        sa.Column("sku", sa.String(64), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        *_timestamps(),
        sa.ForeignKeyConstraint(["order_item_id"], ["order_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["variant_id"], ["product_variants.id"], ondelete="SET NULL"),
    )
    op.create_index(
        "ix_order_item_components_order_item_id", "order_item_components", ["order_item_id"]
    )
    op.create_index(
        "ix_order_item_components_variant_id", "order_item_components", ["variant_id"]
    )

    # --- a basket line can now be a combo ----------------------------------
    op.add_column("cart_items", sa.Column("combo_size_id", sa.UUID(as_uuid=True)))
    op.create_foreign_key(
        "fk_cart_items_combo_size_id", "cart_items", "combo_sizes", ["combo_size_id"], ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_cart_items_combo_size_id", "cart_items", ["combo_size_id"])
    op.alter_column("cart_items", "variant_id", existing_type=sa.UUID(), nullable=True)
    op.create_unique_constraint(
        "uq_cart_item_combo_size", "cart_items", ["cart_id", "combo_size_id"]
    )
    op.create_check_constraint(
        "ck_cart_item_one_kind",
        "cart_items",
        "(variant_id IS NULL) <> (combo_size_id IS NULL)",
    )

    # --- let the people who run the catalogue run the campaigns -------------
    op.execute(
        sa.text(
            """
            INSERT INTO role_permissions (id, role_id, menu, can_view, can_manage,
                                          created_at, updated_at)
            SELECT gen_random_uuid(), p.role_id, 'combos', p.can_view, p.can_manage,
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
    op.execute(sa.text("DELETE FROM role_permissions WHERE menu = 'combos'"))

    # Basket lines that hold a combo have nothing to fall back to once the
    # column goes, and the NOT NULL below would refuse them. They are throwaway
    # state — an un-checked-out basket — so they go with it.
    op.execute(sa.text("DELETE FROM cart_items WHERE combo_size_id IS NOT NULL"))
    op.drop_constraint("ck_cart_item_one_kind", "cart_items", type_="check")
    op.drop_constraint("uq_cart_item_combo_size", "cart_items", type_="unique")
    op.alter_column("cart_items", "variant_id", existing_type=sa.UUID(), nullable=False)
    op.drop_index("ix_cart_items_combo_size_id", table_name="cart_items")
    op.drop_constraint("fk_cart_items_combo_size_id", "cart_items", type_="foreignkey")
    op.drop_column("cart_items", "combo_size_id")

    op.drop_index("ix_order_item_components_variant_id", table_name="order_item_components")
    op.drop_index("ix_order_item_components_order_item_id", table_name="order_item_components")
    op.drop_table("order_item_components")

    op.drop_index("ix_order_items_combo_id", table_name="order_items")
    op.drop_constraint("fk_order_items_combo_id", "order_items", type_="foreignkey")
    op.drop_column("order_items", "combo_id")

    op.drop_index("ix_combo_sizes_sku", table_name="combo_sizes")
    op.drop_index("ix_combo_sizes_size_ml", table_name="combo_sizes")
    op.drop_index("ix_combo_sizes_combo_id", table_name="combo_sizes")
    op.drop_table("combo_sizes")

    op.drop_index("ix_combo_items_product_id", table_name="combo_items")
    op.drop_index("ix_combo_items_combo_id", table_name="combo_items")
    op.drop_table("combo_items")

    op.drop_index("ix_combos_is_active", table_name="combos")
    op.drop_index("ix_combos_slug", table_name="combos")
    op.drop_index("ix_combos_name", table_name="combos")
    op.drop_table("combos")
