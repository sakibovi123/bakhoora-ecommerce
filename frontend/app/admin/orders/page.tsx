"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  IconChevronRight,
  IconFilter,
  IconPlus,
  IconSearch,
  IconSpinner,
  IconTrash,
} from "@/components/admin/icons";
import { useConfirm } from "@/components/admin/dialog";
import { Dropdown } from "@/components/admin/dropdown";
import { Require } from "@/components/admin/require";
import { useToast } from "@/components/admin/toast";
import {
  Button,
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
import { ApiError, adminApi } from "@/lib/admin/client";
import {
  ORDER_STATUS_DOT,
  ORDER_STATUS_TONE,
  PAYMENT_STATUS_DOT,
  PAYMENT_STATUS_TONE,
  dateTime,
  money,
  titleCase,
} from "@/lib/admin/format";
import { useAuth } from "@/lib/auth";
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

  const { token, can } = useAuth();
  const { notify } = useToast();
  const confirm = useConfirm();
  const canManage = can("orders", "manage");

  const load = useCallback(
    (token: string) =>
      adminApi.orders(token, { page, size: 20, status: status || null, search: query || null }),
    [page, status, query],
  );
  const { data, error, loading, reload } = useResource(load, [page, status, query]);

  // Ticks are per page of results. Carrying them across a page turn or a
  // filter change would mean deleting rows the operator can no longer see.
  const [picked, setPicked] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => setPicked([]), [page, status, query]);

  const rows = data?.items ?? [];
  const allPicked = rows.length > 0 && picked.length === rows.length;

  function toggle(id: string) {
    setPicked((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  async function removePicked() {
    if (!token || picked.length === 0) return;
    const chosen = rows.filter((order) => picked.includes(order.id));
    const numbers = chosen.map((order) => order.order_number);
    const many = chosen.length > 1;
    const them = many ? "them" : "it";
    const sure = await confirm({
      title: many ? `Delete ${chosen.length} orders?` : `Delete ${numbers[0]}?`,
      body: (
        <>
          <p>
            {`${many ? `These ${chosen.length} orders` : "This order"} and everything ` +
              `recorded against ${them} — items and payments — will be erased and stop ` +
              `counting in the sales reports. Stock still reserved goes back on the shelf. ` +
              `To keep the record instead, move ${them} to Cancelled.`}
          </p>
          {/* Naming the rows is the last chance to notice a mis-tick, so the
              dialog prints them rather than only a count. */}
          <p className="mt-3 font-mono text-xs leading-relaxed text-muted">
            {numbers.slice(0, 8).join(", ")}
            {numbers.length > 8 ? ` and ${numbers.length - 8} more` : ""}
          </p>
        </>
      ),
      confirmLabel: many ? `Delete ${chosen.length} orders` : "Delete order",
      tone: "danger",
    });
    if (!sure) return;

    setDeleting(true);
    try {
      const { deleted } = await adminApi.deleteOrders(token, picked);
      notify(deleted === 1 ? "1 order deleted" : `${deleted} orders deleted`);
      setPicked([]);
      // The last row on a page that is not the first: stepping back beats
      // landing on an empty page with a Previous button as the only way out.
      if (deleted >= rows.length && page > 1) setPage(page - 1);
      else reload();
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : "Could not delete", "error");
    } finally {
      setDeleting(false);
    }
  }

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
            {/* Ticking rows is a manager's job — a read-only role gets the list
                without a column of checkboxes that lead nowhere. */}
            {canManage ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-line px-4 py-3">
                <label className="flex cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    className="size-5 accent-[var(--color-ink)] md:size-4"
                    checked={allPicked}
                    ref={(node) => {
                      // Half a page ticked reads as neither on nor off.
                      if (node) node.indeterminate = picked.length > 0 && !allPicked;
                    }}
                    onChange={(event) =>
                      setPicked(event.target.checked ? rows.map((order) => order.id) : [])
                    }
                    aria-label="Select every order on this page"
                  />
                  <span className="label text-muted">
                    {picked.length ? `${picked.length} selected` : "Select all"}
                  </span>
                </label>
                {picked.length ? (
                  <div className="flex items-center gap-3">
                    <Button tone="danger" onClick={removePicked} disabled={deleting}>
                      {deleting ? <IconSpinner /> : <IconTrash />}
                      {deleting ? "Deleting…" : "Delete selected"}
                    </Button>
                    <button
                      type="button"
                      className="label text-muted hover:text-ink"
                      onClick={() => setPicked([])}
                      disabled={deleting}
                    >
                      Clear
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            <Table
              head={[
                ...(canManage ? [""] : []),
                "Order",
                "Customer",
                "Placed",
                "Status",
                "Payment",
                "Total",
                "Due",
                "",
              ]}
            >
              {data.items.map((order) => (
                <Row key={order.id}>
                  {canManage ? (
                    <Cell className="w-10">
                      <input
                        type="checkbox"
                        className="size-5 accent-[var(--color-ink)] md:size-4"
                        checked={picked.includes(order.id)}
                        onChange={() => toggle(order.id)}
                        aria-label={`Select ${order.order_number}`}
                      />
                    </Cell>
                  ) : null}
                  <Cell>
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="link-underline font-medium text-ink"
                    >
                      {order.order_number}
                    </Link>
                  </Cell>
                  <Cell className="text-ink">{order.recipient_name}</Cell>
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
                  {/* An outstanding balance is the one number worth scanning a
                      list of orders for, so it is a column rather than
                      something you have to open each order to find. */}
                  <Cell className="whitespace-nowrap text-right [font-variant-numeric:tabular-nums]">
                    {Number.parseFloat(order.amount_due) > 0 ? (
                      <span className="font-semibold text-accent">{money(order.amount_due)}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
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
