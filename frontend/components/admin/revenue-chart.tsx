"use client";

import { useId, useState } from "react";

import { dayLabel, money, moneyExact } from "@/lib/admin/format";
import type { RevenuePoint } from "@/lib/admin/types";

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
 * Daily revenue, one column per day.
 *
 * Single series on a single axis — the order count for each day rides in the
 * tooltip rather than a second y-scale. A table view carries the same numbers
 * for anyone who cannot use the hover layer.
 */
export function RevenueChart({ points }: { points: RevenuePoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();

  const values = points.map((point) => Number.parseFloat(point.revenue) || 0);
  const peak = Math.max(...values, 0);
  const top = niceMax(peak);
  const peakIndex = values.indexOf(peak);
  const totalOrders = points.reduce((sum, point) => sum + point.orders, 0);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="label text-muted">Revenue per day</h2>
          <p className="mt-1 text-xs text-muted">
            {points.length} days · {totalOrders} order{totalOrders === 1 ? "" : "s"} placed
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
        <div id={tableId} className="mt-5 max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-paper">
              <tr className="border-b border-line text-left">
                <th scope="col" className="label py-2 font-medium text-muted">Day</th>
                <th scope="col" className="label py-2 text-right font-medium text-muted">Orders</th>
                <th scope="col" className="label py-2 text-right font-medium text-muted">Revenue</th>
              </tr>
            </thead>
            <tbody className="[font-variant-numeric:tabular-nums]">
              {points.map((point) => (
                <tr key={point.day} className="border-b border-line/60 last:border-0">
                  <td className="py-2">{dayLabel(point.day)}</td>
                  <td className="py-2 text-right">{point.orders}</td>
                  <td className="py-2 text-right">{moneyExact(point.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <figure className="mt-6">
          <div className="relative flex gap-2 sm:gap-3">
            {/* y axis */}
            <div className="flex w-10 shrink-0 flex-col justify-between py-0 text-right text-[0.625rem] text-muted sm:w-14 [font-variant-numeric:tabular-nums]">
              <span>{money(top)}</span>
              <span>{money(top / 2)}</span>
              <span>0</span>
            </div>

            <div className="relative h-40 flex-1">
              {/* recessive hairline gridlines */}
              {[0, 50, 100].map((offset) => (
                <span
                  key={offset}
                  aria-hidden
                  className="absolute inset-x-0 border-t border-line"
                  style={{ top: `${offset}%` }}
                />
              ))}

              <div className="absolute inset-0 flex items-end justify-between gap-[2px]">
                {points.map((point, index) => {
                  const value = values[index];
                  const height = top ? (value / top) * 100 : 0;
                  const active = hover === index;
                  return (
                    <div
                      key={point.day}
                      className="group relative flex h-full flex-1 items-end justify-center"
                      onMouseEnter={() => setHover(index)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover(index)}
                      onBlur={() => setHover(null)}
                      onClick={() => setHover(hover === index ? null : index)}
                      tabIndex={0}
                      role="img"
                      aria-label={`${dayLabel(point.day)}: ${moneyExact(point.revenue)} from ${point.orders} orders`}
                    >
                      {/* hit target covers the full column, not just the bar */}
                      <span
                        className="absolute inset-0"
                        aria-hidden
                      />
                      <span
                        aria-hidden
                        className={`w-full max-w-6 rounded-t-[4px] transition-colors ${
                          active ? "bg-ink" : "bg-[var(--color-chart)]"
                        }`}
                        style={{ height: `${Math.max(height, value > 0 ? 1.5 : 0)}%` }}
                      />
                      {index === peakIndex && peak > 0 && !active ? (
                        <span className="absolute -top-5 whitespace-nowrap text-[0.625rem] text-muted">
                          {money(peak)}
                        </span>
                      ) : null}
                      {active ? (
                        <div
                          className={`pointer-events-none absolute bottom-full z-10 mb-2 w-32 border border-line bg-paper px-3 py-2 text-left shadow-sm sm:w-36 ${
                            index <= 1
                              ? "left-0"
                              : index >= points.length - 2
                                ? "right-0"
                                : ""
                          }`}
                        >
                          <p className="label text-muted">{dayLabel(point.day)}</p>
                          <p className="mt-1 text-sm text-ink [font-variant-numeric:tabular-nums]">
                            {moneyExact(point.revenue)}
                          </p>
                          <p className="text-xs text-muted">
                            {point.orders} order{point.orders === 1 ? "" : "s"}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* x axis: first, middle and last only — 14 labels would collide */}
          <div className="ml-12 mt-2 flex justify-between text-[0.625rem] text-muted sm:ml-[4.25rem]">
            <span>{points.length ? dayLabel(points[0].day) : ""}</span>
            <span>
              {points.length > 2 ? dayLabel(points[Math.floor(points.length / 2)].day) : ""}
            </span>
            <span>{points.length ? dayLabel(points[points.length - 1].day) : ""}</span>
          </div>
        </figure>
      )}
    </div>
  );
}
