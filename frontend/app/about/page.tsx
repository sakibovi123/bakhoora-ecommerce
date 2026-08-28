import type { Metadata } from "next";

import { Bottle } from "@/components/bottle";
import { Marquee } from "@/components/marquee";
import { Reveal } from "@/components/reveal";
import { SectionLabel } from "@/components/section-label";
import { ButtonLink } from "@/components/ui";
import { toneFor } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "How we work",
  description: "How Bakhoora imports, decants and bottles perfume in Dhaka.",
};

const STEPS = [
  {
    index: "01",
    title: "Buying",
    body: "Full retail bottles, imported, and perfume oil bought by the bottle from the market. We buy to decant — never decanted stock bought on from someone else.",
  },
  {
    index: "02",
    title: "Checking",
    body: "Every bottle is opened, smelled and logged against the last one we bought of it. If a batch does not smell like the batch before it, it does not get poured.",
  },
  {
    index: "03",
    title: "Pouring",
    body: "Hand-filled into new glass, one fragrance at a time, with a fresh pipette for each so nothing carries over. Poured the day it ships, not months ahead.",
  },
  {
    index: "04",
    title: "Labelling",
    body: "Fragrance name and size on every vial, and the source bottle recorded against the batch — so if you ask what yours came out of, we can tell you.",
  },
];

export default function AboutPage() {
  return (
    <>
      <section className="shell grid gap-14 pb-20 pt-14 md:pt-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <Reveal>
            <SectionLabel>Dhanmondi, Dhaka</SectionLabel>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="display-lg mt-8">
              We do not make it.
              <br />
              <span className="italic text-accent">We split it</span>.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-9 max-w-lg text-lg leading-relaxed text-muted">
              Bakhoora is a decanter. We buy the bottle, then pour it into sizes people can
              actually finish — and we buy perfume oil the same way, by the bottle, and pour that
              too. What is in your vial is what was in the bottle. That is the whole business.
            </p>
          </Reveal>
        </div>

        <Reveal delay={120}>
          {/* The transfer, drawn: the bottle that comes in, and the vial that
              goes out. Says what a decant is faster than the paragraph does. */}
          <div className="grid grid-cols-2 gap-px bg-line">
            {[
              { label: "What we buy", shape: "flacon" as const },
              { label: "What you get", shape: "vial" as const },
            ].map((item) => (
              <div key={item.label} className="bg-paper-2 p-4">
                <Bottle
                  tone={toneFor(item.label)}
                  shape={item.shape}
                  className="aspect-[4/5] w-full"
                />
                <p className="label mt-2 text-center text-muted">{item.label}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      <Marquee
        items={["Poured to order", "Hand filled", "Fresh glass", "6 · 10 · 15 · 30 ml"]}
      />

      <section className="shell py-24 md:py-32">
        <Reveal>
          <SectionLabel index="01">How it is done</SectionLabel>
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
              Dilute a decant. Call ourselves an official stockist. Pour from a bottle we cannot
              account for.
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <p className="mt-9 max-w-xl leading-relaxed text-paper/60">
              We are independent. We are not an authorised dealer for any house, we are not
              affiliated with the brands whose bottles we split, and we do not pretend the vial is
              the boxed original. You are buying the fragrance, poured honestly, at a size that
              makes sense — and nothing more than that.
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
            <ButtonLink href="/shop">Shop the range</ButtonLink>
          </div>
        </Reveal>
      </section>
    </>
  );
}
