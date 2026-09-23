"use client";

import Link from "next/link";

import { Bottle } from "@/components/bottle";
import { bottleShape, toneFor } from "@/lib/catalog";
import { useMoney } from "@/lib/shop-settings";
import type { Product } from "@/lib/types";

/** Three hairline wisps, the logo's smoke, that draw themselves up on hover. */
function Wisp() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 60 70"
      className="wisp pointer-events-none absolute left-1/2 top-3 z-10 h-14 w-12 -translate-x-1/2"
      fill="none"
      stroke="var(--color-smoke)"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <path d="M30 68 C22 52 38 40 30 24 C24 12 30 4 30 2" />
      <path d="M18 64 C12 52 24 44 18 32" />
      <path d="M42 64 C48 52 36 44 42 32" />
    </svg>
  );
}

export function ProductCard({
  product,
  index,
  variant = "grid",
}: {
  product: Product;
  index?: number;
  /** `shelf` centres the text under the bottle, for the homepage rail. */
  variant?: "grid" | "shelf";
}) {
  const money = useMoney();
  const available = product.inStock;
  const image = product.primaryImage;
  const shelf = variant === "shelf";

  return (
    <Link href={`/shop/${product.slug}`} className="group block">
      <div className="relative overflow-hidden rounded-2xl bg-paper-2 transition-shadow duration-500 group-hover:shadow-[0_18px_50px_rgba(0,0,0,0.10)]">
        {typeof index === "number" && !shelf ? (
          <span className="label absolute left-4 top-4 z-10 text-muted">
            {String(index + 1).padStart(2, "0")}
          </span>
        ) : null}

        {!available ? (
          <span className="label absolute right-3 top-3 z-10 rounded-full bg-ink px-3 py-1.5 text-[0.6rem] text-paper">
            Sold out
          </span>
        ) : null}

        <Wisp />

        {/* A photograph of the actual bottle wins whenever there is one. The
            drawn silhouette is the fallback, so a product added without imagery
            still lands in the grid at the right shape instead of a grey box. */}
        {image ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={image}
            alt={product.name}
            draggable={false}
            className={`w-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-1 group-hover:scale-[1.04] ${
              shelf ? "aspect-square" : "aspect-[4/5]"
            }`}
          />
        ) : (
          <Bottle
            tone={toneFor(product.slug)}
            shape={bottleShape(product.category?.slug)}
            className={`w-full transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-1 group-hover:scale-[1.04] ${
              shelf ? "aspect-square" : "aspect-[4/5]"
            }`}
          />
        )}

        <div className="pointer-events-none absolute inset-x-3 bottom-3 translate-y-[140%] rounded-full bg-ink/90 py-3 text-center backdrop-blur-sm transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-y-0">
          <span className="label text-[0.6rem] text-paper">View bottle ↗</span>
        </div>
      </div>

      {shelf ? (
        <div className="mt-5 px-1 text-center">
          {product.brand ? (
            <p className="label text-[0.625rem] text-muted">{product.brand}</p>
          ) : null}
          <h3 className="mt-1.5 text-[0.95rem] font-medium leading-snug tracking-normal">
            {product.name}
          </h3>
          {product.priceFrom !== null ? (
            <p className="mt-1.5 text-sm tabular-nums text-muted">from {money(product.priceFrom)}</p>
          ) : null}
        </div>
      ) : (
        <>
          <div className="mt-5 flex items-baseline justify-between gap-4">
            <h3 className="text-xl font-medium leading-tight tracking-normal">{product.name}</h3>
            {product.priceFrom !== null ? (
              <p className="whitespace-nowrap text-sm tabular-nums">
                from {money(product.priceFrom)}
              </p>
            ) : null}
          </div>
          {product.brand ? <p className="label mt-2 text-muted">{product.brand}</p> : null}
          {product.tagline ? <p className="mt-2 text-sm text-muted">{product.tagline}</p> : null}
        </>
      )}
    </Link>
  );
}
