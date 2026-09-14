"use client";

import { useCallback, useState } from "react";

import { IconSearch, IconTrash } from "@/components/admin/icons";
import { useToast } from "@/components/admin/toast";
import {
  Button,
  Cell,
  Field,
  Input,
  Row,
  SearchInput,
  Spinner,
  Table,
} from "@/components/admin/ui";
import { adminApi } from "@/lib/admin/client";
import { money, moneyExact } from "@/lib/admin/format";
import type { Combo, ComboSize, Product } from "@/lib/admin/types";
import { useResource } from "@/lib/admin/use-resource";

/**
 * One line being composed, either a single bottle or a whole combo.
 *
 * `id` is whichever id the API needs for that kind — a variant or a combo size
 * — and `kind` says which, so the two can share every column of the table
 * without the row having to know what it is looking at. `stock` on a combo is
 * how many of the bundle could be made up, which is the same cap in spirit.
 *
 * Shared by the new-order screen and the edit-order panel. They compose the
 * same thing and must price it the same way; two copies of this table would be
 * two chances for a counter order and an edited one to disagree.
 */
export interface Line {
  kind: "product" | "combo";
  id: string;
  product: string;
  size: string;
  sku: string;
  price: string;
  /** The listed price, kept so an override can be spotted and undone. */
  listPrice: string;
  stock: number;
  quantity: number;
}

export const EMPTY_ADDRESS = {
  recipient_name: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  district: "",
  postal_code: "",
  country: "Bangladesh",
};

export type AddressFields = typeof EMPTY_ADDRESS;

/**
 * A price field's value as a number.
 *
 * A field mid-edit is "" or "2." — parsing that gives NaN, which would spread
 * through the subtotal and the total and render the whole summary unreadable.
 */
export function priceOf(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/** The lines as the API wants them. */
export function linesToItems(lines: Line[]) {
  return lines.map((line) => ({
    // One or the other, never both — the API refuses a line carrying two.
    ...(line.kind === "combo" ? { combo_size_id: line.id } : { variant_id: line.id }),
    quantity: line.quantity,
    // Always sent, so what the desk sees on screen is what is charged.
    unit_price: priceOf(line.price).toFixed(2),
  }));
}

/** Lines, and the two ways of adding one. */
export function useOrderLines(initial: Line[] = []) {
  const { notify } = useToast();
  const [lines, setLines] = useState<Line[]>(initial);

  const addLine = useCallback(
    (product: Product, variantId: string) => {
      const variant = product.variants.find((v) => v.id === variantId);
      if (!variant) return;
      setLines((current) => {
        if (current.some((line) => line.id === variantId)) {
          notify(`${product.name} ${variant.name} is already on the order`, "error");
          return current;
        }
        return [
          ...current,
          {
            kind: "product",
            id: variant.id,
            product: product.name,
            size: variant.name,
            sku: variant.sku,
            price: variant.price,
            listPrice: variant.price,
            stock: variant.stock_quantity,
            quantity: 1,
          },
        ];
      });
    },
    [notify],
  );

  const addCombo = useCallback(
    (combo: Combo, size: ComboSize) => {
      setLines((current) => {
        if (current.some((line) => line.id === size.id)) {
          notify(`${combo.name} ${size.label} is already on the order`, "error");
          return current;
        }
        return [
          ...current,
          {
            kind: "combo",
            id: size.id,
            product: combo.name,
            size: size.label,
            sku: size.sku,
            price: size.price,
            listPrice: size.price,
            // How many bundles the shelf can make up, not a stock figure of its
            // own — a combo has none.
            stock: size.max_sets,
            quantity: 1,
          },
        ];
      });
    },
    [notify],
  );

  const subtotal = lines.reduce(
    (sum, line) => sum + priceOf(line.price) * line.quantity,
    0,
  );
  const pricesValid = lines.every((line) => {
    const parsed = Number.parseFloat(line.price);
    return Number.isFinite(parsed) && parsed >= 0;
  });

  return { lines, setLines, addLine, addCombo, subtotal, pricesValid };
}

/* ----------------------------------------------------------------- table */

export function LineTable({
  lines,
  setLines,
  /** Extra headroom per line, for a screen whose stock is partly already held
      by the order being edited. Omitted, the shelf figure is the cap. */
  headroom,
}: {
  lines: Line[];
  setLines: (update: (current: Line[]) => Line[]) => void;
  headroom?: (line: Line) => number;
}) {
  return (
    <Table head={["Product", "Size", "Unit", "Qty", "Line", ""]}>
      {lines.map((line) => {
        const cap = line.stock + (headroom?.(line) ?? 0);
        return (
          <Row key={line.id}>
            <Cell className="text-ink">
              {line.product}
              <span className="block font-mono text-xs text-muted">{line.sku}</span>
            </Cell>
            <Cell className="text-muted">{line.size}</Cell>
            <Cell className="md:w-32">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={line.price}
                aria-label={`Unit price of ${line.product} ${line.size}`}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((entry) =>
                      entry.id === line.id ? { ...entry, price: event.target.value } : entry,
                    ),
                  )
                }
              />
              {/* The listed price stays visible once it has been changed, so a
                  mistyped figure is obvious rather than quietly becoming the
                  price of the order. */}
              {line.price !== line.listPrice ? (
                <button
                  type="button"
                  onClick={() =>
                    setLines((current) =>
                      current.map((entry) =>
                        entry.id === line.id ? { ...entry, price: entry.listPrice } : entry,
                      ),
                    )
                  }
                  className="mt-1 block text-xs text-muted underline decoration-dotted hover:text-ink"
                >
                  list {moneyExact(line.listPrice)} — reset
                </button>
              ) : null}
            </Cell>
            <Cell className="md:w-28">
              <Input
                type="number"
                min={1}
                max={cap}
                value={line.quantity}
                aria-label={`Quantity of ${line.product} ${line.size}`}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((entry) =>
                      entry.id === line.id
                        ? { ...entry, quantity: Math.max(1, Number(event.target.value) || 1) }
                        : entry,
                    ),
                  )
                }
              />
              {line.quantity > cap ? (
                <span className="mt-1 block text-xs text-accent">only {cap} in stock</span>
              ) : null}
            </Cell>
            <Cell className="whitespace-nowrap [font-variant-numeric:tabular-nums]">
              {moneyExact((priceOf(line.price) * line.quantity).toFixed(2))}
            </Cell>
            <Cell className="text-right">
              <button
                type="button"
                aria-label={`Remove ${line.product} ${line.size}`}
                onClick={() =>
                  setLines((current) => current.filter((entry) => entry.id !== line.id))
                }
                className="label inline-flex items-center gap-1.5 text-accent hover:underline"
              >
                <IconTrash className="size-3.5" />
              </button>
            </Cell>
          </Row>
        );
      })}
    </Table>
  );
}

/* --------------------------------------------------------------- pickers */

export function ProductPicker({
  onPick,
}: {
  onPick: (product: Product, variantId: string) => void;
}) {
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(
    (token: string) =>
      query.trim()
        ? adminApi.products(token, { search: query, size: 6, active: true })
        : Promise.resolve(null),
    [query],
  );
  const { data, loading } = useResource(load, [query]);

  return (
    <div>
      <form
        className="flex flex-wrap items-center gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(term.trim());
        }}
      >
        <div className="w-full min-w-0 sm:flex-1">
          <SearchInput
            placeholder="Search the catalogue…"
            value={term}
            aria-label="Search products to add"
            onChange={(event) => setTerm(event.target.value)}
          />
        </div>
        <Button tone="ghost" type="submit">
          <IconSearch />
          Find
        </Button>
      </form>

      {loading && query ? <Spinner label="Searching" /> : null}

      {data && data.items.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Nothing matches “{query}”.</p>
      ) : null}

      {data && data.items.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {data.items.map((product) => (
            <li key={product.id}>
              <p className="text-sm text-ink">{product.name}</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {product.variants.map((variant) => (
                  <button
                    key={variant.id}
                    type="button"
                    disabled={!variant.is_active || variant.stock_quantity < 1}
                    onClick={() => onPick(product, variant.id)}
                    className="border border-line px-2.5 py-1.5 text-xs text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:text-muted/50"
                  >
                    {variant.name} · {money(variant.price)}
                    <span className="ml-1.5 text-muted">
                      {variant.stock_quantity < 1 ? "sold out" : `${variant.stock_quantity} left`}
                    </span>
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * The live combos, ready to drop onto a counter order.
 *
 * No search box, unlike the catalogue above it: a campaign is a dozen bundles,
 * not a few hundred bottles, so the whole list fits and scanning it beats
 * typing. Each button is one size option, and it says how many of that bundle
 * the shelf can actually make up — which is the number the desk needs before
 * promising anything on the phone.
 */
export function ComboPicker({
  onPick,
}: {
  onPick: (combo: Combo, size: ComboSize) => void;
}) {
  const load = useCallback((token: string) => adminApi.combos(token, { active: true }), []);
  const { data, loading } = useResource(load, []);

  if (loading && !data) return <Spinner label="Loading combos" />;
  if (!data || data.length === 0) return null;

  return (
    <div className="border-t border-line pt-4">
      <p className="label text-muted">Combos</p>
      <ul className="mt-3 space-y-3">
        {data.map((combo) => (
          <li key={combo.id}>
            <p className="text-sm text-ink">
              {combo.name}
              <span className="ml-2 text-xs text-muted">
                {combo.products.map((entry) => entry.name).join(", ")}
              </span>
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {combo.sizes.map((size) => (
                <button
                  key={size.id}
                  type="button"
                  disabled={!size.is_available}
                  onClick={() => onPick(combo, size)}
                  className="border border-line px-2.5 py-1.5 text-xs text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:text-muted/50"
                >
                  {size.label} · {money(size.price)}
                  <span className="ml-1.5 text-muted">
                    {size.is_available
                      ? `${size.max_sets} can be made`
                      : size.is_active
                        ? "cannot be made up"
                        : "switched off"}
                  </span>
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* --------------------------------------------------------------- address */

export function AddressForm({
  address,
  onChange,
}: {
  address: AddressFields;
  onChange: (next: AddressFields) => void;
}) {
  const set = (key: keyof AddressFields) => (value: string) =>
    onChange({ ...address, [key]: value });

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Recipient name">
        <Input
          required
          value={address.recipient_name}
          onChange={(e) => set("recipient_name")(e.target.value)}
        />
      </Field>
      <Field label="Phone">
        <Input required value={address.phone} onChange={(e) => set("phone")(e.target.value)} />
      </Field>
      <Field label="Address line 1" className="sm:col-span-2">
        <Input required value={address.line1} onChange={(e) => set("line1")(e.target.value)} />
      </Field>
      <Field label="Address line 2" className="sm:col-span-2">
        <Input value={address.line2} onChange={(e) => set("line2")(e.target.value)} />
      </Field>
      <Field label="City">
        <Input required value={address.city} onChange={(e) => set("city")(e.target.value)} />
      </Field>
      <Field label="District">
        <Input value={address.district} onChange={(e) => set("district")(e.target.value)} />
      </Field>
      <Field label="Postal code">
        <Input value={address.postal_code} onChange={(e) => set("postal_code")(e.target.value)} />
      </Field>
      <Field label="Country">
        <Input value={address.country} onChange={(e) => set("country")(e.target.value)} />
      </Field>
    </div>
  );
}
