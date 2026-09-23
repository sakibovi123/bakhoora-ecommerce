"use client";

import { useRef } from "react";

import { SmokeText } from "@/components/home/smoke-text";
import { ButtonLink } from "@/components/ui";
import { useInView } from "@/lib/use-in-view";

/**
 * How an order travels, as a row of cards beside the heading. A thread runs
 * through the step numbers and burns from one to the next as it scrolls in,
 * so the four cards read as one journey rather than four facts.
 */
export function StepsRail({ steps }: { steps: { step: string; title: string; text: string }[] }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [ref, inView] = useInView<HTMLDivElement>();

  function page(direction: 1 | -1) {
    railRef.current?.scrollBy({ left: direction * 300, behavior: "smooth" });
  }

  return (
    <section className="shell py-20 md:py-28">
      <div className="grid gap-10 lg:grid-cols-[1fr_2.6fr] lg:gap-12">
        <div>
          <p className="label text-muted">How it works</p>
          <SmokeText
            text="Poured. Sealed. Sent."
            className="mt-4 text-[clamp(2.5rem,4.5vw,3.5rem)] font-medium leading-[1.02] tracking-[-0.03em]"
          />
          <p className="mt-5 max-w-xs leading-relaxed text-muted">
            Bottle in, vial out. Nothing in between — and nothing added.
          </p>
          <ButtonLink href="/about" className="mt-7 rounded-md px-5 py-3 normal-case tracking-normal">
            Read our process
          </ButtonLink>
        </div>

        {/* min-w-0: a grid item otherwise grows to fit its widest child, and
            the card rail is meant to scroll, not stretch the page. */}
        <div ref={ref} className={`min-w-0 ${inView ? "is-in" : ""}`}>
          <div ref={railRef} className="no-scrollbar -mx-5 flex snap-x gap-4 overflow-x-auto px-5 pb-6 pt-2 md:mx-0 md:px-0">
            {steps.map((item, index) => (
              <article
                key={item.step}
                className="relative w-[78%] shrink-0 snap-start rounded-xl bg-paper p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_14px_40px_rgba(0,0,0,0.07)] ring-1 ring-black/5 sm:w-[46%] lg:w-[15.5rem] xl:w-[calc((100%-3rem)/4)]"
              >
                <div className="flex items-center gap-3">
                  <span className="font-serif text-3xl font-black text-accent">{item.step}</span>
                  {index < steps.length - 1 ? (
                    <span aria-hidden className="burn-rule" style={{ transitionDelay: `${0.3 + index * 0.35}s` }} />
                  ) : null}
                </div>
                <h3 className="mt-6 text-lg font-semibold tracking-[-0.01em]">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">{item.text}</p>
              </article>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <p className="label text-[0.625rem] text-muted">Swipe to see more ← →</p>
            <div className="flex">
              <button
                type="button"
                onClick={() => page(-1)}
                aria-label="Previous"
                className="grid size-10 place-items-center rounded-l-md bg-paper-2 hover:bg-paper-3"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => page(1)}
                aria-label="Next"
                className="grid size-10 place-items-center rounded-r-md bg-ink text-paper hover:bg-ink-2"
              >
                ›
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
