import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Accordion } from "@/components/accordion";
import { Bottle } from "@/components/bottle";
import { BuyPanel } from "@/components/buy-panel";
import { ProductCard } from "@/components/product-card";
import { Reveal } from "@/components/reveal";
import { SectionLabel } from "@/components/section-label";
import { ArrowLink } from "@/components/ui";
import { PRODUCTS, getCategory, getProduct, relatedProducts } from "@/lib/catalog";

export function generateStaticParams() {
  return PRODUCTS.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) return { title: "Not found" };
  return { title: product.name, description: product.tagline };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();

  const category = getCategory(product.category);
  const related = relatedProducts(product);
  const shape = product.category === "attar" ? "vial" : "flacon";

  return (
    <>
      <nav className="shell pt-8" aria-label="Breadcrumb">
        <ol className="label flex flex-wrap items-center gap-2 text-muted">
          <li>
            <Link href="/shop" className="link-underline">
              Shop
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link href={`/shop?category=${product.category}`} className="link-underline">
              {category?.name}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li className="text-ink">{product.name}</li>
        </ol>
      </nav>

      <section className="shell grid gap-14 py-12 lg:grid-cols-2 lg:gap-16 lg:py-16">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <div className="bg-paper-2">
            <Bottle tone={product.tone} shape={shape} className="aspect-square w-full" />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4">
            {["Bottle", "Applicator", "Box"].map((view, index) => (
              <div key={view} className="relative bg-paper-2">
                <Bottle
                  tone={product.tone}
                  shape={index === 1 ? "vial" : "flacon"}
                  className="aspect-square w-full opacity-70"
                />
                <span className="label absolute bottom-2 left-2 text-muted">{view}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <Reveal>
            <SectionLabel>{category?.name}</SectionLabel>
            <h1 className="display-md mt-6">{product.name}</h1>
            <p className="mt-5 text-lg leading-relaxed text-muted">{product.tagline}</p>
          </Reveal>

          <Reveal delay={80}>
            <div className="mt-10 border-t border-line pt-10">
              <BuyPanel product={product} />
            </div>
          </Reveal>

          <Reveal delay={140}>
            <p className="mt-12 leading-relaxed">{product.description}</p>
          </Reveal>

          <Reveal delay={180}>
            <dl className="mt-10 grid grid-cols-3 gap-6 border-y border-line py-7">
              {[
                ["Concentration", product.concentration],
                ["Longevity", product.longevity],
                ["Material", product.origin],
              ].map(([term, value]) => (
                <div key={term}>
                  <dt className="label text-muted">{term}</dt>
                  <dd className="mt-2 text-sm">{value}</dd>
                </div>
              ))}
            </dl>
          </Reveal>

          <Reveal delay={220}>
            <div className="mt-12">
              <SectionLabel>The pyramid</SectionLabel>
              <ul className="mt-7 space-y-5">
                {(
                  [
                    ["Top", product.notes.top],
                    ["Heart", product.notes.heart],
                    ["Base", product.notes.base],
                  ] as const
                ).map(([tier, notes]) => (
                  <li
                    key={tier}
                    className="grid grid-cols-[5rem_1fr] items-baseline gap-4 border-b border-line pb-5"
                  >
                    <span className="label text-accent">{tier}</span>
                    <span className="text-sm">{notes.join(" · ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal delay={260}>
            <div className="mt-14">
              <Accordion
                items={[
                  {
                    title: "Delivery & returns",
                    body: (
                      <p>
                        Dhaka in 1–2 days, rest of Bangladesh in 2–4. Free over ৳3,000, otherwise
                        ৳70 flat. Unopened bottles can be returned within seven days.
                      </p>
                    ),
                  },
                  {
                    title: "How to wear it",
                    body: (
                      <p>
                        {shape === "vial"
                          ? "Dab — do not rub — on pulse points. Rubbing shears the top notes and shortens the dry-down."
                          : "Two sprays on the chest, one on the back of the neck. Spray onto skin, not clothing, so the base notes develop."}
                      </p>
                    ),
                  },
                  {
                    title: "Storage",
                    body: (
                      <p>
                        Keep it in the box, away from sunlight and off the bathroom shelf. Oud oils
                        improve for years; sprays hold about three.
                      </p>
                    ),
                  },
                ]}
              />
            </div>
          </Reveal>
        </div>
      </section>

      <section className="shell border-t border-line py-20 md:py-28">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h2 className="display-md">Wear it with</h2>
          <ArrowLink href="/shop">All fragrances</ArrowLink>
        </div>
        <div className="mt-14 grid gap-x-8 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
          {related.map((item, index) => (
            <Reveal key={item.slug} delay={index * 90}>
              <ProductCard product={item} />
            </Reveal>
          ))}
        </div>
      </section>
    </>
  );
}
