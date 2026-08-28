import Link from "next/link";

import { Marquee } from "@/components/marquee";
import { ProductCard } from "@/components/product-card";
import { Reveal } from "@/components/reveal";
import { SectionLabel } from "@/components/section-label";
import { ArrowLink, ButtonLink } from "@/components/ui";
import { fetchProducts } from "@/lib/api";
import { CATEGORIES } from "@/lib/catalog";

export const dynamic = "force-dynamic";

const PILLARS = [
  {
    index: "01",
    title: "The same liquid",
    body: "We import the bottle, then pour from it. Nothing is mixed, diluted or topped up — a 10ml decant is the house's own fragrance, in smaller glass.",
  },
  {
    index: "02",
    title: "A size you will finish",
    body: "Most of a 100ml bottle is still sitting there two years later, turning. Buy 6, 10, 15 or 30ml of something you will actually wear out.",
  },
  {
    index: "03",
    title: "Poured to order",
    body: "Filled by hand the day it ships, into new glass, with a fresh pipette per fragrance so nothing carries over from the last one.",
  },
];

const STEPS = [
  {
    step: "01",
    title: "We buy the bottle",
    text: "Full retail bottles, imported, and oil bought by the bottle from the market — never decanted stock bought on from someone else.",
  },
  {
    step: "02",
    title: "You pick a size",
    text: "6, 10, 15 or 30ml. The price per millilitre is on the product page, so you can see exactly what the split costs.",
  },
  {
    step: "03",
    title: "We pour it",
    text: "Hand-filled into fresh glass, labelled with the fragrance and the size, sealed, and boxed.",
  },
  {
    step: "04",
    title: "It ships",
    text: "Dhaka in 1–2 days, rest of Bangladesh in 2–4. Free over ৳3,000, ৳70 flat below it, cash on delivery.",
  },
];

const QUESTIONS = [
  {
    q: "Is it authentic?",
    a: "It is whatever we poured it out of, and we pour out of bottles we bought ourselves. We are an independent decanter — not an authorised dealer for any house, and we do not claim to be.",
  },
  {
    q: "Why is a decant cheaper?",
    a: "You are paying for the fragrance and the small glass, not for the house's box, cap and full-size bottle. The trade is that it arrives in a plain vial.",
  },
  {
    q: "What about the oils?",
    a: "Bought by the bottle from the market and poured the same way. Alcohol-free, so they sit closer to the skin and last longer than a spray does.",
  },
];

export default async function HomePage() {
  // Featured is a flag on the product, so an empty shop simply drops the
  // section rather than rendering a heading over nothing.
  const { items: featured } = await fetchProducts("?featured=true&in_stock=true&size=6");

  return (
    <>
      {/* ---------------- hero ---------------- */}
      <section className="shell grid gap-14 pb-16 pt-14 md:pb-24 md:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-10">
        <div>
          <Reveal>
            <SectionLabel>Decants · Perfume Oil</SectionLabel>
          </Reveal>

          <Reveal delay={80}>
            <h1 className="display-xl mt-8 leading-[0.86]">
              Wear it
              <br />
              <span className="italic text-accent">first</span>.
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="mt-9 max-w-md text-lg leading-relaxed text-muted">
              We import the bottles and pour from them ourselves. The same fragrance the house
              made, in 6, 10, 15 or 30ml — so a bottle you love is a decision, not a gamble.
            </p>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-11 flex flex-wrap items-center gap-4">
              <ButtonLink href="/shop">Shop decants</ButtonLink>
              <ArrowLink href="/about" className="px-3 py-4">
                How we work
              </ArrowLink>
            </div>
          </Reveal>

          <Reveal delay={320}>
            <dl className="mt-16 grid max-w-lg grid-cols-3 gap-6 border-t border-line pt-8">
              {[
                ["6–30 ml", "Sizes poured"],
                ["৳3,000", "Free delivery over"],
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
          <div className="relative bg-paper-2 p-10 md:p-14">
            {/* No hero product: the shop can be empty, and a homepage that hard-codes
                a best seller starts lying the moment that product is delisted. The
                two categories are the thing that is always true. */}
            <div className="grid gap-px bg-line">
              {CATEGORIES.map((category) => (
                <Link
                  key={category.slug}
                  href={`/shop?category=${category.slug}`}
                  className="group flex items-center justify-between gap-6 bg-paper px-7 py-8 transition-colors duration-500 hover:bg-ink hover:text-paper"
                >
                  <div>
                    <p className="font-display text-3xl leading-none">{category.name}</p>
                    <p className="label mt-3 text-muted transition-colors group-hover:text-paper/60">
                      Shop the range
                    </p>
                  </div>
                  <span
                    aria-hidden
                    className="text-2xl transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1.5"
                  >
                    →
                  </span>
                </Link>
              ))}
            </div>
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
          "Poured to order",
          "Alcohol-free oils",
          "6 · 10 · 15 · 30 ml",
        ]}
      />

      {/* ---------------- 01 the idea ---------------- */}
      <section className="shell py-24 md:py-36">
        <Reveal>
          <SectionLabel index="01">The idea</SectionLabel>
        </Reveal>
        <Reveal delay={80}>
          <h2 className="display-lg mt-9 max-w-4xl">
            A full bottle is a long marriage.{" "}
            <span className="text-muted">Start with a few millilitres.</span>
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
                <SectionLabel index="02">The range</SectionLabel>
                <h2 className="display-md mt-7 max-w-xl">Two ways to wear it.</h2>
              </div>
              <ArrowLink href="/shop">See everything</ArrowLink>
            </div>
          </Reveal>

          <div className="mt-16 grid gap-px border border-line bg-line sm:grid-cols-2">
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
                  <span
                    aria-hidden
                    className="text-2xl transition-transform duration-500 group-hover:translate-x-2"
                  >
                    →
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- 03 featured ---------------- */}
      {featured.length > 0 ? (
        <section className="shell py-24 md:py-36">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <SectionLabel index="03">In stock now</SectionLabel>
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
      ) : null}

      {/* ---------------- 04 how it works ---------------- */}
      <section className="bg-night py-24 text-paper md:py-36">
        <div className="shell">
          <Reveal>
            <SectionLabel index="04" tone="paper">
              How it works
            </SectionLabel>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="display-lg mt-9 max-w-3xl text-paper">
              Bottle in, vial out. Nothing in between.
            </h2>
          </Reveal>

          <div className="mt-20 grid gap-14 sm:grid-cols-2 md:gap-10 lg:grid-cols-4">
            {STEPS.map((item, index) => (
              <Reveal key={item.step} delay={index * 100}>
                <article className="border-t border-paper/20 pt-7">
                  <p className="label text-accent-soft">{item.step}</p>
                  <h3 className="mt-4 font-display text-3xl text-paper">{item.title}</h3>
                  <p className="mt-5 text-sm leading-relaxed text-paper/60">{item.text}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- 05 questions ---------------- */}
      <section className="shell py-24 md:py-36">
        <Reveal>
          <SectionLabel index="05">Straight answers</SectionLabel>
        </Reveal>
        <Reveal delay={80}>
          <h2 className="display-md mt-7 max-w-2xl">The three things everyone asks.</h2>
        </Reveal>

        <dl className="mt-16 border-t border-line">
          {QUESTIONS.map((item, index) => (
            <Reveal key={item.q} delay={index * 70}>
              <div className="grid grid-cols-1 items-baseline gap-4 border-b border-line py-8 md:grid-cols-[18rem_1fr] md:gap-8">
                <dt className="font-display text-2xl md:text-3xl">{item.q}</dt>
                <dd className="max-w-2xl leading-relaxed text-muted">{item.a}</dd>
              </div>
            </Reveal>
          ))}
        </dl>
      </section>

      {/* ---------------- closing cta ---------------- */}
      <section className="shell py-24 text-center md:py-40">
        <Reveal>
          <h2 className="display-lg mx-auto max-w-4xl">
            Start with 6&nbsp;ml. <span className="text-muted">Commit later.</span>
          </h2>
        </Reveal>
        <Reveal delay={100}>
          <p className="mx-auto mt-8 max-w-lg leading-relaxed text-muted">
            The smallest size costs less than a bad full-bottle decision, and tells you the same
            thing.
          </p>
        </Reveal>
        <Reveal delay={180}>
          <div className="mt-11 flex flex-wrap justify-center gap-4">
            <ButtonLink href="/shop">Shop everything</ButtonLink>
            <ButtonLink href="/shop?category=oils" tone="outline">
              Browse the oils
            </ButtonLink>
          </div>
        </Reveal>
      </section>
    </>
  );
}
