"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { useToast } from "@/components/admin/toast";
import {
  Cell,
  Empty,
  ErrorNote,
  LinkButton,
  PageHeader,
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
  IconArrowDown,
  IconArrowUp,
  IconAlert,
  IconPlus,
} from "@/components/admin/icons";
import { ApiError, adminApi } from "@/lib/admin/client";
import { count, money } from "@/lib/admin/format";
import { useAuth } from "@/lib/auth";
import type { Combo, CoverageRow } from "@/lib/admin/types";
import { useResource } from "@/lib/admin/use-resource";

export default function CombosPage() {
  return (
    <Require menu="combos">
      <CombosScreen />
    </Require>
  );
}

type StateFilter = "" | "true" | "false";

function CombosScreen() {
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [state, setState] = useState<StateFilter>("");

  const load = useCallback(
    (token: string) =>
      adminApi.combos(token, {
        search: search.trim() || null,
        active: state === "" ? null : state === "true",
      }),
    [search, state],
  );
  const { data, error, loading, reload } = useResource(load, [search, state]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Combos"
        subtitle="Bundles of whole perfumes at one flat price. A combo holds no stock of its own — what can be sold is worked out from the bottles it is made of."
        actions={
          can("combos", "manage") ? (
            <LinkButton href="/admin/combos/new" tone="primary">
              <IconPlus />
              New combo
            </LinkButton>
          ) : null
        }
      />

      <Panel
        tone="amber"
        title="All combos"
        bodyClassName="p-0"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              className="w-48"
              placeholder="Search combos…"
              aria-label="Search combos"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Dropdown
              className="w-36"
              aria-label="Filter by state"
              value={state}
              onChange={(next) => setState(next as StateFilter)}
              options={[
                { value: "", label: "Live and parked" },
                { value: "true", label: "Live only" },
                { value: "false", label: "Parked only" },
              ]}
            />
          </div>
        }
      >
        {error ? (
          <div className="p-5">
            <ErrorNote message={error} onRetry={reload} />
          </div>
        ) : loading && !data ? (
          <div className="px-5">
            <Spinner label="Loading combos" />
          </div>
        ) : !data || data.length === 0 ? (
          <div className="p-5">
            <Empty
              title={search || state ? "Nothing matches" : "No combos yet"}
              body={
                search || state
                  ? "Try a different search, or clear the filter."
                  : "Build one from perfumes already in the catalogue."
              }
              action={
                can("combos", "manage") && !search && !state ? (
                  <LinkButton href="/admin/combos/new" tone="primary">
                    <IconPlus />
                    New combo
                  </LinkButton>
                ) : null
              }
            />
          </div>
        ) : (
          <Table head={["Order", "Combo", "Contents", "Sizes", "Availability", "State"]}>
            {data.map((combo, index) => (
              <ComboRow
                key={combo.id}
                combo={combo}
                all={data}
                index={index}
                canManage={can("combos", "manage")}
                onDone={reload}
              />
            ))}
          </Table>
        )}
      </Panel>

      <CoveragePanel />
    </div>
  );
}

function ComboRow({
  combo,
  all,
  index,
  canManage,
  onDone,
}: {
  combo: Combo;
  all: Combo[];
  index: number;
  canManage: boolean;
  onDone: () => void;
}) {
  const { token } = useAuth();
  const { notify } = useToast();

  async function move(direction: -1 | 1) {
    if (!token) return;
    const target = index + direction;
    if (target < 0 || target >= all.length) return;
    const reordered = [...all];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    try {
      await adminApi.reorderCombos(
        token,
        reordered.map((entry, position) => ({ id: entry.id, position })),
      );
      onDone();
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : "Could not reorder", "error");
    }
  }

  // The best any size can do right now. A combo out of stock at 6ml but fine at
  // 10ml is still a combo the shop can sell, and the row should say so.
  const bestSets = Math.max(0, ...combo.sizes.map((size) => size.max_sets));

  return (
    <Row>
      <Cell className="md:w-20">
        {canManage ? (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => move(-1)}
              disabled={index === 0}
              aria-label={`Move ${combo.name} up`}
              className="flex size-9 items-center justify-center border border-line text-muted disabled:opacity-30 hover:enabled:bg-paper-2"
            >
              <IconArrowUp className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => move(1)}
              disabled={index === all.length - 1}
              aria-label={`Move ${combo.name} down`}
              className="flex size-9 items-center justify-center border border-line text-muted disabled:opacity-30 hover:enabled:bg-paper-2"
            >
              <IconArrowDown className="size-3.5" />
            </button>
          </div>
        ) : (
          <span className="text-xs text-muted">{index + 1}</span>
        )}
      </Cell>

      <Cell>
        <Link href={`/admin/combos/${combo.id}`} className="link-underline font-medium text-ink">
          {combo.name}
        </Link>
        {combo.use_case ? (
          <span className="label mt-0.5 block text-muted">{combo.use_case}</span>
        ) : null}
      </Cell>

      <Cell className="max-w-xs">
        <span className="text-xs text-muted">
          {combo.products.length} perfume{combo.products.length === 1 ? "" : "s"} ·{" "}
          {combo.products.map((entry) => entry.name).join(", ")}
        </span>
      </Cell>

      <Cell>
        <span className="flex flex-wrap gap-1">
          {combo.sizes.length === 0 ? (
            <span className="text-xs text-muted">No sizes</span>
          ) : (
            combo.sizes.map((size) => (
              <Pill
                key={size.id}
                tone={size.is_active ? "bg-paper-2 text-ink" : "bg-paper-2 text-muted/60"}
              >
                {size.size_ml}ml · {money(size.price)}
              </Pill>
            ))
          )}
        </span>
      </Cell>

      <Cell>
        {bestSets > 0 ? (
          <span className="text-sm text-ink">{count(bestSets)} can be made</span>
        ) : (
          <span className="label inline-flex items-center gap-1.5 text-accent">
            <IconAlert />
            Nothing in stock
          </span>
        )}
      </Cell>

      <Cell>
        {combo.is_active ? (
          <Pill tone="bg-ink text-paper">Live</Pill>
        ) : (
          <Pill tone="bg-paper-2 text-muted">Parked</Pill>
        )}
      </Cell>
    </Row>
  );
}

/* --------------------------------------------------------- stock coverage */

/**
 * Which perfumes the campaign leans on, and which it has left out.
 *
 * A stock-clearing campaign is only doing its job if the oils that need to move
 * are the ones appearing in combos, so this is the screen that says whether the
 * twelve bundles actually cover the shelf — and `lowest_stock` is the figure
 * that decides how many of them can ship at all.
 */
function CoveragePanel() {
  const load = useCallback((token: string) => adminApi.comboStockCoverage(token), []);
  const { data, error, loading, reload } = useResource(load, []);

  return (
    <Panel tone="amber" title="Stock coverage" bodyClassName="p-0">
      {error ? (
        <div className="p-5">
          <ErrorNote message={error} onRetry={reload} />
        </div>
      ) : loading && !data ? (
        <div className="px-5">
          <Spinner label="Working out coverage" />
        </div>
      ) : !data || data.total_combos === 0 ? (
        <div className="p-5">
          <Empty
            title="Nothing to cover yet"
            body="Build a combo and this fills in with how much of the campaign leans on each perfume."
          />
        </div>
      ) : (
        <>
          <Table head={["Perfume", "In combos", "Coverage", "Lowest stock", "Which combos"]}>
            {data.rows.map((row) => (
              <CoverageRowView key={row.product_id} row={row} total={data.total_combos} />
            ))}
          </Table>
          <Uncovered rows={data.uncovered} />
        </>
      )}
    </Panel>
  );
}

function CoverageRowView({ row, total }: { row: CoverageRow; total: number }) {
  return (
    <Row>
      <Cell>
        <Link
          href={`/admin/products?search=${encodeURIComponent(row.product_name)}`}
          className="link-underline text-ink"
        >
          {row.product_name}
        </Link>
        {row.brand ? <span className="block text-xs text-muted">{row.brand}</span> : null}
      </Cell>
      <Cell className="text-sm text-ink">
        {row.times_included} of {total}
      </Cell>
      <Cell className="md:w-40">
        <span className="flex items-center gap-2">
          <span aria-hidden className="h-1.5 w-20 bg-paper-2">
            <span
              className="block h-full"
              style={{
                width: `${Math.min(100, row.coverage_pct)}%`,
                backgroundColor: "var(--color-amber)",
              }}
            />
          </span>
          <span className="label text-muted">{Math.round(row.coverage_pct)}%</span>
        </span>
      </Cell>
      <Cell>
        {row.lowest_stock === null ? (
          <span className="text-xs text-muted">—</span>
        ) : row.lowest_stock <= 0 ? (
          <span className="label text-accent">Out of stock</span>
        ) : (
          <span className="text-sm text-ink">{count(row.lowest_stock)}</span>
        )}
      </Cell>
      <Cell className="max-w-xs">
        <span className="text-xs text-muted">{row.combo_names.join(", ")}</span>
      </Cell>
    </Row>
  );
}

function Uncovered({ rows }: { rows: CoverageRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="border-t border-line p-4 sm:p-5">
      <p className="label text-muted">In no combo at all · {rows.length}</p>
      <p className="mt-1 text-xs text-muted">
        Live perfumes the campaign has not picked up. If the point is to clear stock, these are
        the gaps.
      </p>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {rows.map((row) => (
          <li key={row.product_id}>
            <Pill tone="bg-paper-2 text-muted">{row.product_name}</Pill>
          </li>
        ))}
      </ul>
    </div>
  );
}
