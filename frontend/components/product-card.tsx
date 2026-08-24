import Link from "next/link";

import { Bottle } from "@/components/bottle";
import { inStock, priceFrom } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/lib/types";

export function ProductCard({ product, index }: { product: Product; index?: number }) {
  const available = inStock(product);

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

        <Bottle
          tone={product.tone}
          shape={product.category === "attar" ? "vial" : "flacon"}
          className="aspect-[4/5] w-full transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]"
        />

        <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full bg-ink/90 py-4 text-center opacity-0 backdrop-blur-sm transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-y-0 group-hover:opacity-100">
          <span className="label text-paper">View blend →</span>
        </div>
      </div>

      <div className="mt-5 flex items-baseline justify-between gap-4">
        <h3 className="font-display text-2xl leading-none">{product.name}</h3>
        <p className="tabular-nums whitespace-nowrap text-sm">
          from {formatPrice(priceFrom(product))}
        </p>
      </div>
      <p className="mt-2 text-sm text-muted">{product.tagline}</p>
    </Link>
  );
}
