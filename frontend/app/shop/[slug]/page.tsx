import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BuyPanel } from "@/components/buy-panel";
import { ProductRail } from "@/components/home/product-rail";
import { SectionHeading } from "@/components/home/section-heading";
import { ProductDescription, ProductInfo } from "@/components/product/product-details";
import { ProductStage } from "@/components/product/product-stage";
import { RecentlyViewed } from "@/components/product/recently-viewed";
import { Reveal } from "@/components/reveal";
import { fetchProduct, fetchProducts } from "@/lib/api";
import { bottleShape, toneFor } from "@/lib/catalog";
import { OILS } from "@/lib/types";

// No generateStaticParams: the catalogue lives in the database, so the set of
// valid slugs is not known at build time.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await fetchProduct(slug);
  if (!product) return { title: "Not found" };
  return {
    title: product.name,
    description: product.tagline || `${product.name} — decanted by Bakhoora.`,
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await fetchProduct(slug);
  if (!product) notFound();

  const category = product.category;
  const shape = bottleShape(category?.slug);
  const isOil = category?.slug === OILS;
  const tone = toneFor(product.slug);

  // Siblings from the same category, minus this one. Asked for one extra so a
  // full shelf survives filtering the product itself back out.
  const { items: siblings } = category
    ? await fetchProducts(`?category=${encodeURIComponent(category.slug)}&size=13`)
    : { items: [] };
  const related = siblings.filter((item) => item.slug !== product.slug).slice(0, 12);

  // The primary photo leads, then the rest in the order the admin set.
  const gallery = [...product.images].sort(
    (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.position - b.position,
  );

  return (
    <>
      <nav className="shell pt-8" aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <li>
            <Link href="/" className="link-underline">
              Home
            </Link>
          </li>
          {category ? (
            <>
              <li aria-hidden>/</li>
              <li>
                <Link
                  href={`/shop?category=${encodeURIComponent(category.slug)}`}
                  className="link-underline"
                >
                  {category.name}
                </Link>
              </li>
            </>
          ) : null}
          <li aria-hidden>/</li>
          <li className="font-semibold text-ink">{product.name}</li>
        </ol>
      </nav>

      <section className="shell grid gap-10 pb-20 pt-6 lg:grid-cols-[1.15fr_1fr] lg:gap-14 lg:pb-28">
        <div className="lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:self-start">
          <Reveal>
            <ProductStage name={product.name} images={gallery} fallback={{ tone, shape }} />
          </Reveal>
        </div>

        <div className="space-y-5">
          <BuyPanel product={product} tone={tone} isOil={isOil} />

          <Reveal>
            <ProductInfo isOil={isOil} />
          </Reveal>

          {product.description ? (
            <Reveal>
              <ProductDescription text={product.description} />
            </Reveal>
          ) : null}
        </div>
      </section>

      {related.length > 0 ? (
        <section className="shell border-t border-line py-16 md:py-24">
          <SectionHeading title="Wear it with" kicker={category?.name} />
          <div className="mt-10">
            <ProductRail products={related} />
          </div>
        </section>
      ) : null}

      <RecentlyViewed product={product} />
    </>
  );
}
