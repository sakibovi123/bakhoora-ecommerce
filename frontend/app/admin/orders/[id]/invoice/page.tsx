"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback } from "react";

import { IconChevronLeft } from "@/components/admin/icons";
import { Require } from "@/components/admin/require";
import { Button, ErrorNote, Spinner } from "@/components/admin/ui";
import { adminApi } from "@/lib/admin/client";
import { moneyExact, shortDate, titleCase } from "@/lib/admin/format";
import { useResource } from "@/lib/admin/use-resource";

/** Edit these to whatever belongs on the shop's paperwork. */
const SHOP = {
  name: "Bakhoora",
  tagline: "Attar, oud and eau de parfum",
  address: ["Dhaka, Bangladesh"],
  contact: "hello@bakhoora.bd",
};

export default function InvoicePage() {
  return (
    <Require menu="orders">
      <InvoiceScreen />
    </Require>
  );
}

function InvoiceScreen() {
  const { id } = useParams<{ id: string }>();
  const load = useCallback((token: string) => adminApi.order(token, id), [id]);
  const { data: order, error, loading, reload } = useResource(load, [id]);

  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (loading && !order) return <Spinner label="Loading invoice" />;
  if (!order) return null;

  const discount = Number.parseFloat(order.discount_total) > 0;

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/admin/orders/${order.id}`}
          className="label inline-flex items-center gap-1.5 text-muted hover:text-ink"
        >
          <IconChevronLeft />
          Back to the order
        </Link>
        <Button onClick={() => window.print()}>Print invoice</Button>
      </div>

      <article className="invoice-sheet mx-auto w-full max-w-[210mm] border border-line bg-paper p-8 sm:p-12">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-ink pb-6">
          <div>
            <p className="font-[family-name:var(--font-display)] text-3xl leading-none">
              {SHOP.name}
            </p>
            <p className="mt-1 text-sm text-muted">{SHOP.tagline}</p>
            <address className="mt-3 text-sm not-italic leading-relaxed text-muted">
              {SHOP.address.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
              <span className="block">{SHOP.contact}</span>
            </address>
          </div>

          <div className="text-right">
            <p className="label text-muted">Invoice</p>
            <p className="mt-1 font-mono text-lg text-ink">{order.order_number}</p>
            <p className="mt-2 text-sm text-muted">{shortDate(order.created_at)}</p>
            <p className="mt-3 text-sm">
              <span className="text-muted">Status </span>
              <span className="text-ink">{titleCase(order.status)}</span>
            </p>
            <p className="text-sm">
              <span className="text-muted">Payment </span>
              <span className="text-ink">
                {titleCase(order.payment_status)} · {titleCase(order.payment_method)}
              </span>
            </p>
          </div>
        </header>

        <section className="mt-6">
          <p className="label text-muted">Bill to</p>
          <address className="mt-2 text-sm not-italic leading-relaxed">
            <span className="block text-ink">{order.recipient_name}</span>
            <span className="block text-muted">{order.phone}</span>
            <span className="block text-muted">{order.line1}</span>
            {order.line2 ? <span className="block text-muted">{order.line2}</span> : null}
            <span className="block text-muted">
              {order.city}
              {order.district ? `, ${order.district}` : ""}
              {order.postal_code ? ` ${order.postal_code}` : ""}
            </span>
            <span className="block text-muted">{order.country}</span>
          </address>
        </section>

        <table className="mt-8 w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-line">
              <th scope="col" className="label py-2 text-left font-medium text-muted">
                Item
              </th>
              <th scope="col" className="label py-2 text-left font-medium text-muted">
                SKU
              </th>
              <th scope="col" className="label py-2 text-right font-medium text-muted">
                Unit
              </th>
              <th scope="col" className="label py-2 text-right font-medium text-muted">
                Qty
              </th>
              <th scope="col" className="label py-2 text-right font-medium text-muted">
                Amount
              </th>
            </tr>
          </thead>
          <tbody className="[font-variant-numeric:tabular-nums]">
            {order.items.map((item) => (
              <tr key={item.id} className="border-b border-line/60">
                <td className="py-2.5 pr-3 text-ink">
                  {item.product_name}
                  <span className="text-muted"> · {item.variant_name}</span>
                </td>
                <td className="py-2.5 pr-3 font-mono text-xs text-muted">{item.sku}</td>
                <td className="py-2.5 text-right">{moneyExact(item.unit_price)}</td>
                <td className="py-2.5 text-right">{item.quantity}</td>
                <td className="py-2.5 text-right">{moneyExact(item.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 flex justify-end">
          <dl className="w-full max-w-xs space-y-2 text-sm [font-variant-numeric:tabular-nums]">
            <div className="flex justify-between text-muted">
              <dt>Subtotal</dt>
              <dd className="text-ink">{moneyExact(order.subtotal)}</dd>
            </div>
            <div className="flex justify-between text-muted">
              <dt>Shipping</dt>
              <dd className="text-ink">{moneyExact(order.shipping_fee)}</dd>
            </div>
            {discount ? (
              <div className="flex justify-between text-muted">
                <dt>Discount</dt>
                <dd className="text-ink">−{moneyExact(order.discount_total)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-ink pt-2 text-base font-semibold text-ink">
              <dt>Total</dt>
              <dd>{moneyExact(order.total)}</dd>
            </div>
          </dl>
        </div>

        {order.customer_note ? (
          <section className="mt-8 border-t border-line pt-4">
            <p className="label text-muted">Note</p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink">{order.customer_note}</p>
          </section>
        ) : null}

        <footer className="mt-10 border-t border-line pt-4 text-xs leading-relaxed text-muted">
          Thank you for shopping with {SHOP.name}. Prices are in {order.currency}. For anything
          at all, reply to {SHOP.contact} quoting {order.order_number}.
        </footer>
      </article>
    </div>
  );
}
