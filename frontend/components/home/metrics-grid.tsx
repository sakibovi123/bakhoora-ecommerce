"use client";

import { useEffect, useRef, useState } from "react";

import { prefersReducedMotion, useInView } from "@/lib/use-in-view";

export interface Metric {
  kicker: string;
  title: string;
  note: string;
  /** When set, the title's leading number counts up from zero. */
  count?: number;
}

/**
 * The facts, as a masonry wall of small cards. Each one rises in on its own
 * beat, tilted a degree off true and settling flat, like cards dealt onto a
 * table; any card with a figure counts up to it.
 */
export function MetricsGrid({ metrics }: { metrics: Metric[] }) {
  const [ref, inView] = useInView<HTMLDivElement>();

  return (
    <div ref={ref} className="columns-1 gap-3 min-[400px]:columns-2 md:columns-3 lg:columns-4 xl:columns-6 [&>*]:mb-3">
      {metrics.map((metric, index) => (
        <article
          key={metric.kicker}
          className="break-inside-avoid rounded-xl bg-paper p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_10px_30px_rgba(0,0,0,0.06)] ring-1 ring-black/5 transition-[opacity,transform,box-shadow] duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(0,0,0,0.10)]"
          style={{
            opacity: inView ? 1 : 0,
            transform: inView
              ? undefined
              : `translateY(2.5rem) rotate(${index % 2 ? 2 : -2}deg)`,
            transitionDelay: inView ? `${(index % 6) * 80 + Math.floor(index / 6) * 120}ms` : "0ms",
          }}
        >
          <p className="label text-[0.6rem] leading-relaxed text-muted">{metric.kicker}</p>
          <h3 className="mt-2 text-lg font-semibold leading-tight tracking-[-0.01em] sm:text-xl">
            {metric.count !== undefined ? (
              <CountUp to={metric.count} run={inView} suffix={metric.title} />
            ) : (
              metric.title
            )}
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-muted">{metric.note}</p>
        </article>
      ))}
    </div>
  );
}

function CountUp({ to, run, suffix }: { to: number; run: boolean; suffix: string }) {
  const [value, setValue] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (!run || started.current) return;
    started.current = true;
    if (prefersReducedMotion()) {
      setValue(to);
      return;
    }
    const start = performance.now();
    const duration = 1600;
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min((now - start) / duration, 1);
      setValue(Math.round(to * (1 - Math.pow(1 - k, 4))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, to]);

  return (
    <span className="tabular-nums">
      {value.toLocaleString("en-US")}
      {suffix}
    </span>
  );
}
