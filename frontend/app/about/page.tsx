import type { Metadata } from "next";

import { Bottle } from "@/components/bottle";
import { Marquee } from "@/components/marquee";
import { Reveal } from "@/components/reveal";
import { SectionLabel } from "@/components/section-label";
import { ButtonLink } from "@/components/ui";
import { getProduct } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Story",
  description: "How Bakhoora blends, ages and bottles perfume in Dhaka.",
};

const STEPS = [
  {
    index: "01",
    title: "Sourcing",
    body: "Agarwood comes from two suppliers we have used since 2021 — one in Assam, one in Pursat. Every consignment is distilled to sample before we buy the lot.",
  },
  {
    index: "02",
    title: "Blending",
    body: "Formulas are written in grams, not drops, and logged. A blend that cannot be repeated is not a product, it is an accident.",
  },
  {
    index: "03",
    title: "Ageing",
    body: "Minimum eighteen months in glass, in the dark. Oud is harsh and medicinal when young; time is the only fix.",
  },
  {
    index: "04",
    title: "Bottling",
    body: "Filled and labelled by hand in Dhanmondi, in batches of two hundred. Batch number is printed on the base of every bottle.",
  },
];

export default function AboutPage() {
  const hero = getProduct("cambodi-oud")!;

  return (
    <>
      <section className="shell grid gap-14 pb-20 pt-14 md:pt-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <Reveal>
            <SectionLabel>Since 2019 · Dhanmondi, Dhaka</SectionLabel>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="display-lg mt-8">
              We sell time,
              <br />
              <span className="italic text-accent">in a bottle</span>.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-9 max-w-lg text-lg leading-relaxed text-muted">
              Bakhoora started as one shelf of attar in a family shop. Seven years later it is
              still one room, one blender, and a rule we have never broken: nothing ships before
              it is ready.
            </p>
          </Reveal>
        </div>

        <Reveal delay={120}>
          <div className="bg-paper-2">
            <Bottle tone={hero.tone} className="aspect-[4/5] w-full" />
          </div>
        </Reveal>
      </section>

      <Marquee items={["Small batch", "Hand filled", "Batch numbered", "Aged 18 months minimum"]} />

      <section className="shell py-24 md:py-32">
        <Reveal>
          <SectionLabel index="01">How it is made</SectionLabel>
        </Reveal>
        <div className="mt-14 grid gap-px border border-line bg-line sm:grid-cols-2">
          {STEPS.map((step, index) => (
            <Reveal key={step.index} delay={index * 80}>
              <article className="h-full bg-paper p-9">
                <p className="label text-accent">{step.index}</p>
                <h2 className="mt-5 font-display text-3xl">{step.title}</h2>
                <p className="mt-4 text-sm leading-relaxed text-muted">{step.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="bg-night py-24 text-paper md:py-32">
        <div className="shell">
          <Reveal>
            <SectionLabel index="02" tone="paper">
              What we will not do
            </SectionLabel>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="display-md mt-9 max-w-3xl text-paper">
              Call a synthetic accord &ldquo;pure oud&rdquo;. Rush a batch for Eid. Sell a tester
              as new.
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <p className="mt-9 max-w-xl leading-relaxed text-paper/60">
              If a blend is built on an accord rather than distilled oil, the product page says so.
              It costs us a few sales a month and it is the only reason anyone trusts the rest of
              the list.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="shell py-24 text-center md:py-32">
        <Reveal>
          <h2 className="display-md mx-auto max-w-2xl">Come and smell them yourself.</h2>
          <p className="mx-auto mt-7 max-w-md leading-relaxed text-muted">
            The studio is open Saturday to Thursday, 10:00 to 20:00. Dhanmondi 27, Dhaka 1209.
          </p>
          <div className="mt-10 flex justify-center">
            <ButtonLink href="/shop">Shop the collection</ButtonLink>
          </div>
        </Reveal>
      </section>
    </>
  );
}
