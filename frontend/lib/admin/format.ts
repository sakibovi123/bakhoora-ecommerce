import type { OrderStatus, PaymentStatus } from "@/lib/admin/types";

const taka = new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 });
const takaPrecise = new Intl.NumberFormat("en-BD", { minimumFractionDigits: 2 });

/** Money arrives as a decimal string; keep it a string until the last moment. */
export function money(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const amount = typeof value === "string" ? Number.parseFloat(value) : value;
  if (Number.isNaN(amount)) return "—";
  return `৳${taka.format(amount)}`;
}

export function moneyExact(value: string | number): string {
  const amount = typeof value === "string" ? Number.parseFloat(value) : value;
  return Number.isNaN(amount) ? "—" : `৳${takaPrecise.format(amount)}`;
}

export function count(value: number): string {
  return new Intl.NumberFormat("en-BD").format(value);
}

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const timeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function shortDate(iso: string): string {
  return dateFmt.format(new Date(iso));
}

export function dateTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}

/**
 * Format a bare `YYYY-MM-DD` without letting the browser shift it.
 *
 * `new Date("2026-08-01")` is parsed as UTC midnight and then rendered in the
 * viewer's zone, so anyone west of UTC reads it as 31 July. Anchoring at local
 * noon keeps the date the API sent. Use this for any date the API sends as a
 * bare day — an expense's `spent_on`, a report bucket's `period` — rather than
 * `shortDate`/`dayLabel`, which are for full timestamps.
 */
export function plainDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${iso}T12:00:00`));
}

export function dayLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

/**
 * Pill colours.
 *
 * Every pill is a tinted background with **ink** text and a coloured dot rather
 * than coloured text: ink clears 13:1 on all four tints, whereas the hues
 * themselves land at 3.2–4.8:1, under the 4.5 small text needs. Terminal states
 * fill instead, in a step dark enough for paper text. The dot also means status
 * is never carried by colour alone.
 */
export const ORDER_STATUS_TONE: Record<OrderStatus, string> = {
  pending: "bg-[var(--color-amber-soft)] text-ink",
  confirmed: "bg-[var(--color-blue-soft)] text-ink",
  processing: "bg-[var(--color-blue-tint)] text-ink",
  shipped: "bg-[var(--color-plum-soft)] text-ink",
  delivered: "bg-[var(--color-green-deep)] text-paper",
  cancelled: "bg-paper-2 text-muted line-through",
  refunded: "bg-paper-3 text-muted",
};

/** The dot beside the label, so the state does not rest on the fill alone. */
export const ORDER_STATUS_DOT: Record<OrderStatus, string> = {
  pending: "bg-[var(--color-amber)]",
  confirmed: "bg-[var(--color-blue)]",
  processing: "bg-[var(--color-blue)]",
  shipped: "bg-[var(--color-plum)]",
  delivered: "bg-paper",
  cancelled: "bg-muted",
  refunded: "bg-muted",
};

export const PAYMENT_STATUS_TONE: Record<PaymentStatus, string> = {
  unpaid: "bg-paper-3 text-muted",
  pending: "bg-[var(--color-amber-soft)] text-ink",
  // Money owed is the state staff need to spot while scanning a list, so it
  // takes the catalogue amber at its stronger step rather than another grey.
  partial: "bg-[var(--color-amber-tint)] text-ink",
  paid: "bg-[var(--color-green-deep)] text-paper",
  failed: "bg-accent/20 text-accent",
  refunded: "bg-paper-3 text-muted",
};

export const PAYMENT_STATUS_DOT: Record<PaymentStatus, string> = {
  unpaid: "bg-muted",
  pending: "bg-[var(--color-amber)]",
  partial: "bg-[var(--color-amber)]",
  paid: "bg-paper",
  failed: "bg-accent",
  refunded: "bg-muted",
};

export const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered", "refunded"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
};

/**
 * What the desk may set by hand.
 *
 * `partial` is deliberately absent: it is a consequence of how much money came
 * in, not something you can assert. Recording a payment is what produces it,
 * and the API rejects setting it directly.
 */
export const PAYMENT_STATUSES: PaymentStatus[] = [
  "unpaid",
  "pending",
  "paid",
  "failed",
  "refunded",
];

export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}
