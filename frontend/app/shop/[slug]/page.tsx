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
  // full row survives filtering the product itself back out.
  const { items: siblings } = category
    ? await fetchProducts(`?category=${encodeURIComponent(category.slug)}&size=4`)
    : { items: [] };
  const related = siblings.filter((item) => item.slug !== product.slug).slice(0, 3);

  const gallery = [...product.images].sort((a, b) => a.position - b.position);
  const hero = product.primaryImage ?? gallery[0]?.url ?? null;

  return (
    <>
      <nav className="shell pt-8" aria-label="Breadcrumb">
        <ol className="label flex flex-wrap items-center gap-2 text-muted">
          <li>
            <Link href="/shop" className="link-underline">
              Shop
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
          <li className="text-ink">{product.name}</li>
        </ol>
      </nav>

      <section className="shell grid gap-14 py-12 lg:grid-cols-2 lg:gap-16 lg:py-16">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <div className="bg-paper-2">
            {hero ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={hero} alt={product.name} className="aspect-square w-full object-cover" />
            ) : (
              <Bottle tone={tone} shape={shape} className="aspect-square w-full" />
            )}
          </div>

          {/* Only a real gallery earns a thumbnail strip. The old page drew
              three tinted silhouettes and labelled them "Bottle / Applicator /
              Box", which promised photographs that did not exist. */}
          {gallery.length > 1 ? (
            <div className="mt-4 grid grid-cols-3 gap-4">
              {gallery.slice(0, 3).map((image) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={image.id}
                  src={image.url}
                  alt={image.alt ?? product.name}
                  className="aspect-square w-full bg-paper-2 object-cover"
                />
              ))}
            </div>
          ) : null}
        </div>

        <div>
          <Reveal>
            <SectionLabel>{category?.name ?? "Bakhoora"}</SectionLabel>
            <h1 className="display-md mt-6">{product.name}</h1>
            {product.brand ? <p className="label mt-4 text-muted">{product.brand}</p> : null}
            {product.tagline ? (
              <p className="mt-5 text-lg leading-relaxed text-muted">{product.tagline}</p>
            ) : null}
          </Reveal>

          <Reveal delay={80}>
            <div className="mt-10 border-t border-line pt-10">
              <BuyPanel product={product} />
            </div>
          </Reveal>

          {product.description ? (
            <Reveal delay={140}>
              <p className="mt-12 whitespace-pre-line leading-relaxed">{product.description}</p>
            </Reveal>
          ) : null}

          <Reveal delay={260}>
            <div className="mt-14">
              <Accordion
                items={[
                  {
                    title: "What you are buying",
                    body: isOil ? (
                      <p>
                        Perfume oil, bought by the bottle and poured into fresh glass to order.
                        Alcohol-free, so it sits close to the skin and lasts longer than a spray.
                      </p>
                    ) : (
                      <p>
                        A decant: we import the full bottle, then transfer it into smaller glass so
                        you can wear a fragrance without paying for 100ml of it. It is the same
                        liquid the house bottled — we are an independent decanter, not a dealer for
                        any brand, and we do not mix, dilute or top anything up.
                      </p>
                    ),
                  },
                  {
                    title: "How it is poured",
                    body: (
                      <p>
                        Transferred by hand into new glass, one bottle at a time, with a fresh
                        pipette per fragrance so nothing carries over. Labelled with the name and
                        the size, sealed, and boxed the day it goes out.
                      </p>
                    ),
                  },
                  {
                    title: "Delivery & returns",
                    body: (
                      <p>
                        Dhaka in 1–2 days, rest of Bangladesh in 2–4. Free over ৳3,000, otherwise
                        ৳70 flat. Because a decant is poured for you, we can only take back a
                        sealed, unopened vial — within seven days.
                      </p>
                    ),
                  },
                  {
                    title: "How to wear it",
                    body: (
                      <p>
                        {isOil
                          ? "Dab — do not rub — on pulse points. Rubbing shears the top notes and shortens the dry-down."
                          : "Two sprays on the chest, one on the back of the neck. Spray onto skin, not clothing, so the base notes develop."}
                      </p>
                    ),
                  },
                  {
                    title: "Storage",
                    body: (
                      <p>
                        Keep it in the box, away from sunlight and off the bathroom shelf. Heat and
                        light are what turn a fragrance, not time in the glass.
                      </p>
                    ),
                  },
                ]}
              />
            </div>
          </Reveal>
        </div>
      </section>

      {related.length > 0 ? (
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
      ) : null}
    </>
  );
}
