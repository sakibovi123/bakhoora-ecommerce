"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  IconChevronLeft,
  IconPrinter,
  IconSave,
  IconSpinner,
} from "@/components/admin/icons";
import { Dropdown } from "@/components/admin/dropdown";
import { Require } from "@/components/admin/require";
import { useToast } from "@/components/admin/toast";
import {
  Button,
  Cell,
  ErrorNote,
  Field,
  LinkButton,
  PageHeader,
  Panel,
  Pill,
  Row,
  Spinner,
  Table,
  Textarea,
} from "@/components/admin/ui";
import { ApiError, adminApi } from "@/lib/admin/client";
import {
  NEXT_STATUSES,
  ORDER_STATUS_DOT,
  ORDER_STATUS_TONE,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_DOT,
  PAYMENT_STATUS_TONE,
  dateTime,
  moneyExact,
  titleCase,
} from "@/lib/admin/format";
import { useAuth } from "@/lib/auth";
import type { OrderStatus, PaymentStatus } from "@/lib/admin/types";
import { useResource } from "@/lib/admin/use-resource";

export default function OrderDetailPage() {
  return (
    <Require menu="orders">
      <OrderDetailScreen />
    </Require>
  );
}

function OrderDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const { notify } = useToast();

  const load = useCallback((auth: string) => adminApi.order(auth, id), [id]);
  const { data: order, error, loading, reload } = useResource(load, [id]);

  const [nextStatus, setNextStatus] = useState<OrderStatus | "">("");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | "">("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (order) setPaymentStatus(order.payment_status);
  }, [order]);

  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (loading && !order) return <Spinner label="Loading order" />;
  if (!order) return null;

  const moves = NEXT_STATUSES[order.status];
  const dirty =
    (nextStatus && nextStatus !== order.status) ||
    (paymentStatus && paymentStatus !== order.payment_status) ||
    note.trim().length > 0;

  async function save() {
    if (!token || !order) return;
    setSaving(true);
    try {
      await adminApi.updateOrder(token, order.id, {
        ...(nextStatus && nextStatus !== order.status ? { status: nextStatus } : {}),
        ...(paymentStatus && paymentStatus !== order.payment_status
          ? { payment_status: paymentStatus }
          : {}),
        ...(note.trim() ? { admin_note: note.trim() } : {}),
      });
      notify("Order updated");
      setNextStatus("");
      setNote("");
      reload();
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : "Could not update the order", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={order.order_number}
        subtitle={
          <>
            Placed {dateTime(order.created_at)} · paid by {titleCase(order.payment_method)}
          </>
        }
        actions={
          <>
            <LinkButton href={`/admin/orders/${order.id}/invoice`} tone="ghost">
              <IconPrinter />
              Invoice
            </LinkButton>
            <Link
              href="/admin/orders"
              className="label ml-2 inline-flex items-center gap-1.5 text-muted hover:text-ink"
            >
              <IconChevronLeft />
              All orders
            </Link>
          </>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Pill tone={ORDER_STATUS_TONE[order.status]} dot={ORDER_STATUS_DOT[order.status]}>{titleCase(order.status)}</Pill>
        <Pill tone={PAYMENT_STATUS_TONE[order.payment_status]} dot={PAYMENT_STATUS_DOT[order.payment_status]}>
          Payment: {titleCase(order.payment_status)}
        </Pill>
      </div>

      <div className="grid gap-3 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-3">
          <Panel title="Items" bodyClassName="p-0">
            <Table head={["Product", "Size", "SKU", "Unit", "Qty", "Line"]}>
              {order.items.map((item) => (
                <Row key={item.id}>
                  <Cell className="text-ink">{item.product_name}</Cell>
                  <Cell className="text-muted">{item.variant_name}</Cell>
                  <Cell className="font-mono text-xs text-muted">{item.sku}</Cell>
                  <Cell className="text-right [font-variant-numeric:tabular-nums]">
                    {moneyExact(item.unit_price)}
                  </Cell>
                  <Cell className="text-right [font-variant-numeric:tabular-nums]">
                    {item.quantity}
                  </Cell>
                  <Cell className="text-right [font-variant-numeric:tabular-nums]">
                    {moneyExact(item.line_total)}
                  </Cell>
                </Row>
              ))}
            </Table>
            <dl className="space-y-2 border-t border-line px-5 py-4 text-sm [font-variant-numeric:tabular-nums]">
              <Money label="Subtotal" value={order.subtotal} />
              <Money label="Shipping" value={order.shipping_fee} />
              {Number.parseFloat(order.discount_total) > 0 ? (
                <Money label="Discount" value={`-${order.discount_total}`} />
              ) : null}
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold text-ink">
                <dt>Total</dt>
                <dd>{moneyExact(order.total)}</dd>
              </div>
            </dl>
          </Panel>

          {order.payments.length ? (
            <Panel title="Payments" bodyClassName="p-0">
              <Table head={["Provider", "Reference", "Amount", "Status", "When"]}>
                {order.payments.map((payment) => (
                  <Row key={payment.id}>
                    <Cell className="text-ink">{titleCase(payment.provider)}</Cell>
                    <Cell className="font-mono text-xs text-muted">
                      {payment.reference ?? "—"}
                    </Cell>
                    <Cell className="text-right [font-variant-numeric:tabular-nums]">
                      {moneyExact(payment.amount)}
                    </Cell>
                    <Cell>
                      <Pill tone={PAYMENT_STATUS_TONE[payment.status]} dot={PAYMENT_STATUS_DOT[payment.status]}>
                        {titleCase(payment.status)}
                      </Pill>
                    </Cell>
                    <Cell className="text-muted">{dateTime(payment.created_at)}</Cell>
                  </Row>
                ))}
              </Table>
            </Panel>
          ) : null}
        </div>

        <div className="space-y-3">
          <Panel title="Ship to">
            <address className="space-y-0.5 text-sm not-italic leading-relaxed">
              <p className="text-ink">{order.recipient_name}</p>
              <p className="text-muted">{order.phone}</p>
              <p className="text-muted">{order.line1}</p>
              {order.line2 ? <p className="text-muted">{order.line2}</p> : null}
              <p className="text-muted">
                {order.city}
                {order.district ? `, ${order.district}` : ""}
                {order.postal_code ? ` ${order.postal_code}` : ""}
              </p>
              <p className="text-muted">{order.country}</p>
            </address>
            {order.customer_note ? (
              <div className="mt-4 border-t border-line pt-3">
                <p className="label text-muted">Customer note</p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink">{order.customer_note}</p>
              </div>
            ) : null}
          </Panel>

          <Panel title="Update">
            <div className="space-y-4">
              <Field
                label="Move to"
                hint={
                  moves.length
                    ? "Only the moves this order can legally make are listed."
                    : `An order that is ${order.status} cannot move any further.`
                }
              >
                <Dropdown
                  value={nextStatus}
                  disabled={moves.length === 0}
                  aria-label="Move the order to"
                  onChange={(next) => setNextStatus(next as OrderStatus | "")}
                  options={[
                    { value: "", label: `Keep ${titleCase(order.status)}` },
                    ...moves.map((value) => ({ value, label: titleCase(value) })),
                  ]}
                />
              </Field>

              <Field
                label="Payment"
                hint={
                  nextStatus === "cancelled" || nextStatus === "refunded"
                    ? "Cancelling or refunding puts the stock back automatically."
                    : undefined
                }
              >
                <Dropdown
                  value={paymentStatus}
                  aria-label="Payment status"
                  onChange={(next) => setPaymentStatus(next as PaymentStatus)}
                  options={PAYMENT_STATUSES.map((value) => ({
                    value,
                    label: titleCase(value),
                  }))}
                />
              </Field>

              <Field label="Add an internal note" hint="Only staff see this.">
                <Textarea
                  rows={3}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Called the customer to confirm the address…"
                />
              </Field>

              <Button onClick={save} disabled={!dirty || saving} className="w-full">
                {saving ? <IconSpinner /> : <IconSave />}
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Money({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted">
      <dt>{label}</dt>
      <dd className="text-ink">{moneyExact(value)}</dd>
    </div>
  );
}
