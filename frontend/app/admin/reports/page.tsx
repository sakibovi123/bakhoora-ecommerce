"use client";

import { useCallback, useState, type ReactNode } from "react";

import { Require } from "@/components/admin/require";
import {
  IconAlert,
  IconCustomers,
  IconOrders,
  IconProducts,
  IconReports,
} from "@/components/admin/icons";
import { SalesChart } from "@/components/admin/sales-chart";
import { StatTile, compact } from "@/components/admin/stat-tile";
import {
  Button,
  Cell,
  Empty,
  ErrorNote,
  Field,
  Input,
  PageHeader,
  Panel,
  Row,
  Spinner,
  Table,
} from "@/components/admin/ui";
import { adminApi } from "@/lib/admin/client";
import { count, money, moneyExact } from "@/lib/admin/format";
import { useResource } from "@/lib/admin/use-resource";
import type { Granularity, SalesBucket, SalesReport } from "@/lib/admin/types";
import { useAuth } from "@/lib/auth";

export default function ReportsPage() {
  return (
    <Require menu="reports">
      <ReportsScreen />
    </Require>
  );
}

/**
 * How far back each preset reaches, per grouping.
 *
 * Grouping and range are separate controls rather than one list of presets:
 * "last 90 days, by month" is a real question, and folding the two together
 * makes it unaskable.
 */
const SPANS: Record<Granularity, { key: string; label: string; back: number }[]> = {
  daily: [
    { key: "7", label: "7 days", back: 7 },
    { key: "30", label: "30 days", back: 30 },
    { key: "90", label: "90 days", back: 90 },
  ],
  monthly: [
    { key: "6", label: "6 months", back: 6 },
    { key: "12", label: "12 months", back: 12 },
    { key: "24", label: "24 months", back: 24 },
  ],
};

function ReportsScreen() {
  const [granularity, setGranularity] = useState<Granularity>("daily");
  const [span, setSpan] = useState("30");
  // Empty means "let the preset decide".
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const spans = SPANS[granularity];
  const active = spans.find((option) => option.key === span) ?? spans[1];
  const custom = Boolean(start || end);

  const load = useCallback(
    (token: string) => {
      // `end` is left to the API when unset: its clock runs on the shop's
      // timezone and the browser's may not, so it owns what "today" means.
      const params = {
        start: start || (custom ? null : startFor(granularity, active.back)),
        end: end || null,
      };
      return granularity === "monthly"
        ? adminApi.monthlyReport(token, params)
        : adminApi.dailyReport(token, params);
    },
    [granularity, start, end, custom, active.back],
  );

  const { data, error, loading, reload } = useResource(load, [
    granularity,
    start,
    end,
    active.back,
  ]);

  return (
    <div className="space-y-7">
      <PageHeader
        title="Sales reports"
        subtitle={
          data
            ? `${plainDate(data.start_date)} — ${plainDate(data.end_date)} · days end at midnight ${data.timezone}`
            : "Daily and monthly takings."
        }
        actions={<ExportButton granularity={granularity} start={start} end={end} />}
      />

      <Panel bodyClassName="p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <div>
            <p className="label mb-2 text-muted">Group by</p>
            <div className="flex gap-2">
              {(["daily", "monthly"] as const).map((option) => (
                <Toggle
                  key={option}
                  selected={granularity === option}
                  onClick={() => {
                    setGranularity(option);
                    // Each grouping has its own preset keys; "30" means nothing
                    // in the monthly list, so land on that list's middle option.
                    setSpan(SPANS[option][1].key);
                    setStart("");
                    setEnd("");
                  }}
                >
                  {option === "daily" ? "Day" : "Month"}
                </Toggle>
              ))}
            </div>
          </div>

          <div>
            <p className="label mb-2 text-muted">Range</p>
            <div className="flex flex-wrap gap-2">
              {spans.map((option) => (
                <Toggle
                  key={option.key}
                  selected={!custom && option.key === span}
                  onClick={() => {
                    setSpan(option.key);
                    setStart("");
                    setEnd("");
                  }}
                >
                  {option.label}
                </Toggle>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <Field label="From">
              <Input
                type="date"
                value={start}
                max={end || undefined}
                onChange={(event) => setStart(event.target.value)}
              />
            </Field>
            <Field label="To">
              <Input
                type="date"
                value={end}
                min={start || undefined}
                onChange={(event) => setEnd(event.target.value)}
              />
            </Field>
            {custom ? (
              <Button
                tone="ghost"
                className="mb-px"
                onClick={() => {
                  setStart("");
                  setEnd("");
                }}
              >
                Clear dates
              </Button>
            ) : null}
          </div>
        </div>
        {granularity === "monthly" ? (
          <p className="mt-3 text-xs text-muted">
            Monthly rows always start at a month boundary. A range ending mid-month leaves the
            last row covering a part-month.
          </p>
        ) : null}
      </Panel>

      {error ? <ErrorNote message={error} onRetry={reload} /> : null}
      {loading && !data ? <Spinner label="Building the report" /> : null}
      {data ? <ReportBody report={data} /> : null}
    </div>
  );
}

function Toggle({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`label min-h-11 border px-3 py-2 text-[0.625rem] transition-colors ${
        selected
          ? "border-ink bg-ink text-paper"
          : "border-line bg-paper text-muted hover:bg-paper-2"
      }`}
    >
      {children}
    </button>
  );
}

function ReportBody({ report }: { report: SalesReport }) {
  const { summary, buckets, top_products, status_breakdown, payment_breakdown } = report;
  const sold = buckets.some((bucket) => bucket.orders > 0);
  const bestLabel = buckets.find((bucket) => bucket.period === summary.best_period)?.label;

  return (
    <div className="space-y-7">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          hero
          tone="green"
          icon={IconReports}
          label="Net revenue"
          value={money(summary.net_revenue)}
          note={<Change pct={summary.change_pct} previous={summary.previous_net_revenue} />}
        />
        <StatTile
          tone="blue"
          icon={IconOrders}
          label="Orders"
          value={compact(summary.orders)}
          note={`${count(summary.units)} unit${summary.units === 1 ? "" : "s"} sold`}
        />
        <StatTile
          tone="amber"
          icon={IconCustomers}
          label="Average order"
          value={money(summary.average_order_value)}
          note={
            summary.best_period
              ? `Best: ${bestLabel ?? plainDate(summary.best_period)} · ${money(
                  summary.best_period_revenue,
                )}`
              : "No sales in this range"
          }
        />
        <StatTile
          icon={summary.cancelled_orders ? IconAlert : IconOrders}
          tone={summary.cancelled_orders ? "alert" : "green"}
          label="Cancelled or refunded"
          value={money(summary.cancelled_value)}
          note={`${summary.cancelled_orders} order${summary.cancelled_orders === 1 ? "" : "s"} unwound`}
        />
      </div>

      <Panel tone="green" bodyClassName="p-4 sm:p-5">
        {sold ? (
          <SalesChart buckets={buckets} />
        ) : (
          <Empty
            title="Nothing sold in this range."
            body="Widen the dates, or check that orders have been confirmed — pending ones do not count as revenue."
          />
        )}
      </Panel>

      <Panel
        title={
          <span className="flex items-center gap-2">
            <IconReports className="text-[var(--color-green)]" />
            {report.granularity === "monthly" ? "Month by month" : "Day by day"}
          </span>
        }
        tone="green"
        bodyClassName=""
      >
        <Table
          head={[
            "Period",
            "Orders",
            "Units",
            "Gross",
            "Discount",
            "Shipping",
            "Net revenue",
            "Average",
          ]}
        >
          {buckets.map((bucket) => (
            <BucketRow key={bucket.period} bucket={bucket} />
          ))}
          <Row>
            <Cell className="font-medium">Total</Cell>
            <Cell className="[font-variant-numeric:tabular-nums]">{count(summary.orders)}</Cell>
            <Cell className="[font-variant-numeric:tabular-nums]">{count(summary.units)}</Cell>
            <Cell className="[font-variant-numeric:tabular-nums]">
              {moneyExact(summary.gross_sales)}
            </Cell>
            <Cell className="[font-variant-numeric:tabular-nums]">
              {moneyExact(summary.discount)}
            </Cell>
            <Cell className="[font-variant-numeric:tabular-nums]">
              {moneyExact(summary.shipping)}
            </Cell>
            <Cell className="font-medium [font-variant-numeric:tabular-nums]">
              {moneyExact(summary.net_revenue)}
            </Cell>
            <Cell className="[font-variant-numeric:tabular-nums]">
              {moneyExact(summary.average_order_value)}
            </Cell>
          </Row>
        </Table>
      </Panel>

      <div className="grid gap-3 xl:grid-cols-[1.4fr_1fr]">
        <Panel
          title={
            <span className="flex items-center gap-2">
              <IconProducts className="text-[var(--color-amber)]" />
              Best sellers in this range
            </span>
          }
          tone="amber"
          bodyClassName=""
        >
          {top_products.length ? (
            <Table head={["Product", "Units", "Revenue"]}>
              {top_products.map((product) => (
                <Row key={product.product_name}>
                  <Cell>{product.product_name}</Cell>
                  <Cell className="[font-variant-numeric:tabular-nums]">{product.units}</Cell>
                  <Cell className="[font-variant-numeric:tabular-nums]">
                    {moneyExact(product.revenue)}
                  </Cell>
                </Row>
              ))}
            </Table>
          ) : (
            <div className="p-4 sm:p-5">
              <Empty title="No products sold in this range." />
            </div>
          )}
        </Panel>

        <div className="space-y-3">
          <BreakdownPanel
            title="By status"
            tone="blue"
            rows={status_breakdown}
            note="Every order in the range, including the ones that never became revenue."
          />
          <BreakdownPanel title="By payment method" tone="plum" rows={payment_breakdown} />
        </div>
      </div>
    </div>
  );
}

function BucketRow({ bucket }: { bucket: SalesBucket }) {
  // A period with no trade is dimmed rather than hidden: a gap in the dates
  // reads as missing data, and the whole point of the zero-filled series is
  // that a quiet Tuesday is a fact, not an omission.
  const quiet = bucket.orders === 0;
  return (
    <Row>
      <Cell className={quiet ? "text-muted" : ""}>{bucket.label}</Cell>
      <Cell className={`[font-variant-numeric:tabular-nums] ${quiet ? "text-muted" : ""}`}>
        {bucket.orders}
      </Cell>
      <Cell className={`[font-variant-numeric:tabular-nums] ${quiet ? "text-muted" : ""}`}>
        {bucket.units}
      </Cell>
      <Cell className={`[font-variant-numeric:tabular-nums] ${quiet ? "text-muted" : ""}`}>
        {moneyExact(bucket.gross_sales)}
      </Cell>
      <Cell className={`[font-variant-numeric:tabular-nums] ${quiet ? "text-muted" : ""}`}>
        {moneyExact(bucket.discount)}
      </Cell>
      <Cell className={`[font-variant-numeric:tabular-nums] ${quiet ? "text-muted" : ""}`}>
        {moneyExact(bucket.shipping)}
      </Cell>
      <Cell
        className={`[font-variant-numeric:tabular-nums] ${quiet ? "text-muted" : "font-medium"}`}
      >
        {moneyExact(bucket.net_revenue)}
      </Cell>
      <Cell className={`[font-variant-numeric:tabular-nums] ${quiet ? "text-muted" : ""}`}>
        {bucket.orders ? moneyExact(bucket.average_order_value) : "—"}
      </Cell>
    </Row>
  );
}

function BreakdownPanel({
  title,
  tone,
  rows,
  note,
}: {
  title: string;
  tone: "blue" | "plum";
  rows: { key: string; label: string; orders: number; revenue: string }[];
  note?: string;
}) {
  const total = rows.reduce((sum, row) => sum + (Number.parseFloat(row.revenue) || 0), 0);
  return (
    <Panel title={title} tone={tone} bodyClassName="p-4 sm:p-5">
      {rows.length ? (
        <ul className="space-y-3">
          {rows.map((row) => {
            const value = Number.parseFloat(row.revenue) || 0;
            const share = total ? (value / total) * 100 : 0;
            return (
              <li key={row.key}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span>{row.label}</span>
                  <span className="[font-variant-numeric:tabular-nums] text-muted">
                    {row.orders} · {money(row.revenue)}
                  </span>
                </div>
                {/* The bar is a share indicator, not the data — the numbers
                    above it carry the value on their own. */}
                <div aria-hidden className="mt-1.5 h-1 bg-paper-2">
                  <div
                    className="h-full"
                    style={{ width: `${share}%`, backgroundColor: `var(--tone)` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty title="No orders in this range." />
      )}
      {note ? <p className="mt-4 text-xs text-muted">{note}</p> : null}
    </Panel>
  );
}

function Change({ pct, previous }: { pct: number | null; previous: string }) {
  if (pct === null) {
    return <span>Nothing sold in the preceding window</span>;
  }
  const up = pct >= 0;
  return (
    <span className="flex items-center gap-1.5">
      <span className={up ? "text-[var(--color-green-deep)]" : "text-accent"}>
        {up ? "▲" : "▼"} {Math.abs(pct)}%
      </span>
      <span>vs {money(previous)} before</span>
    </span>
  );
}

function ExportButton({
  granularity,
  start,
  end,
}: {
  granularity: Granularity;
  start: string;
  end: string;
}) {
  const { token } = useAuth();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const save = async () => {
    if (!token) return;
    setBusy(true);
    setFailed(false);
    try {
      const blob = await adminApi.reportCsv(token, granularity, {
        start: start || null,
        end: end || null,
      });
      // The route is token-guarded, so the bytes are already in hand; an object
      // URL is what turns them back into a normal browser download.
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `sales-${granularity}.csv`;
      link.click();
      URL.revokeObjectURL(href);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button tone="ghost" onClick={save} disabled={busy}>
      {busy ? "Preparing…" : failed ? "Failed — retry" : "Export CSV"}
    </Button>
  );
}

/**
 * Format a bare `YYYY-MM-DD` without letting the browser shift it.
 *
 * `new Date("2026-08-01")` is parsed as UTC midnight and then rendered in the
 * viewer's zone, so anyone west of UTC reads it as 31 July. Anchoring at local
 * noon keeps the date the API sent.
 */
function plainDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${iso}T12:00:00`));
}

/**
 * The ISO start date for a preset.
 *
 * Only the start is computed here — the end is left unset so the API supplies
 * "today" from the shop's timezone. A browser an hour ahead of Dhaka would
 * otherwise ask for a day that has not begun yet, and get an empty last bucket.
 */
function startFor(granularity: Granularity, back: number): string {
  const date = new Date();
  if (granularity === "monthly") {
    date.setDate(1);
    date.setMonth(date.getMonth() - (back - 1));
  } else {
    date.setDate(date.getDate() - (back - 1));
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}
