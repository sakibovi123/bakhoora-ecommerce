"use client";

import { useCallback, useMemo, useState } from "react";

import { IconSave, IconSpinner } from "@/components/admin/icons";
import {
  AddressForm,
  ComboPicker,
  type AddressFields,
  type Line,
  LineTable,
  ProductPicker,
  linesToItems,
  priceOf,
  useOrderLines,
} from "@/components/admin/order-lines";
import { useToast } from "@/components/admin/toast";
import { Button, ErrorNote, Field, Input, Panel, Spinner } from "@/components/admin/ui";
import { ApiError, adminApi } from "@/lib/admin/client";
import { moneyExact } from "@/lib/admin/format";
import type { Combo, Order, Product } from "@/lib/admin/types";
import { useCatalogue } from "@/lib/admin/use-catalogue";
import { useAuth } from "@/lib/auth";
import { useResource } from "@/lib/admin/use-resource";

/** Statuses in which the shop is still holding this order's stock.
 *  Mirrors STOCK_HELD_STATUSES in `app/services/order_service.py` — the API is
 *  the authority, this only decides whether to offer the button. */
export const EDITABLE_STATUSES = ["pending", "confirmed", "processing"];

export function canEdit(order: Order, roleSlug: string | undefined): boolean {
  return roleSlug === "admin" && EDITABLE_STATUSES.includes(order.status);
}

function addressOf(order: Order): AddressFields {
  return {
    recipient_name: order.recipient_name,
    phone: order.phone,
    line1: order.line1,
    line2: order.line2 ?? "",
    city: order.city,
    district: order.district ?? "",
    postal_code: order.postal_code ?? "",
    country: order.country,
  };
}

/**
 * Rebuild the order's lines as editable ones.
 *
 * The snapshot on an order item is enough to *show* a line but not to re-submit
 * it: the API wants a variant id or a combo size id, and needs a stock figure
 * to cap the quantity against. Both come from the live catalogue, which is why
 * this waits for it.
 *
 * A combo line is the awkward case. It records `combo_id` but not which size
 * was sold — the size's own sku is snapshotted onto the line, so the size is
 * recovered by matching that. A combo or size deleted since cannot be matched,
 * and rather than silently dropping the line it comes back flagged, so the
 * panel can say which line it cannot edit instead of quietly rewriting the
 * order without it.
 */
function seedLines(
  order: Order,
  products: Product[],
  combos: Combo[],
): { lines: Line[]; unmatched: string[] } {
  const variants = new Map(
    products.flatMap((product) =>
      product.variants.map((variant) => [variant.id, { product, variant }] as const),
    ),
  );

  const lines: Line[] = [];
  const unmatched: string[] = [];

  for (const item of order.items) {
    if (item.combo_id) {
      const combo = combos.find((entry) => entry.id === item.combo_id);
      const size = combo?.sizes.find((entry) => entry.sku === item.sku);
      if (!combo || !size) {
        unmatched.push(`${item.product_name} ${item.variant_name}`);
        continue;
      }
      lines.push({
        kind: "combo",
        id: size.id,
        product: combo.name,
        size: size.label,
        sku: size.sku,
        price: item.unit_price,
        listPrice: size.price,
        stock: size.max_sets,
        quantity: item.quantity,
      });
      continue;
    }

    const found = item.variant_id ? variants.get(item.variant_id) : undefined;
    if (!found) {
      unmatched.push(`${item.product_name} ${item.variant_name}`);
      continue;
    }
    lines.push({
      kind: "product",
      id: found.variant.id,
      product: found.product.name,
      size: found.variant.name,
      sku: found.variant.sku,
      price: item.unit_price,
      listPrice: found.variant.price,
      stock: found.variant.stock_quantity,
      quantity: item.quantity,
    });
  }

  return { lines, unmatched };
}

export function OrderEditor({
  order,
  onSaved,
  onCancel,
}: {
  order: Order;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const catalogue = useCatalogue();
  const loadCombos = useCallback((token: string) => adminApi.combos(token), []);
  const combos = useResource(loadCombos, []);

  if (catalogue.error || combos.error) {
    return (
      <Panel tone="amber" title="Edit this order">
        <ErrorNote
          message={catalogue.error ?? combos.error ?? "Could not load the catalogue"}
          onRetry={() => {
            catalogue.reload();
            combos.reload();
          }}
        />
      </Panel>
    );
  }
  if (!catalogue.data || !combos.data) {
    return (
      <Panel tone="amber" title="Edit this order">
        <Spinner label="Loading the catalogue" />
      </Panel>
    );
  }

  return (
    <EditorForm
      order={order}
      products={catalogue.data}
      combos={combos.data}
      onSaved={onSaved}
      onCancel={onCancel}
    />
  );
}

/** Split out so the seed runs once, after the catalogue has actually arrived. */
function EditorForm({
  order,
  products,
  combos,
  onSaved,
  onCancel,
}: {
  order: Order;
  products: Product[];
  combos: Combo[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { token } = useAuth();
  const { notify } = useToast();
  const seed = useMemo(
    () => seedLines(order, products, combos),
    [order, products, combos],
  );

  const { lines, setLines, addLine, addCombo, subtotal, pricesValid } = useOrderLines(
    seed.lines,
  );
  const [address, setAddress] = useState(addressOf(order));
  const [shippingOverride, setShippingOverride] = useState(order.shipping_fee);
  const [discount, setDiscount] = useState(order.discount_total);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  /* What this order is already holding. The catalogue's stock figure has it
     subtracted out, so without adding it back the screen would refuse to let
     an order keep the quantity it already has — the API restocks before it
     re-reserves, so the real ceiling is shelf + what this order holds. */
  const held = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of seed.lines) map.set(line.id, line.quantity);
    return map;
  }, [seed.lines]);

  const shipping =
    shippingOverride.trim() !== "" ? Number.parseFloat(shippingOverride) || 0 : 0;
  const off = discount.trim() !== "" ? Number.parseFloat(discount) || 0 : 0;
  const total = Math.max(subtotal + shipping - off, 0);
  const collected = Number.parseFloat(order.amount_paid) || 0;
  const belowCollected = collected > total;

  const overCapacity = lines.some(
    (line) => line.quantity > line.stock + (held.get(line.id) ?? 0),
  );

  const ready =
    lines.length > 0 &&
    pricesValid &&
    !overCapacity &&
    !belowCollected &&
    address.recipient_name.trim() !== "" &&
    address.phone.trim() !== "" &&
    address.line1.trim() !== "" &&
    address.city.trim() !== "";

  async function save() {
    if (!token) return;
    setSaving(true);
    setFailure(null);
    try {
      await adminApi.editOrder(token, order.id, {
        items: linesToItems(lines),
        shipping_address: Object.fromEntries(
          Object.entries(address).map(([key, value]) => [key, value.trim() || null]),
        ),
        shipping_fee: shippingOverride.trim() !== "" ? shippingOverride : null,
        discount_total: discount.trim() !== "" ? discount : null,
      });
      notify(`${order.order_number} updated`);
      onSaved();
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : "Could not save the order");
      setSaving(false);
    }
  }

  return (
    <EditorBody
      order={order}
      lines={lines}
      setLines={setLines}
      addLine={addLine}
      addCombo={addCombo}
      held={held}
      unmatched={seed.unmatched}
      address={address}
      setAddress={setAddress}
      shippingOverride={shippingOverride}
      setShippingOverride={setShippingOverride}
      discount={discount}
      setDiscount={setDiscount}
      subtotal={subtotal}
      shipping={shipping}
      total={total}
      collected={collected}
      belowCollected={belowCollected}
      failure={failure}
      saving={saving}
      ready={ready}
      onSave={save}
      canSave={Boolean(token)}
      onCancel={onCancel}
    />
  );
}

function EditorBody(props: {
  order: Order;
  lines: Line[];
  setLines: (update: (current: Line[]) => Line[]) => void;
  addLine: (product: Product, variantId: string) => void;
  addCombo: (combo: Combo, size: Combo["sizes"][number]) => void;
  held: Map<string, number>;
  unmatched: string[];
  address: AddressFields;
  setAddress: (next: AddressFields) => void;
  shippingOverride: string;
  setShippingOverride: (value: string) => void;
  discount: string;
  setDiscount: (value: string) => void;
  subtotal: number;
  shipping: number;
  total: number;
  collected: number;
  belowCollected: boolean;
  failure: string | null;
  saving: boolean;
  ready: boolean;
  onSave: () => void;
  canSave: boolean;
  onCancel: () => void;
}) {
  const {
    order, lines, setLines, addLine, addCombo, held, unmatched, address, setAddress,
    shippingOverride, setShippingOverride, discount, setDiscount, subtotal, shipping,
    total, collected, belowCollected, failure, saving, ready, onSave, canSave, onCancel,
  } = props;

  return (
    <Panel
      tone="amber"
      title={`Editing ${order.order_number}`}
      actions={
        <span className="label text-muted">
          Stock is corrected when you save
        </span>
      }
    >
      <div className="space-y-5">
        {failure ? <ErrorNote message={failure} /> : null}

        {unmatched.length > 0 ? (
          <div className="border border-[var(--color-amber)] bg-[var(--color-amber-soft)] p-3 text-xs">
            {unmatched.length === 1 ? "One line is" : `${unmatched.length} lines are`}{" "}
            no longer in the catalogue and cannot be edited:{" "}
            <span className="text-ink">{unmatched.join(", ")}</span>. Saving will drop{" "}
            {unmatched.length === 1 ? "it" : "them"} from the order.
          </div>
        ) : null}

        <div className="space-y-4 border border-line p-4">
          <ProductPicker onPick={addLine} />
          <ComboPicker onPick={addCombo} />
        </div>

        {lines.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing on the order. Add at least one line — an order with none is a
            deletion, which is a separate button.
          </p>
        ) : (
          <LineTable
            lines={lines}
            setLines={setLines}
            headroom={(line) => held.get(line.id) ?? 0}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Delivery charge" hint="Blank re-applies the shop's own rule.">
            <Input
              inputMode="decimal"
              placeholder="0.00"
              value={shippingOverride}
              onChange={(event) => setShippingOverride(event.target.value)}
            />
          </Field>
          <Field label="Discount">
            <Input
              inputMode="decimal"
              placeholder="0.00"
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
            />
          </Field>
        </div>

        <dl className="space-y-2 border-y border-line py-4 text-sm [font-variant-numeric:tabular-nums]">
          <div className="flex justify-between text-muted">
            <dt>Subtotal</dt>
            <dd className="text-ink">{moneyExact(subtotal.toFixed(2))}</dd>
          </div>
          <div className="flex justify-between text-muted">
            <dt>Delivery</dt>
            <dd className="text-ink">{moneyExact(shipping.toFixed(2))}</dd>
          </div>
          <div className="flex justify-between font-medium">
            <dt>Total</dt>
            <dd>{moneyExact(total.toFixed(2))}</dd>
          </div>
          {collected > 0 ? (
            <div
              className={`flex justify-between ${belowCollected ? "text-accent" : "text-muted"}`}
            >
              <dt>Already collected</dt>
              <dd>{moneyExact(collected.toFixed(2))}</dd>
            </div>
          ) : null}
        </dl>

        {belowCollected ? (
          <p className="text-xs text-accent">
            {moneyExact(collected.toFixed(2))} has already been collected on this
            order, so it cannot be edited down to {moneyExact(total.toFixed(2))}.
            Refund the difference first.
          </p>
        ) : null}

        <div>
          <p className="label mb-3 text-muted">Deliver to</p>
          <AddressForm address={address} onChange={setAddress} />
        </div>

        <div className="flex gap-2 border-t border-line pt-4">
          <Button disabled={!ready || saving || !canSave} onClick={onSave}>
            {saving ? <IconSpinner className="animate-spin" /> : <IconSave />}
            {saving ? "Saving…" : "Save changes"}
          </Button>
          <Button tone="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        </div>
      </div>
    </Panel>
  );
}
