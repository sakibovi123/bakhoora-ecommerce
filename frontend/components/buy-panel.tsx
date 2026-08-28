"use client";

import { useState } from "react";

import { QuantityStepper } from "@/components/quantity-stepper";
import { useCart } from "@/lib/cart-context";
import { useMoney } from "@/lib/shop-settings";
import type { Product } from "@/lib/types";

export function BuyPanel({ product }: { product: Product }) {
  const { add } = useCart();
  const money = useMoney();
  // A product with no active sizes is a real state now that the catalogue is
  // whatever the admin has entered — it must not index into an empty array.
  const sellable = product.variants.filter((variant) => variant.isActive);
  const firstAvailable = sellable.find((variant) => variant.stock > 0) ?? sellable[0];
  const [variantId, setVariantId] = useState(firstAvailable?.id ?? "");
  const [quantity, setQuantity] = useState(1);

  const variant = sellable.find((item) => item.id === variantId) ?? firstAvailable;

  if (!variant) {
    return (
      <p className="label text-muted">
        No sizes listed yet — write to us and we will tell you what is in the bottle.
      </p>
    );
  }
  const soldOut = variant.stock <= 0;
  const lowStock = variant.stock > 0 && variant.stock <= 5;

  return (
    <div>
      <p className="label mb-4 text-muted">Size</p>
      <div className="flex flex-wrap gap-3">
        {sellable.map((option) => {
          const selected = option.id === variantId;
          const unavailable = option.stock <= 0;
          return (
            <button
              key={option.id}
              onClick={() => {
                setVariantId(option.id);
                setQuantity(1);
              }}
              className={`flex min-w-28 flex-col items-start gap-1 border px-4 py-3 text-left transition-colors duration-300 ${
                selected ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"
              } ${unavailable ? "opacity-40" : ""}`}
            >
              <span className="label">{option.name}</span>
              <span className="text-sm tabular-nums">{money(option.price)}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <QuantityStepper
          value={quantity}
          max={Math.max(variant.stock, 1)}
          onChange={(next) => setQuantity(Math.max(1, next))}
        />
        <button
          disabled={soldOut}
          onClick={() => add(product, variant, quantity)}
          className="label flex-1 bg-ink px-7 py-4 text-paper transition-colors hover:bg-ink-2 disabled:cursor-not-allowed disabled:bg-muted"
        >
          {soldOut ? "Sold out" : `Add to bag — ${money(variant.price * quantity)}`}
        </button>
      </div>

      <p className="label mt-5 text-muted">
        {soldOut ? (
          <>Back in stock soon — write to us and we will hold one.</>
        ) : lowStock ? (
          <span className="text-accent">Only {variant.stock} left in this size</span>
        ) : (
          <>In stock · ships within 24 hours</>
        )}
      </p>
    </div>
  );
}
