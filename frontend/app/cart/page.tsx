"use client";

import Link from "next/link";

import { CartLineThumb } from "@/components/cart-line-thumb";
import { QuantityStepper } from "@/components/quantity-stepper";
import { ButtonLink } from "@/components/ui";
import { useCart } from "@/lib/cart-context";
import { useMoney, useShop } from "@/lib/shop-settings";

export default function CartPage() {
  const { lines, subtotal, shipping, total, setQuantity, remove, clear, isReady } = useCart();
  const shop = useShop();
  const money = useMoney();

  if (!isReady) {
    return <div className="shell py-32" aria-busy />;
  }

  if (lines.length === 0) {
    return (
      <section className="shell py-24 text-center md:py-40">
        <p className="label text-muted">Your bag</p>
        <h1 className="display-md mt-7">Empty, for now.</h1>
        <p className="mx-auto mt-6 max-w-sm leading-relaxed text-muted">
          Nothing has been added yet.
          {shop.freeDeliveryThreshold !== null ? (
            <> Free delivery starts at {money(shop.freeDeliveryThreshold)}.</>
          ) : null}
        </p>
        <div className="mt-10 flex justify-center">
          <ButtonLink href="/shop">Browse fragrances</ButtonLink>
        </div>
      </section>
    );
  }

  return (
    <section className="shell py-14 md:py-20">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="label text-muted">Your bag</p>
          <h1 className="display-md mt-6">
            {lines.length} {lines.length === 1 ? "item" : "items"}.
          </h1>
        </div>
        <button onClick={clear} className="label link-underline text-muted">
          Clear bag
        </button>
      </div>

      <div className="mt-14 grid gap-14 lg:grid-cols-[1.6fr_1fr] lg:gap-16">
        <ul className="border-t border-line">
          {lines.map((line) => (
            <li
              key={line.variantId}
              className="grid grid-cols-[6rem_1fr] gap-6 border-b border-line py-8 sm:grid-cols-[8rem_1fr]"
            >
              <Link href={`/shop/${line.productSlug}`} className="bg-paper-2">
                <CartLineThumb line={line} className="aspect-square w-full" />
              </Link>

              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <Link
                      href={`/shop/${line.productSlug}`}
                      className="link-underline font-display text-2xl leading-tight"
                    >
                      {line.name}
                    </Link>
                    <p className="label mt-2 text-muted">{line.variantName}</p>
                    {line.brand ? <p className="mt-2 text-sm text-muted">{line.brand}</p> : null}
                  </div>
                  <p className="tabular-nums">{money(line.lineTotal)}</p>
                </div>

                <div className="mt-auto flex items-center justify-between">
                  <QuantityStepper
                    value={line.quantity}
                    max={line.stock}
                    onChange={(next) => setQuantity(line.variantId, next)}
                  />
                  <button
                    onClick={() => remove(line.variantId)}
                    className="label link-underline text-muted"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="border border-line p-8">
            <p className="label text-muted">Summary</p>

            <dl className="mt-7 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd className="tabular-nums">{money(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Delivery</dt>
                <dd className="tabular-nums">{shipping === 0 ? "Free" : money(shipping)}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-4 text-xl">
                <dt className="font-display">Total</dt>
                <dd className="font-display tabular-nums">{money(total)}</dd>
              </div>
            </dl>

            <ButtonLink href="/checkout" className="mt-8 w-full">
              Checkout →
            </ButtonLink>
            <Link
              href="/shop"
              className="label mt-4 flex w-full items-center justify-center py-2 text-muted link-underline"
            >
              Keep shopping
            </Link>
          </div>

          <ul className="mt-8 space-y-3 text-sm text-muted">
            <li>· Two blind samples with every order</li>
            <li>· Cash on delivery available nationwide</li>
            <li>· Seven-day returns on unopened bottles</li>
          </ul>
        </aside>
      </div>
    </section>
  );
}
