"use client";

import { useId, useState } from "react";

import { count, money, moneyExact } from "@/lib/admin/format";
import type { SalesBucket } from "@/lib/admin/types";

/** Round a maximum up to something a human would put on an axis. */
function niceMax(value: number): number {
  if (value <= 0) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= value) return candidate;
  }
  return 10 * magnitude;
}

/**
 * Net revenue per bucket.
 *
 * A sibling of RevenueChart rather than a rewrite of it: that one is bound to
 * the dashboard's fixed 14 days of `RevenuePoint`, while this takes whatever
 * range and granularity the report was asked for, and carries a second series
 * — cancelled value — stacked above the bar it was lost from.
 *
 * The cancelled segment is a hatched overlay, not a second colour: it is the
 * same money, in a state the day did not keep, and giving it its own hue would
 * read as a second product line. A table view carries every number for anyone
 * who cannot use the hover layer.
 */
export function SalesChart({ buckets }: { buckets: SalesBucket[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();

  const values = buckets.map((bucket) => Number.parseFloat(bucket.net_revenue) || 0);
  const lost = buckets.map((bucket) => Number.parseFloat(bucket.cancelled_value) || 0);
  const peak = Math.max(...values, 0);
  // The axis has to clear the tallest *stack*, or a heavily cancelled day
  // would draw straight through the top gridline.
  const top = niceMax(Math.max(...values.map((value, i) => value + lost[i]), 0));
  const peakIndex = values.indexOf(peak);
  const totalOrders = buckets.reduce((sum, bucket) => sum + bucket.orders, 0);
  const anyLost = lost.some((value) => value > 0);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="label text-muted">Net revenue</h2>
          <p className="mt-1 text-xs text-muted">
            {buckets.length} {buckets.length === 1 ? "period" : "periods"} · {count(totalOrders)}{" "}
            order{totalOrders === 1 ? "" : "s"}
            {anyLost ? " · hatched = cancelled or refunded" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowTable((open) => !open)}
          aria-expanded={showTable}
          aria-controls={tableId}
          className="label border border-line px-2.5 py-1.5 text-[0.625rem] text-muted hover:bg-paper-2"
        >
          {showTable ? "Chart" : "Table"}
        </button>
      </div>

      {showTable ? (
        <div id={tableId} className="mt-5 max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-paper">
              <tr className="border-b border-line text-left">
                <th scope="col" className="label py-2 font-medium text-muted">
                  Period
                </th>
                <th scope="col" className="label py-2 text-right font-medium text-muted">
                  Orders
                </th>
                <th scope="col" className="label py-2 text-right font-medium text-muted">
                  Units
                </th>
                <th scope="col" className="label py-2 text-right font-medium text-muted">
                  Net
                </th>
              </tr>
            </thead>
            <tbody className="[font-variant-numeric:tabular-nums]">
              {buckets.map((bucket) => (
                <tr key={bucket.period} className="border-b border-line/60 last:border-0">
                  <td className="py-2">{bucket.label}</td>
                  <td className="py-2 text-right">{bucket.orders}</td>
                  <td className="py-2 text-right">{bucket.units}</td>
                  <td className="py-2 text-right">{moneyExact(bucket.net_revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <figure className="mt-6">
          <div className="relative flex gap-2 sm:gap-3">
            <div className="flex w-10 shrink-0 flex-col justify-between text-right text-[0.625rem] text-muted sm:w-14 [font-variant-numeric:tabular-nums]">
              <span>{money(top)}</span>
              <span>{money(top / 2)}</span>
              <span>0</span>
            </div>

            <div className="relative h-44 flex-1">
              {[0, 50, 100].map((offset) => (
                <span
                  key={offset}
                  aria-hidden
                  className="absolute inset-x-0 border-t border-line"
                  style={{ top: `${offset}%` }}
                />
              ))}

              <div className="absolute inset-0 flex items-end justify-between gap-[2px]">
                {buckets.map((bucket, index) => {
                  const value = values[index];
                  const cancelled = lost[index];
                  const height = top ? (value / top) * 100 : 0;
                  const lostHeight = top ? (cancelled / top) * 100 : 0;
                  const active = hover === index;
                  return (
                    <div
                      key={bucket.period}
                      className="group relative flex h-full flex-1 flex-col justify-end"
                      onMouseEnter={() => setHover(index)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover(index)}
                      onBlur={() => setHover(null)}
                      onClick={() => setHover(active ? null : index)}
                      tabIndex={0}
                      role="img"
                      aria-label={`${bucket.label}: ${moneyExact(bucket.net_revenue)} from ${
                        bucket.orders
                      } orders${
                        cancelled > 0 ? `, ${moneyExact(bucket.cancelled_value)} cancelled` : ""
                      }`}
                    >
                      <span aria-hidden className="absolute inset-0" />
                      {cancelled > 0 ? (
                        <span
                          aria-hidden
                          className="mx-auto w-full max-w-6 border-x border-t border-line"
                          style={{
                            height: `${Math.max(lostHeight, 1)}%`,
                            backgroundImage:
                              "repeating-linear-gradient(45deg, var(--color-line) 0 2px, transparent 2px 5px)",
                          }}
                        />
                      ) : null}
                      <span
                        aria-hidden
                        className={`mx-auto w-full max-w-6 transition-colors ${
                          cancelled > 0 ? "" : "rounded-t-[4px]"
                        } ${active ? "bg-ink" : "bg-[var(--color-chart)]"}`}
                        style={{ height: `${Math.max(height, value > 0 ? 1.5 : 0)}%` }}
                      />
                      {index === peakIndex && peak > 0 && !active ? (
                        <span className="absolute -top-5 inset-x-0 whitespace-nowrap text-center text-[0.625rem] text-muted">
                          {money(peak)}
                        </span>
                      ) : null}
                      {active ? (
                        <div
                          className={`pointer-events-none absolute bottom-full z-10 mb-2 w-36 border border-line bg-paper px-3 py-2 text-left shadow-sm ${
                            index <= 1
                              ? "left-0"
                              : index >= buckets.length - 2
                                ? "right-0"
                                : ""
                          }`}
                        >
                          <p className="label text-muted">{bucket.label}</p>
                          <p className="mt-1 text-sm text-ink [font-variant-numeric:tabular-nums]">
                            {moneyExact(bucket.net_revenue)}
                          </p>
                          <p className="text-xs text-muted">
                            {bucket.orders} order{bucket.orders === 1 ? "" : "s"} · {bucket.units}{" "}
                            unit{bucket.units === 1 ? "" : "s"}
                          </p>
                          {cancelled > 0 ? (
                            <p className="mt-1 text-xs text-accent">
                              {moneyExact(bucket.cancelled_value)} cancelled
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* First, middle and last only — thirty labels would collide. */}
          <div className="ml-12 mt-2 flex justify-between text-[0.625rem] text-muted sm:ml-[4.25rem]">
            <span>{buckets[0]?.label ?? ""}</span>
            <span>
              {buckets.length > 2 ? buckets[Math.floor(buckets.length / 2)].label : ""}
            </span>
            <span>{buckets.length > 1 ? buckets[buckets.length - 1].label : ""}</span>
          </div>
        </figure>
      )}
    </div>
  );
}
