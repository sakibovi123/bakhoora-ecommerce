"use client";

import Link from "next/link";
import { useCallback } from "react";

import { Require } from "@/components/admin/require";
import {
  IconAlert,
  IconChevronRight,
  IconCustomers,
  IconOrders,
  IconProducts,
  IconStock,
} from "@/components/admin/icons";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { StatTile, compact } from "@/components/admin/stat-tile";
import {
  Cell,
  Empty,
  ErrorNote,
  LinkButton,
  PageHeader,
  Panel,
  Pill,
  Row,
  Spinner,
  Table,
} from "@/components/admin/ui";
import { adminApi } from "@/lib/admin/client";
import {
  ORDER_STATUS_DOT,
  ORDER_STATUS_TONE,
  dateTime,
  money,
  titleCase,
} from "@/lib/admin/format";
import { useResource } from "@/lib/admin/use-resource";

export default function DashboardPage() {
  return (
    <Require menu="dashboard">
      <DashboardScreen />
    </Require>
  );
}

function DashboardScreen() {
  const load = useCallback((token: string) => adminApi.dashboard(token, 14), []);
  const { data, error, loading, reload } = useResource(load, []);

  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (loading && !data) return <Spinner label="Loading dashboard" />;
  if (!data) return null;

  const { counters, revenue_series, top_products, recent_orders, low_stock } = data;
  const topUnits = Math.max(...top_products.map((p) => p.units), 1);

  return (
    <div className="space-y-7">
      <PageHeader
        title="Dashboard"
        subtitle="Everything that moved in the last two weeks."
        actions={
          <LinkButton href="/admin/orders">
            All orders
            <IconChevronRight />
          </LinkButton>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          hero
          tone="green"
          icon={IconOrders}
          label="Revenue"
          value={money(counters.revenue)}
          note={`Confirmed and beyond · ${counters.currency}`}
        />
        <StatTile
          tone="blue"
          icon={IconOrders}
          label="Orders"
          value={compact(counters.total_orders)}
          note={
            <span className="flex items-center gap-1.5">
              <IconCustomers className="size-3.5" />
              {counters.total_customers} customer{counters.total_customers === 1 ? "" : "s"}
            </span>
          }
        />
        <StatTile
          icon={counters.pending_orders ? IconAlert : IconOrders}
          label="Awaiting confirmation"
          value={compact(counters.pending_orders)}
          note={counters.pending_orders ? "Needs a decision" : "Nothing waiting"}
          tone={counters.pending_orders ? "alert" : "blue"}
        />
        <StatTile
          icon={counters.low_stock_variants ? IconAlert : IconStock}
          label="Low stock sizes"
          value={compact(counters.low_stock_variants)}
          note={`${counters.active_products} active product${counters.active_products === 1 ? "" : "s"}`}
          tone={counters.low_stock_variants ? "alert" : "amber"}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-[2fr_1fr]">
        <Panel tone="green" bodyClassName="p-4 sm:p-5">
          <RevenueChart points={revenue_series} />
        </Panel>

        <Panel
          tone="amber"
          title={
            <span className="flex items-center gap-2">
              <IconProducts className="text-[var(--color-amber)]" />
              Best sellers
            </span>
          }
          bodyClassName="p-5"
        >
          {top_products.length === 0 ? (
            <p className="py-6 text-sm text-muted">No confirmed sales yet.</p>
          ) : (
            <ul className="space-y-4">
              {top_products.map((product) => (
                <li key={product.product_name}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate text-ink">
                      {product.product_id ? (
                        <Link
                          href={`/admin/products/${product.product_id}`}
                          className="link-underline"
                        >
                          {product.product_name}
                        </Link>
                      ) : (
                        product.product_name
                      )}
                    </span>
                    <span className="shrink-0 text-muted [font-variant-numeric:tabular-nums]">
                      {product.units} sold
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3">
                    <div className="h-1.5 flex-1 bg-[var(--color-amber-soft)]">
                      <div
                        className="h-full bg-[var(--color-amber)]"
                        style={{ width: `${(product.units / topUnits) * 100}%` }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right text-xs text-muted [font-variant-numeric:tabular-nums]">
                      {money(product.revenue)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel
          tone="blue"
          title={
            <span className="flex items-center gap-2">
              <IconOrders className="text-[var(--color-blue)]" />
              Recent orders
            </span>
          }
          bodyClassName="p-0"
          actions={
            <Link
              href="/admin/orders"
              className="label inline-flex items-center gap-1.5 text-muted hover:text-ink"
            >
              See all
              <IconChevronRight />
            </Link>
          }
        >
          {recent_orders.length === 0 ? (
            <div className="p-5">
              <Empty title="No orders yet" body="They will appear here the moment one lands." />
            </div>
          ) : (
            <Table head={["Order", "Placed", "Status", "Total"]}>
              {recent_orders.map((order) => (
                <Row key={order.id}>
                  <Cell>
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="link-underline font-medium text-ink"
                    >
                      {order.order_number}
                    </Link>
                  </Cell>
                  <Cell className="text-muted">{dateTime(order.created_at)}</Cell>
                  <Cell>
                    <Pill tone={ORDER_STATUS_TONE[order.status]} dot={ORDER_STATUS_DOT[order.status]}>{titleCase(order.status)}</Pill>
                  </Cell>
                  <Cell className="text-right [font-variant-numeric:tabular-nums]">
                    {money(order.total)}
                  </Cell>
                </Row>
              ))}
            </Table>
          )}
        </Panel>

        <Panel
          tone="amber"
          title={
            <span className="flex items-center gap-2">
              <IconAlert className="text-accent" />
              Running low
            </span>
          }
          bodyClassName="p-0"
          actions={
            <Link
              href="/admin/products?low_stock=true"
              className="label inline-flex items-center gap-1.5 text-muted hover:text-ink"
            >
              <IconStock />
              Restock
            </Link>
          }
        >
          {low_stock.length === 0 ? (
            <div className="p-5">
              <Empty title="Everything is stocked" body="No size is below the threshold." />
            </div>
          ) : (
            <Table head={["Product", "Size", "SKU", "Left"]}>
              {low_stock.map((variant) => (
                <Row key={variant.variant_id}>
                  <Cell>
                    <Link
                      href={`/admin/products/${variant.product_id}`}
                      className="link-underline text-ink"
                    >
                      {variant.product_name}
                    </Link>
                  </Cell>
                  <Cell className="text-muted">{variant.size_ml}ml</Cell>
                  <Cell className="font-mono text-xs text-muted">{variant.sku}</Cell>
                  <Cell className="text-right">
                    <span
                      className={`[font-variant-numeric:tabular-nums] ${
                        variant.stock_quantity === 0 ? "text-accent" : "text-ink"
                      }`}
                    >
                      {variant.stock_quantity}
                    </span>
                  </Cell>
                </Row>
              ))}
            </Table>
          )}
        </Panel>
      </div>
    </div>
  );
}
