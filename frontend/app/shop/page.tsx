import type { Metadata } from "next";
import { Suspense } from "react";

import { ProductCard } from "@/components/product-card";
import { Reveal } from "@/components/reveal";
import { SectionLabel } from "@/components/section-label";
import { ShopFilters } from "@/components/shop-filters";
import { fetchProducts } from "@/lib/api";
import { getCategory, isSortKey } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Shop",
  description: "Decants poured from imported bottles, and perfume oil by the millilitre.",
};

// Stock and pricing come from the API on every request. A shop page cached at
// build time would keep offering a bottle that sold out an hour ago.
export const dynamic = "force-dynamic";

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
  const search = one("q");
  const inStockOnly = one("stock") === "1";
  const sortParam = one("sort");
  const sort = isSortKey(sortParam) ? sortParam : "newest";

  // Filtering and sorting are the database's job — doing them here would mean
  // pulling the whole catalogue down to hide most of it again.
  const query = new URLSearchParams({ size: "60", sort });
  if (categorySlug && categorySlug !== "all") query.set("category", categorySlug);
  if (search) query.set("search", search);
  if (inStockOnly) query.set("in_stock", "true");

  const { items: products } = await fetchProducts(`?${query.toString()}`);
  const filtered = Boolean((categorySlug && categorySlug !== "all") || search || inStockOnly);

  return (
    <>
      <section className="shell pb-12 pt-14 md:pt-20">
        <Reveal>
          <SectionLabel>{category ? "Collection" : "The full range"}</SectionLabel>
        </Reveal>
        <Reveal delay={80}>
          <h1 className="display-lg mt-8 max-w-3xl">
            {category ? category.name : "Everything we pour."}
          </h1>
        </Reveal>
        <Reveal delay={140}>
          <p className="mt-7 max-w-xl leading-relaxed text-muted">
            {category
              ? category.blurb
              : "Decants from bottles we import ourselves, and oil bought by the bottle and poured to order. Every size is the same fragrance — only the glass is smaller."}
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
            {/* Two different nothings: a filter that excluded everything, and a
                shop with nothing in it yet. Telling someone to "clear a filter"
                when there are no products at all just wastes their time. */}
            {filtered ? (
              <>
                <p className="font-display text-3xl">Nothing matches that.</p>
                <p className="mt-4 text-sm text-muted">Try clearing a filter or two.</p>
              </>
            ) : (
              <>
                <p className="font-display text-3xl">No products yet.</p>
                <p className="mt-4 text-sm text-muted">
                  Nothing is listed at the moment. Check back shortly.
                </p>
              </>
            )}
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
