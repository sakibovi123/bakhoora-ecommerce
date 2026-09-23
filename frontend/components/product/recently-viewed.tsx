"use client";

import { useEffect, useState } from "react";

import { ProductRail } from "@/components/home/product-rail";
import { SectionHeading } from "@/components/home/section-heading";
import type { Product } from "@/lib/types";

const KEY = "bakhoora.recent.v1";
const LIMIT = 10;

function read(): Product[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Product[]).filter((item) => typeof item?.slug === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Records this product as seen and shows the others you looked at before it.
 * Kept in this browser only. The copies are trimmed (no description, no
 * gallery) so ten of them stay well inside storage limits — the card only
 * needs a name, a price and a picture.
 */
export function RecentlyViewed({ product }: { product: Product }) {
  const [items, setItems] = useState<Product[]>([]);

  useEffect(() => {
    const snapshot: Product = { ...product, description: "", images: [] };
    const previous = read().filter((item) => item.slug !== product.slug);
    setItems(previous);
    try {
      window.localStorage.setItem(KEY, JSON.stringify([snapshot, ...previous].slice(0, LIMIT)));
    } catch {
      // Private mode or a full quota: the row simply stays empty.
    }
  }, [product]);

  function clear() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify([]));
    } catch {
      // Nothing to clear if storage is unavailable.
    }
    setItems([]);
  }

  if (items.length === 0) return null;

  return (
    <section className="shell border-t border-line py-16 md:py-24">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <SectionHeading title="Recently viewed" />
        </div>
        <button
          type="button"
          onClick={clear}
          className="label rounded-md px-4 py-2.5 text-[0.65rem] shadow-[0_4px_16px_rgba(0,0,0,0.08)] ring-1 ring-black/5 transition-colors hover:bg-ink hover:text-paper"
        >
          Clear history
        </button>
      </div>
      <div className="mt-10">
        <ProductRail products={items} />
      </div>
    </section>
  );
}
