import { existsSync } from "node:fs";
import path from "node:path";

import type { Metadata } from "next";
import { Suspense } from "react";

import { BrandLanes } from "@/components/home/brand-lanes";
import { SectionHeading } from "@/components/home/section-heading";
import { VelocityMarquee } from "@/components/home/velocity-marquee";
import { ProductCard } from "@/components/product-card";
import { Reveal } from "@/components/reveal";
import { ShopFilters } from "@/components/shop-filters";
import { ShopHero } from "@/components/shop/shop-hero";
import { fetchProducts } from "@/lib/api";
import { getCategory, isSortKey } from "@/lib/catalog";
import { OILS } from "@/lib/types";

/**
 * A real photograph for a collection header, if one has been dropped into
 * public/shop/ as <category-slug>.jpg (or all.jpg for the full range).
 * Without one the drawn atomisers stand in.
 */
function headerPhoto(slug: string): string | null {
  for (const ext of ["jpg", "webp", "png"]) {
    const file = `${slug}.${ext}`;
    if (existsSync(path.join(process.cwd(), "public", "shop", file))) return `/shop/${file}`;
  }
  return null;
}

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
  const photo = headerPhoto(category ? category.slug : "all");
  const filtered = Boolean((categorySlug && categorySlug !== "all") || search || inStockOnly);

  // The houses strip at the foot of the page is drawn from the whole shelf,
  // not the filtered view, so it never shrinks to one chip mid-search.
  const { items: everything } = await fetchProducts("?size=100");
  const brandsByKey = new Map<string, string>();
  for (const product of everything) {
    const brand = product.brand?.trim();
    if (brand && !brandsByKey.has(brand.toLowerCase())) brandsByKey.set(brand.toLowerCase(), brand);
  }
  const brands = [...brandsByKey.values()].sort((a, b) => a.localeCompare(b));

  const heading = search
    ? `Results for “${search}”`
    : category
      ? `All ${category.name.toLowerCase()}`
      : "All fragrances";

  return (
    <>
      <ShopHero
        kicker={category ? "Collection" : "The full range"}
        title={category ? category.name : "Everything we pour."}
        blurb={
          category
            ? category.blurb
            : "Decants from bottles we import ourselves, and oil bought by the bottle and poured to order. Every size is the same fragrance — only the glass is smaller."
        }
        photo={photo}
        art={categorySlug === OILS ? "oil" : category ? "decant" : "all"}
        count={everything.length}
      />

      <VelocityMarquee
        words={
          categorySlug === OILS
            ? ["Dab", "Warm", "Linger", "Oud", "Amber", "Musk", "Resin", "Stay"]
            : ["Spray", "Wear", "Layer", "Compare", "Discover", "Decide", "Repeat", "Keep"]
        }
      />

      <div className="shell">
        <Suspense fallback={<div className="h-20 border-b border-line" />}>
          <ShopFilters resultCount={products.length} />
        </Suspense>

        <section className="py-12 md:py-16">
          <SectionHeading title={heading} kicker={filtered ? "Filtered" : "Newest first"} />

          {products.length === 0 ? (
            <div className="mt-10 rounded-2xl bg-paper-2 px-6 py-24 text-center">
              <span aria-hidden className="ember mx-auto block size-3" />
              {/* Two different nothings: a filter that excluded everything, and a
                  shop with nothing in it yet. Telling someone to "clear a filter"
                  when there are no products at all just wastes their time. */}
              {filtered ? (
                <>
                  <p className="mt-6 text-3xl font-medium">Nothing matches that.</p>
                  <p className="mt-3 text-sm text-muted">Try clearing a filter or two.</p>
                </>
              ) : (
                <>
                  <p className="mt-6 text-3xl font-medium">No products yet.</p>
                  <p className="mt-3 text-sm text-muted">
                    Nothing is listed at the moment. Check back shortly.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-5">
              {products.map((product, index) => (
                <Reveal key={product.slug} delay={(index % 4) * 80}>
                  <ProductCard product={product} variant="shelf" />
                </Reveal>
              ))}
            </div>
          )}
        </section>
      </div>

      {brands.length > 1 ? (
        <section className="border-t border-line py-16 md:py-20">
          <div className="shell">
            <h2 className="text-2xl font-semibold tracking-[-0.02em]">Shop by house</h2>
          </div>
          <div className="mt-6">
            <BrandLanes brands={brands} />
          </div>
        </section>
      ) : null}
    </>
  );
}
