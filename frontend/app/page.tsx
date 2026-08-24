import Link from "next/link";

import { Bottle } from "@/components/bottle";
import { Marquee } from "@/components/marquee";
import { ProductCard } from "@/components/product-card";
import { Reveal } from "@/components/reveal";
import { SectionLabel } from "@/components/section-label";
import { ArrowLink, ButtonLink } from "@/components/ui";
import { CATEGORIES, PRODUCTS, getProduct, priceFrom } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";

const HERO_PRODUCT = getProduct("royal-oud-intense")!;

const PILLARS = [
  {
    index: "01",
    title: "Aged, not rushed",
    body: "Agarwood rests eighteen months before it is blended, and the finished oil rests again in glass. Nothing ships the week it is made.",
  },
  {
    index: "02",
    title: "Built for this climate",
    body: "Thin top notes die in 34°C humidity. Every blend is tested through a Dhaka summer before it earns a bottle.",
  },
  {
    index: "03",
    title: "Ingredients, listed",
    body: "Top, heart and base printed on every product page. If a note is a synthetic accord, we say so rather than calling it oud.",
  },
];

const TIMELINE = [
  { year: "2019", text: "A single shelf of attar in a Dhanmondi shop, blended after office hours." },
  { year: "2021", text: "First Assam agarwood consignment. The Royal Oud formula settles after nine attempts." },
  { year: "2023", text: "Move to the current studio. Spray line launches with Amber Nights." },
  { year: "2026", text: "Eleven blends, four thousand orders, and still no distributor." },
];

const PRESS = [
  { source: "Dhaka Tribune", quote: "The most honest ingredient list in Bangladeshi perfumery." },
  { source: "Ice Today", quote: "Royal Oud Intense is worth the queue and the price." },
  { source: "Kaler Kantho", quote: "A local house that finally understands dry-down." },
];

export default function HomePage() {
  const featured = PRODUCTS.filter((product) => product.featured).slice(0, 6);

  return (
    <>
      {/* ---------------- hero ---------------- */}
      <section className="shell grid gap-14 pb-16 pt-14 md:pb-24 md:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-10">
        <div>
          <Reveal>
            <SectionLabel>Attar · Oud · Eau de Parfum</SectionLabel>
          </Reveal>

          <Reveal delay={80}>
            <h1 className="display-xl mt-8 leading-[0.86]">
              Bottled
              <br />
              <span className="italic text-accent">patience</span>.
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="mt-9 max-w-md text-lg leading-relaxed text-muted">
              Hand-blended in Dhaka from aged agarwood, Taif rose and sandalwood. Small
              batches, long dry-downs, and an ingredient list we are happy to print.
            </p>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-11 flex flex-wrap items-center gap-4">
              <ButtonLink href="/shop">Shop the collection</ButtonLink>
              <ArrowLink href="/about" className="px-3 py-4">
                Read our story
              </ArrowLink>
            </div>
          </Reveal>

          <Reveal delay={320}>
            <dl className="mt-16 grid max-w-lg grid-cols-3 gap-6 border-t border-line pt-8">
              {[
                ["11", "Blends in rotation"],
                ["18 mo", "Minimum ageing"],
                ["2–4 d", "Delivery nationwide"],
              ].map(([value, label]) => (
                <div key={label}>
                  <dt className="font-display text-3xl">{value}</dt>
                  <dd className="label mt-2 text-muted">{label}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>

        <Reveal delay={120} className="relative">
          <div className="relative bg-paper-2">
            <Bottle tone={HERO_PRODUCT.tone} className="aspect-[4/5] w-full" />
            <Link
              href={`/shop/${HERO_PRODUCT.slug}`}
              className="group absolute bottom-5 left-5 right-5 flex items-center justify-between gap-4 bg-paper/95 px-5 py-4 backdrop-blur-sm sm:left-auto sm:right-5 sm:w-72"
            >
              <div>
                <p className="label text-muted">Best seller</p>
                <p className="mt-1.5 font-display text-xl leading-none">{HERO_PRODUCT.name}</p>
                <p className="mt-1.5 text-sm tabular-nums text-muted">
                  from {formatPrice(priceFrom(HERO_PRODUCT))}
                </p>
              </div>
              <span
                aria-hidden
                className="text-xl transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1.5"
              >
                →
              </span>
            </Link>
          </div>
          <p className="label mt-5 flex items-center gap-3 text-muted">
            <span aria-hidden className="animate-bounce">↓</span> Scroll
          </p>
        </Reveal>
      </section>

      <Marquee
        items={[
          "Free delivery over ৳3,000",
          "Cash on delivery",
          "Blended in Dhaka",
          "No alcohol in attars",
          "Samples with every order",
        ]}
      />

      {/* ---------------- 01 the house ---------------- */}
      <section className="shell py-24 md:py-36">
        <Reveal>
          <SectionLabel index="01">The house</SectionLabel>
        </Reveal>
        <Reveal delay={80}>
          <h2 className="display-lg mt-9 max-w-4xl">
            Most perfume sold here is bought by the litre and poured into someone
            else&rsquo;s bottle. <span className="text-muted">We do the slow version.</span>
          </h2>
        </Reveal>

        <div className="mt-20 grid gap-12 md:grid-cols-3 md:gap-8">
          {PILLARS.map((pillar, index) => (
            <Reveal key={pillar.index} delay={index * 100}>
              <article className="border-t border-line pt-7">
                <p className="label text-accent">{pillar.index}</p>
                <h3 className="mt-5 font-display text-3xl">{pillar.title}</h3>
                <p className="mt-4 text-sm leading-relaxed text-muted">{pillar.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------- 02 collections ---------------- */}
      <section className="bg-paper-2 py-24 md:py-36">
        <div className="shell">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <SectionLabel index="02">The collections</SectionLabel>
                <h2 className="display-md mt-7 max-w-xl">Four ways to wear it.</h2>
              </div>
              <ArrowLink href="/shop">See everything</ArrowLink>
            </div>
          </Reveal>

          <div className="mt-16 grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {CATEGORIES.map((category, index) => (
              <Reveal key={category.slug} delay={index * 80}>
                <Link
                  href={`/shop?category=${category.slug}`}
                  className="group flex h-full flex-col justify-between gap-10 bg-paper p-8 transition-colors duration-500 hover:bg-ink hover:text-paper"
                >
                  <div>
                    <p className="label text-muted transition-colors group-hover:text-paper/50">
                      0{index + 1}
                    </p>
                    <h3 className="mt-5 font-display text-4xl">{category.name}</h3>
                    <p className="mt-4 text-sm leading-relaxed text-muted transition-colors group-hover:text-paper/70">
                      {category.blurb}
                    </p>
                  </div>
                  <span aria-hidden className="text-2xl transition-transform duration-500 group-hover:translate-x-2">
                    →
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- 03 bestsellers ---------------- */}
      <section className="shell py-24 md:py-36">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <SectionLabel index="03">What people reorder</SectionLabel>
              <h2 className="display-md mt-7">The short list.</h2>
            </div>
            <ArrowLink href="/shop">All fragrances</ArrowLink>
          </div>
        </Reveal>

        <div className="mt-16 grid gap-x-8 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((product, index) => (
            <Reveal key={product.slug} delay={(index % 3) * 90}>
              <ProductCard product={product} index={index} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------- 04 inside the bottle ---------------- */}
      <section className="bg-night py-24 text-paper md:py-36">
        <div className="shell">
          <Reveal>
            <SectionLabel index="04" tone="paper">
              Inside the bottle
            </SectionLabel>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="display-lg mt-9 max-w-3xl text-paper">
              Three materials do most of the work.
            </h2>
          </Reveal>

          <div className="mt-20 grid gap-14 md:grid-cols-3 md:gap-10">
            {[
              {
                name: "Agarwood",
                origin: "Assam & Cambodia",
                body: "Resin-soaked heartwood, distilled slowly. The reason a drop lasts a working day and costs what it costs.",
              },
              {
                name: "Taif rose",
                origin: "Saudi Arabia",
                body: "Picked before sunrise so the oil keeps its green edge. Roughly forty kilos of petals per tola.",
              },
              {
                name: "Sandalwood",
                origin: "Karnataka profile",
                body: "The creamy base that stops oud from turning harsh, and holds the blend against skin all day.",
              },
            ].map((material, index) => (
              <Reveal key={material.name} delay={index * 100}>
                <article className="border-t border-paper/20 pt-7">
                  <h3 className="font-display text-4xl text-paper">{material.name}</h3>
                  <p className="label mt-3 text-accent-soft">{material.origin}</p>
                  <p className="mt-5 text-sm leading-relaxed text-paper/60">{material.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- 05 timeline ---------------- */}
      <section className="shell py-24 md:py-36">
        <Reveal>
          <SectionLabel index="05">Since 2019</SectionLabel>
        </Reveal>
        <Reveal delay={80}>
          <h2 className="display-md mt-7 max-w-2xl">Seven years, one recipe book.</h2>
        </Reveal>

        <ol className="mt-16 border-t border-line">
          {TIMELINE.map((entry, index) => (
            <Reveal key={entry.year} delay={index * 70}>
              <li className="grid grid-cols-[auto_1fr] items-baseline gap-8 border-b border-line py-8 md:grid-cols-[10rem_1fr]">
                <span className="font-display text-4xl text-accent md:text-5xl">{entry.year}</span>
                <p className="max-w-2xl leading-relaxed text-muted">{entry.text}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* ---------------- 06 press ---------------- */}
      <section className="bg-paper-2 py-24 md:py-36">
        <div className="shell">
          <Reveal>
            <SectionLabel index="06">Press</SectionLabel>
          </Reveal>
          <div className="mt-14 grid gap-10 md:grid-cols-3">
            {PRESS.map((item, index) => (
              <Reveal key={item.source} delay={index * 90}>
                <figure className="flex h-full flex-col justify-between gap-8 border-t border-line pt-7">
                  <blockquote className="font-display text-2xl leading-snug">
                    &ldquo;{item.quote}&rdquo;
                  </blockquote>
                  <figcaption className="label text-muted">{item.source}</figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- closing cta ---------------- */}
      <section className="shell py-24 text-center md:py-40">
        <Reveal>
          <h2 className="display-lg mx-auto max-w-4xl">
            Start with a 3&nbsp;ml. <span className="text-muted">Commit later.</span>
          </h2>
        </Reveal>
        <Reveal delay={100}>
          <p className="mx-auto mt-8 max-w-lg leading-relaxed text-muted">
            Every order ships with two blind samples, so the next bottle is never a guess.
          </p>
        </Reveal>
        <Reveal delay={180}>
          <div className="mt-11 flex flex-wrap justify-center gap-4">
            <ButtonLink href="/shop">Shop all blends</ButtonLink>
            <ButtonLink href="/shop?category=attar" tone="outline">
              Start with attar
            </ButtonLink>
          </div>
        </Reveal>
      </section>
    </>
  );
}
