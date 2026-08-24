"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Bottle } from "@/components/bottle";
import { QuantityStepper } from "@/components/quantity-stepper";
import { FREE_SHIPPING_THRESHOLD } from "@/lib/catalog";
import { useCart } from "@/lib/cart-context";
import { formatPrice } from "@/lib/format";

export function CartDrawer() {
  const { isOpen, close, lines, subtotal, shipping, total, setQuantity, remove } = useCart();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const remaining = FREE_SHIPPING_THRESHOLD - subtotal;

  return (
    <div
      className={`fixed inset-0 z-90 ${isOpen ? "" : "pointer-events-none"}`}
      aria-hidden={!isOpen}
    >
      <button
        tabIndex={isOpen ? 0 : -1}
        aria-label="Close cart"
        onClick={close}
        className={`absolute inset-0 bg-night/40 transition-opacity duration-500 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
      />

      <aside
        role="dialog"
        aria-label="Shopping bag"
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-paper transition-transform duration-600 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-center justify-between border-b border-line px-6 py-6">
          <p className="label">Your bag ({lines.length})</p>
          <button onClick={close} className="label link-underline">
            Close
          </button>
        </header>

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
            <p className="font-display text-3xl">Nothing in here yet.</p>
            <p className="max-w-xs text-sm text-muted">
              Pick a blend and it will show up here. Free delivery once you cross{" "}
              {formatPrice(FREE_SHIPPING_THRESHOLD)}.
            </p>
            <Link href="/shop" onClick={close} className="label bg-ink px-7 py-4 text-paper">
              Browse fragrances
            </Link>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-line overflow-y-auto px-6">
              {lines.map((line) => (
                <li key={line.variantId} className="flex gap-4 py-6">
                  <Link
                    href={`/shop/${line.product.slug}`}
                    onClick={close}
                    className="shrink-0 bg-paper-2"
                  >
                    <Bottle
                      tone={line.product.tone}
                      shape={line.product.category === "attar" ? "vial" : "flacon"}
                      className="size-24"
                    />
                  </Link>

                  <div className="flex flex-1 flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link
                          href={`/shop/${line.product.slug}`}
                          onClick={close}
                          className="link-underline font-display text-xl leading-tight"
                        >
                          {line.product.name}
                        </Link>
                        <p className="label mt-1 text-muted">{line.variant.name}</p>
                      </div>
                      <p className="tabular-nums">{formatPrice(line.lineTotal)}</p>
                    </div>

                    <div className="mt-auto flex items-center justify-between">
                      <QuantityStepper
                        size="sm"
                        value={line.quantity}
                        max={line.variant.stock}
                        onChange={(next) => setQuantity(line.variantId, next)}
                      />
                      <button
                        onClick={() => remove(line.variantId)}
                        className="label text-muted link-underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <footer className="border-t border-line px-6 py-6">
              {remaining > 0 ? (
                <p className="label mb-5 text-accent">
                  {formatPrice(remaining)} more for free delivery
                </p>
              ) : (
                <p className="label mb-5 text-accent">Free delivery unlocked</p>
              )}

              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">Subtotal</dt>
                  <dd className="tabular-nums">{formatPrice(subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Delivery</dt>
                  <dd className="tabular-nums">
                    {shipping === 0 ? "Free" : formatPrice(shipping)}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-line pt-3 text-base">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{formatPrice(total)}</dd>
                </div>
              </dl>

              <Link
                href="/checkout"
                onClick={close}
                className="label mt-6 flex w-full items-center justify-center bg-ink px-7 py-4 text-paper transition-colors hover:bg-ink-2"
              >
                Checkout →
              </Link>
              <Link
                href="/cart"
                onClick={close}
                className="label mt-3 flex w-full items-center justify-center border border-line px-7 py-4"
              >
                View full bag
              </Link>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}
