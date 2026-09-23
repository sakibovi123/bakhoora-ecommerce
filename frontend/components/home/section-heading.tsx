"use client";

import { useInView } from "@/lib/use-in-view";

/**
 * The uppercase title with a hairline running off it — the rule burns across
 * from the words with an ember at its tip. Right-aligned titles burn leftward.
 */
export function SectionHeading({
  title,
  kicker,
  align = "left",
  tone = "ink",
}: {
  title: string;
  kicker?: string;
  align?: "left" | "right";
  tone?: "ink" | "paper";
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const right = align === "right";
  const muted = tone === "ink" ? "text-muted" : "text-paper/55";

  return (
    <div ref={ref} className={inView ? "is-in" : ""}>
      <div className={`flex items-center gap-5 ${right ? "flex-row-reverse" : ""}`}>
        <h2 className="smoke-word text-[clamp(1.5rem,3vw,2.25rem)] font-normal uppercase tracking-[0.08em]">
          {title}
        </h2>
        <span aria-hidden className="burn-rule" data-origin={right ? "right" : "left"} />
      </div>
      {kicker ? (
        <p className={`label mt-2 ${muted} ${right ? "text-right" : ""}`}>
          <span className="smoke-word" style={{ "--i": 2 } as React.CSSProperties}>
            {kicker}
          </span>
        </p>
      ) : null}
    </div>
  );
}
