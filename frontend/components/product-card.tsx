"use client";

import Link from "next/link";

import { Bottle } from "@/components/bottle";
import { bottleShape, toneFor } from "@/lib/catalog";
import { useMoney } from "@/lib/shop-settings";
import type { Product } from "@/lib/types";

export function ProductCard({ product, index }: { product: Product; index?: number }) {
  const money = useMoney();
  const available = product.inStock;
  const image = product.primaryImage;

  return (
    <Link href={`/shop/${product.slug}`} className="group block">
      <div className="relative overflow-hidden bg-paper-2">
        {typeof index === "number" ? (
          <span className="label absolute left-4 top-4 z-10 text-muted">
            {String(index + 1).padStart(2, "0")}
          </span>
        ) : null}

        {!available ? (
          <span className="label absolute right-4 top-4 z-10 bg-ink px-3 py-1.5 text-paper">
            Sold out
          </span>
        ) : null}

        {/* A photograph of the actual bottle wins whenever there is one. The
            drawn silhouette is the fallback, so a product added without imagery
            still lands in the grid at the right shape instead of a grey box. */}
        {image ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={image}
            alt={product.name}
            className="aspect-[4/5] w-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]"
          />
        ) : (
          <Bottle
            tone={toneFor(product.slug)}
            shape={bottleShape(product.category?.slug)}
            className="aspect-[4/5] w-full transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]"
          />
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full bg-ink/90 py-4 text-center opacity-0 backdrop-blur-sm transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-y-0 group-hover:opacity-100">
          <span className="label text-paper">View bottle →</span>
        </div>
      </div>

      <div className="mt-5 flex items-baseline justify-between gap-4">
        <h3 className="font-display text-2xl leading-none">{product.name}</h3>
        {product.priceFrom !== null ? (
          <p className="tabular-nums whitespace-nowrap text-sm">
            from {money(product.priceFrom)}
          </p>
        ) : null}
      </div>
      {product.brand ? <p className="label mt-3 text-muted">{product.brand}</p> : null}
      {product.tagline ? <p className="mt-2 text-sm text-muted">{product.tagline}</p> : null}
    </Link>
  );
}
