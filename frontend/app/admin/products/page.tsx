"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { useToast } from "@/components/admin/toast";
import {
  Button,
  Cell,
  Empty,
  ErrorNote,
  Input,
  LinkButton,
  PageHeader,
  Pagination,
  Panel,
  Pill,
  Row,
  SearchInput,
  Spinner,
  Table,
} from "@/components/admin/ui";
import { Dropdown } from "@/components/admin/dropdown";
import { Require } from "@/components/admin/require";
import {
  IconClose,
  IconFilter,
  IconPlus,
  IconSave,
  IconSpinner,
  IconStock,
} from "@/components/admin/icons";
import { ApiError, adminApi } from "@/lib/admin/client";
import { money } from "@/lib/admin/format";
import { useAuth } from "@/lib/auth";
import type { Product } from "@/lib/admin/types";
import { useResource } from "@/lib/admin/use-resource";

type ActiveFilter = "" | "true" | "false";

export default function ProductsPage() {
  return (
    <Require menu="products">
      <ProductsScreen />
    </Require>
  );
}

function ProductsScreen() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<ActiveFilter>("");
  const [lowStock, setLowStock] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(
    (token: string) =>
      adminApi.products(token, {
        page,
        size: 20,
        search: query || null,
        active: active === "" ? null : active === "true",
        low_stock: lowStock,
        sort: "name",
      }),
    [page, query, active, lowStock],
  );
  const { data, error, loading, reload } = useResource(load, [page, query, active, lowStock]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        subtitle={data ? `${data.total} in the catalogue` : "Loading…"}
        actions={
          <LinkButton href="/admin/products/new" tone="primary">
            <IconPlus />
            New product
          </LinkButton>
        }
      />

      <Panel tone="amber" bodyClassName="p-0">
        <form
          className="flex flex-wrap items-center gap-3 border-b border-line p-4"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setQuery(search.trim());
          }}
        >
          <div className="w-full min-w-0 sm:min-w-52 sm:flex-1">
            <SearchInput
              placeholder="Search by name or brand…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search products"
            />
          </div>
          <IconFilter className="hidden text-muted sm:block" />
          <Dropdown
            className="w-full sm:w-40"
            aria-label="Filter by visibility"
            value={active}
            onChange={(next) => {
              setPage(1);
              setActive(next as ActiveFilter);
            }}
            options={[
              { value: "", label: "All products" },
              { value: "true", label: "Live only" },
              { value: "false", label: "Hidden only" },
            ]}
          />
          <label className="flex min-h-11 items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={lowStock}
              onChange={(event) => {
                setPage(1);
                setLowStock(event.target.checked);
              }}
              className="size-4 accent-[var(--color-ink)]"
            />
            Low stock
          </label>
          <button
            type="submit"
            className="label min-h-11 border border-line bg-paper px-4 py-2 text-[0.6875rem] hover:bg-paper-2"
          >
            Search
          </button>
        </form>

        {error ? (
          <div className="p-5">
            <ErrorNote message={error} onRetry={reload} />
          </div>
        ) : loading && !data ? (
          <div className="px-5">
            <Spinner label="Loading products" />
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="p-5">
            <Empty
              title="Nothing here"
              body={
                query || active || lowStock
                  ? "No product matches that filter."
                  : "Add your first perfume to get started."
              }
              action={
                <LinkButton href="/admin/products/new">
                  <IconPlus />
                  New product
                </LinkButton>
              }
            />
          </div>
        ) : (
          <>
            <Table head={["Product", "Category", "Sizes", "Price", "Stock", "State", ""]}>
              {data.items.map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  open={openId === product.id}
                  onToggle={() => setOpenId(openId === product.id ? null : product.id)}
                  onSaved={reload}
                />
              ))}
            </Table>
            <Pagination
              page={data.page}
              pages={data.pages}
              total={data.total}
              noun="product"
              onPage={setPage}
            />
          </>
        )}
      </Panel>
    </div>
  );
}

function ProductRow({
  product,
  open,
  onToggle,
  onSaved,
}: {
  product: Product;
  open: boolean;
  onToggle: () => void;
  onSaved: () => void;
}) {
  const totalStock = product.variants.reduce((sum, v) => sum + v.stock_quantity, 0);
  const priceLabel =
    product.price_from === product.price_to
      ? money(product.price_from)
      : `${money(product.price_from)} – ${money(product.price_to)}`;

  return (
    <>
      <Row>
        <Cell>
          <Link href={`/admin/products/${product.id}`} className="link-underline font-medium text-ink">
            {product.name}
          </Link>
          {product.brand ? <p className="text-xs text-muted">{product.brand}</p> : null}
        </Cell>
        <Cell className="text-muted">{product.category?.name ?? "—"}</Cell>
        <Cell className="text-muted [font-variant-numeric:tabular-nums]">
          {product.variants.length}
        </Cell>
        <Cell className="whitespace-nowrap [font-variant-numeric:tabular-nums]">{priceLabel}</Cell>
        <Cell className="text-right">
          <span
            className={`[font-variant-numeric:tabular-nums] ${
              totalStock === 0 ? "text-accent" : "text-ink"
            }`}
          >
            {totalStock}
          </span>
        </Cell>
        <Cell>
          {product.is_active ? (
            <Pill tone="bg-[var(--color-green-deep)] text-paper">Live</Pill>
          ) : (
            <Pill tone="bg-paper-2 text-muted">Hidden</Pill>
          )}
        </Cell>
        <Cell className="text-right">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="label flex items-center gap-1.5 whitespace-nowrap text-muted hover:text-ink"
          >
            {open ? <IconClose /> : <IconStock />}
            {open ? "Close" : "Stock"}
          </button>
        </Cell>
      </Row>
      {open ? (
        <tr className="border-b border-line bg-paper-2/50">
          <Cell colSpan={7} className="px-4 py-4">
            <StockEditor product={product} onSaved={onSaved} />
          </Cell>
        </tr>
      ) : null}
    </>
  );
}

function StockEditor({ product, onSaved }: { product: Product; onSaved: () => void }) {
  const { token } = useAuth();
  const { notify } = useToast();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(product.variants.map((v) => [v.id, String(v.stock_quantity)])),
  );
  const [saving, setSaving] = useState(false);

  const changed = product.variants.filter(
    (variant) => Number(values[variant.id]) !== variant.stock_quantity,
  );

  async function save() {
    if (!token || changed.length === 0) return;
    setSaving(true);
    try {
      await adminApi.setStock(
        token,
        changed.map((variant) => ({
          variant_id: variant.id,
          stock_quantity: Math.max(0, Number(values[variant.id]) || 0),
        })),
      );
      notify(`Stock updated for ${changed.length} size${changed.length === 1 ? "" : "s"}`);
      onSaved();
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : "Could not save stock", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p className="label mb-3 flex items-center gap-2 text-muted">
        <IconStock />
        Stock on hand
      </p>
      <div className="grid grid-cols-3 items-end gap-3 sm:flex sm:flex-wrap sm:gap-4">
        {product.variants.map((variant) => (
          <label key={variant.id} className="flex flex-col gap-1 sm:w-24">
            <span className="text-xs text-muted">
              {variant.name}
              {variant.is_active ? "" : " (off)"}
            </span>
            <Input
              type="number"
              min={0}
              value={values[variant.id] ?? ""}
              onChange={(event) =>
                setValues((current) => ({ ...current, [variant.id]: event.target.value }))
              }
              aria-label={`Stock for ${variant.name}`}
            />
          </label>
        ))}
        <Button
          onClick={save}
          disabled={changed.length === 0 || saving}
          className="col-span-3 sm:col-auto"
        >
          {saving ? <IconSpinner /> : <IconSave />}
          {saving ? "Saving…" : `Save${changed.length ? ` (${changed.length})` : ""}`}
        </Button>
      </div>
    </div>
  );
}
