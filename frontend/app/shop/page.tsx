import type { Metadata } from "next";
import { Suspense } from "react";

import { ProductCard } from "@/components/product-card";
import { Reveal } from "@/components/reveal";
import { SectionLabel } from "@/components/section-label";
import { ShopFilters } from "@/components/shop-filters";
import { getCategory, queryProducts, type SortKey } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Shop",
  description: "Every Bakhoora blend — attar, oud, eau de parfum and body mist.",
};

const SORT_KEYS: SortKey[] = ["featured", "price-asc", "price-desc", "name"];

function readSort(value: string | undefined): SortKey {
  return SORT_KEYS.includes(value as SortKey) ? (value as SortKey) : "featured";
}

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const categorySlug = one("category");
  const category = categorySlug ? getCategory(categorySlug) : undefined;

  const products = queryProducts({
    category: categorySlug,
    sort: readSort(one("sort")),
    search: one("q"),
    inStockOnly: one("stock") === "1",
  });

  return (
    <>
      <section className="shell pb-12 pt-14 md:pt-20">
        <Reveal>
          <SectionLabel>{category ? "Collection" : "The full range"}</SectionLabel>
        </Reveal>
        <Reveal delay={80}>
          <h1 className="display-lg mt-8 max-w-3xl">{category ? category.name : "Every blend."}</h1>
        </Reveal>
        <Reveal delay={140}>
          <p className="mt-7 max-w-xl leading-relaxed text-muted">
            {category
              ? category.blurb
              : "Eleven blends in rotation. Attars are alcohol-free oils, sprays are 16–20% concentration. Samples ship with every order."}
          </p>
        </Reveal>
      </section>

      <div className="shell">
        <Suspense fallback={<div className="h-24 border-y border-line" />}>
          <ShopFilters resultCount={products.length} />
        </Suspense>
      </div>

      <section className="shell py-16 md:py-20">
        {products.length === 0 ? (
          <div className="border border-line py-28 text-center">
            <p className="font-display text-3xl">Nothing matches that.</p>
            <p className="mt-4 text-sm text-muted">Try clearing a filter or two.</p>
          </div>
        ) : (
          <div className="grid gap-x-8 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product, index) => (
              <Reveal key={product.slug} delay={(index % 3) * 90}>
                <ProductCard product={product} index={index} />
              </Reveal>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
