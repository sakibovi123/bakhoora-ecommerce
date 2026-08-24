"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import {
  IconChevronRight,
  IconFilter,
  IconPlus,
  IconSearch,
} from "@/components/admin/icons";
import { Dropdown } from "@/components/admin/dropdown";
import { Require } from "@/components/admin/require";
import {
  Cell,
  Empty,
  ErrorNote,
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
import { adminApi } from "@/lib/admin/client";
import {
  ORDER_STATUS_DOT,
  ORDER_STATUS_TONE,
  PAYMENT_STATUS_DOT,
  PAYMENT_STATUS_TONE,
  dateTime,
  money,
  titleCase,
} from "@/lib/admin/format";
import type { OrderStatus } from "@/lib/admin/types";
import { useResource } from "@/lib/admin/use-resource";

const STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
];

export default function OrdersPage() {
  return (
    <Require menu="orders">
      <OrdersScreen />
    </Require>
  );
}

function OrdersScreen() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(
    (token: string) =>
      adminApi.orders(token, { page, size: 20, status: status || null, search: query || null }),
    [page, status, query],
  );
  const { data, error, loading, reload } = useResource(load, [page, status, query]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        subtitle={data ? `${data.total} in total` : "Loading…"}
        actions={
          <LinkButton href="/admin/orders/new" tone="primary">
            <IconPlus />
            New order
          </LinkButton>
        }
      />

      <Panel tone="blue" bodyClassName="p-0">
        <form
          className="flex flex-wrap items-end gap-3 border-b border-line p-4"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setQuery(search.trim());
          }}
        >
          <div className="w-full min-w-0 sm:min-w-52 sm:flex-1">
            <SearchInput
              placeholder="Search by order number…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search orders"
            />
          </div>
          <IconFilter className="hidden text-muted sm:block" />
          <Dropdown
            className="w-full sm:w-44"
            aria-label="Filter by status"
            value={status}
            onChange={(next) => {
              setPage(1);
              setStatus(next as OrderStatus | "");
            }}
            options={[
              { value: "", label: "All statuses" },
              ...STATUSES.map((value) => ({ value, label: titleCase(value) })),
            ]}
          />
          <button
            type="submit"
            className="label flex min-h-11 items-center gap-2 border border-line bg-paper px-4 py-2 text-[0.6875rem] hover:bg-paper-2"
          >
            <IconSearch />
            Search
          </button>
        </form>

        {error ? (
          <div className="p-5">
            <ErrorNote message={error} onRetry={reload} />
          </div>
        ) : loading && !data ? (
          <div className="px-5">
            <Spinner label="Loading orders" />
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="p-5">
            <Empty
              title="No orders here"
              body={
                query || status
                  ? "Nothing matches that filter."
                  : "Orders will show up as customers check out."
              }
            />
          </div>
        ) : (
          <>
            <Table head={["Order", "Placed", "Status", "Payment", "Total", ""]}>
              {data.items.map((order) => (
                <Row key={order.id}>
                  <Cell>
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="link-underline font-medium text-ink"
                    >
                      {order.order_number}
                    </Link>
                  </Cell>
                  <Cell className="whitespace-nowrap text-muted">
                    {dateTime(order.created_at)}
                  </Cell>
                  <Cell>
                    <Pill tone={ORDER_STATUS_TONE[order.status]} dot={ORDER_STATUS_DOT[order.status]}>{titleCase(order.status)}</Pill>
                  </Cell>
                  <Cell>
                    <Pill tone={PAYMENT_STATUS_TONE[order.payment_status]} dot={PAYMENT_STATUS_DOT[order.payment_status]}>
                      {titleCase(order.payment_status)}
                    </Pill>
                  </Cell>
                  <Cell className="whitespace-nowrap text-right [font-variant-numeric:tabular-nums]">
                    {money(order.total)}
                  </Cell>
                  <Cell className="text-right">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="label inline-flex items-center gap-1.5 text-muted hover:text-ink"
                    >
                      Open
                      <IconChevronRight />
                    </Link>
                  </Cell>
                </Row>
              ))}
            </Table>
            <Pagination
              page={data.page}
              pages={data.pages}
              total={data.total}
              noun="order"
              onPage={setPage}
            />
          </>
        )}
      </Panel>
    </div>
  );
}
