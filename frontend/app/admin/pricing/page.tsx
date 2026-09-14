"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { Dropdown } from "@/components/admin/dropdown";
import { IconSave, IconSpinner } from "@/components/admin/icons";
import { Require } from "@/components/admin/require";
import { useToast } from "@/components/admin/toast";
import {
  Button,
  ErrorNote,
  Empty,
  Field,
  Input,
  PageHeader,
  Panel,
  SearchInput,
  Spinner,
  Textarea,
} from "@/components/admin/ui";
import { ApiError, adminApi } from "@/lib/admin/client";
import { moneyExact } from "@/lib/admin/format";
import type { PriceSheetRow } from "@/lib/admin/types";
import { useResource } from "@/lib/admin/use-resource";
import { useAuth } from "@/lib/auth";

export default function PricingPage() {
  return (
    <Require menu="pricing">
      <PricingScreen />
    </Require>
  );
}

/** An edited cell. Absent means untouched — only touched rows are submitted. */
type Draft = { cost: string; price: string };

/** A money field's value as a number; "" and "2." must not become NaN. */
function num(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function same(a: string | null, b: string | null): boolean {
  const x = a === null || a.trim() === "" ? null : Number.parseFloat(a);
  const y = b === null || b.trim() === "" ? null : Number.parseFloat(b);
  if (x === null || y === null) return x === y;
  return Math.abs(x - y) < 0.005;
}

function PricingScreen() {
  const { token, user } = useAuth();
  const { notify } = useToast();

  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<
    "name" | "margin_low" | "margin_high" | "price_high" | "price_low"
  >("name");

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const loadSheet = useCallback(
    (auth: string) => adminApi.priceSheet(auth, { search: search || null, sort }),
    [search, sort],
  );
  const sheet = useResource(loadSheet, [search, sort]);

  const loadPending = useCallback(
    (auth: string) => adminApi.priceReviews(auth, { status: "pending", size: 50 }),
    [],
  );
  const pending = useResource(loadPending, []);

  // Only the owner may propose or decide; the API refuses either way, this just
  // keeps a disabled-looking sheet from pretending otherwise.
  const isAdmin = user?.role.slug === "admin";

  const rows = sheet.data ?? [];

  /** Rows whose figures the operator has actually moved. */
  const changed = useMemo(
    () =>
      rows.filter((row) => {
        const draft = drafts[row.variant_id];
        if (!draft) return false;
        return !same(draft.price, row.price) || !same(draft.cost, row.cost_price);
      }),
    [rows, drafts],
  );

  function edit(row: PriceSheetRow, patch: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [row.variant_id]: {
        cost: current[row.variant_id]?.cost ?? row.cost_price ?? "",
        price: current[row.variant_id]?.price ?? row.price,
        ...patch,
      },
    }));
  }

  async function submit() {
    if (!token || changed.length === 0) return;
    setSaving(true);
    try {
      const review = await adminApi.proposePrices(token, {
        lines: changed.map((row) => {
          const draft = drafts[row.variant_id];
          return {
            variant_id: row.variant_id,
            // Blank means "still unknown", which is a null rather than a zero.
            cost_price: draft.cost.trim() === "" ? null : draft.cost,
            price: draft.price,
          };
        }),
        note: note.trim() || null,
      });
      notify(`${review.reference} sent for approval`);
      setDrafts({});
      setNote("");
      sheet.reload();
      pending.reload();
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : "Could not submit", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pricing"
        subtitle="What each size costs to buy, what it sells for, and the margin between. Changes are reviewed before any of them reach the shop."
      />

      {pending.data && pending.data.items.length > 0 ? (
        <Panel tone="amber" title="Waiting for approval">
          <ul className="space-y-2 text-sm">
            {pending.data.items.map((review) => (
              <li key={review.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Link
                  href={`/admin/pricing/${review.id}`}
                  className="font-mono text-ink underline decoration-dotted"
                >
                  {review.reference}
                </Link>
                <span className="text-muted">
                  {review.line_count} price{review.line_count === 1 ? "" : "s"}
                  {review.proposed_by ? ` · ${review.proposed_by}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel bodyClassName="p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(term.trim());
            }}
          >
            <Field label="Search">
              <SearchInput
                placeholder="Product, brand or SKU"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
              />
            </Field>
          </form>
          <Field label="Order by">
            <Dropdown
              value={sort}
              onChange={(value) => setSort(value as typeof sort)}
              aria-label="Order by"
              options={[
                { value: "name", label: "Product name" },
                { value: "margin_low", label: "Thinnest margin first" },
                { value: "margin_high", label: "Fattest margin first" },
                { value: "price_high", label: "Dearest first" },
                { value: "price_low", label: "Cheapest first" },
              ]}
            />
          </Field>
          {search || Object.keys(drafts).length > 0 ? (
            <Button
              tone="ghost"
              className="mb-px"
              onClick={() => {
                setTerm("");
                setSearch("");
                setDrafts({});
              }}
            >
              Reset
            </Button>
          ) : null}
        </div>
      </Panel>

      <Panel tone="green" title="Price sheet" bodyClassName="p-0">
        {sheet.error ? (
          <div className="p-5">
            <ErrorNote message={sheet.error} onRetry={sheet.reload} />
          </div>
        ) : sheet.loading && !sheet.data ? (
          <div className="p-5">
            <Spinner label="Loading the sheet" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <Empty
              title="Nothing to price."
              body={search ? "No size matches that search." : "Add a product first."}
            />
          </div>
        ) : (
          <Sheet rows={rows} drafts={drafts} onEdit={edit} editable={isAdmin} />
        )}
      </Panel>

      {isAdmin ? (
        <Panel title={`Submit ${changed.length || "no"} change${changed.length === 1 ? "" : "s"}`}>
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Nothing here reaches the shop until it is approved. Only the rows you
              have actually changed are sent.
            </p>
            <Field label="Note" hint="Optional — why these figures are moving.">
              <Textarea
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
            <Button
              onClick={submit}
              disabled={saving || changed.length === 0}
              className="w-full sm:w-auto"
            >
              {saving ? <IconSpinner className="animate-spin" /> : <IconSave />}
              {saving ? "Submitting…" : "Send for approval"}
            </Button>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ sheet */

function Sheet({
  rows,
  drafts,
  onEdit,
  editable,
}: {
  rows: PriceSheetRow[];
  drafts: Record<string, Draft>;
  onEdit: (row: PriceSheetRow, patch: Partial<Draft>) => void;
  editable: boolean;
}) {
  return (
    /* Its own horizontal scroller: a spreadsheet is wide by nature and the page
       body must not scroll sideways on a phone. */
    <div className="overflow-x-auto">
      <table className="w-full min-w-[54rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            <Th className="w-[26%]">Product</Th>
            <Th className="w-[8%]">Size</Th>
            <Th className="w-[14%]">Buying</Th>
            <Th className="w-[12%]">Was</Th>
            <Th className="w-[14%]">New price</Th>
            <Th className="w-[12%] text-right">Profit</Th>
            <Th className="w-[10%] text-right">Margin</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <SheetRow
              key={row.variant_id}
              row={row}
              draft={drafts[row.variant_id]}
              onEdit={onEdit}
              editable={editable}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`label px-3 py-2 font-normal text-muted ${className}`}>{children}</th>;
}

function SheetRow({
  row,
  draft,
  onEdit,
  editable,
}: {
  row: PriceSheetRow;
  draft: Draft | undefined;
  onEdit: (row: PriceSheetRow, patch: Partial<Draft>) => void;
  editable: boolean;
}) {
  const cost = draft?.cost ?? row.cost_price ?? "";
  const price = draft?.price ?? row.price;

  const costNum = num(cost);
  const priceNum = num(price);
  const profit = costNum === null || priceNum === null ? null : priceNum - costNum;
  const margin =
    profit === null || priceNum === null || priceNum <= 0 ? null : (profit / priceNum) * 100;

  const moved = !same(price, row.price) || !same(cost, row.cost_price);
  const loss = profit !== null && profit < 0;

  return (
    <tr
      className={`border-b border-line/60 ${moved ? "bg-[var(--color-amber-soft)]" : ""}`}
    >
      <td className="px-3 py-2">
        <span className="text-ink">{row.product_name}</span>
        <span className="block font-mono text-xs text-muted">{row.sku}</span>
        {row.pending_reference ? (
          <span className="label mt-1 block text-[var(--color-amber)]">
            in {row.pending_reference}
          </span>
        ) : null}
      </td>
      <td className="px-3 py-2 text-muted">{row.variant_name}</td>
      <td className="px-3 py-2">
        {editable ? (
          <Input
            inputMode="decimal"
            placeholder="—"
            aria-label={`Buying price of ${row.product_name} ${row.variant_name}`}
            value={cost}
            onChange={(event) => onEdit(row, { cost: event.target.value })}
          />
        ) : (
          <span className="[font-variant-numeric:tabular-nums]">
            {row.cost_price ? moneyExact(row.cost_price) : "—"}
          </span>
        )}
      </td>
      {/* The price as it stands, never editable — it is the thing being moved
          away from, and letting it be typed over would lose the comparison. */}
      <td className="px-3 py-2 text-muted [font-variant-numeric:tabular-nums]">
        {moneyExact(row.price)}
      </td>
      <td className="px-3 py-2">
        {editable ? (
          <Input
            inputMode="decimal"
            aria-label={`New price of ${row.product_name} ${row.variant_name}`}
            value={price}
            onChange={(event) => onEdit(row, { price: event.target.value })}
          />
        ) : (
          <span className="[font-variant-numeric:tabular-nums]">{moneyExact(row.price)}</span>
        )}
      </td>
      <td
        className={`px-3 py-2 text-right [font-variant-numeric:tabular-nums] ${
          loss ? "text-accent" : ""
        }`}
      >
        {profit === null ? <span className="text-muted">—</span> : moneyExact(profit.toFixed(2))}
      </td>
      <td
        className={`px-3 py-2 text-right [font-variant-numeric:tabular-nums] ${
          loss ? "text-accent" : "text-muted"
        }`}
      >
        {margin === null ? "—" : `${margin.toFixed(1)}%`}
      </td>
    </tr>
  );
}
