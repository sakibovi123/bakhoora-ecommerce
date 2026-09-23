"use client";

import { useEffect, useRef } from "react";

import { prefersReducedMotion } from "@/lib/use-in-view";

/**
 * Giant serif verbs that drift on their own and answer the scroll wheel:
 * scroll down and they surge forward and lean into it, scroll up and they
 * reverse. Alternate words are outlined, and whichever one is crossing the
 * centre of the screen fills with ember — the strip reads like a coal line
 * catching as it passes.
 */
export function VelocityMarquee({ words }: { words: string[] }) {
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || prefersReducedMotion()) return;

    let offset = 0;
    let direction = 1;
    let velocity = 0;
    let lastY = window.scrollY;
    let raf = 0;
    let visible = true;
    const items = Array.from(track.querySelectorAll<HTMLElement>("[data-word]"));

    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY;
      lastY = y;
      velocity += delta * 0.08;
      if (Math.abs(delta) > 1) direction = delta > 0 ? 1 : -1;
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    observer.observe(track);

    const tick = () => {
      raf = requestAnimationFrame(tick);
      velocity *= 0.92;
      if (!visible) return;

      const half = track.scrollWidth / 2;
      offset -= (0.6 + Math.abs(velocity)) * direction;
      if (offset <= -half) offset += half;
      if (offset > 0) offset -= half;

      const skew = Math.max(Math.min(velocity * -0.6, 12), -12);
      track.style.transform = `translate3d(${offset}px,0,0) skewX(${skew}deg)`;

      // Light the word that is crossing the middle of the viewport.
      const centre = window.innerWidth / 2;
      for (const item of items) {
        const rect = item.getBoundingClientRect();
        const lit = rect.left < centre && rect.right > centre;
        if (lit !== (item.dataset.lit === "true")) item.dataset.lit = String(lit);
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const strip = [...words, ...words];

  return (
    <div className="overflow-hidden py-6 md:py-10" aria-hidden>
      <div ref={trackRef} className="flex w-max will-change-transform">
        {strip.map((word, index) => (
          <span
            key={`${word}-${index}`}
            data-word
            className={`px-[clamp(1.1rem,3.8vw,3.5rem)] font-serif text-[clamp(2.5rem,6.2vw,5.75rem)] font-black uppercase leading-none transition-[color,-webkit-text-stroke-color,text-shadow] duration-500 data-[lit=true]:text-accent data-[lit=true]:[-webkit-text-stroke-color:var(--color-accent)] data-[lit=true]:[text-shadow:0_0_40px_rgba(234,120,60,0.35)] ${
              index % 2 ? "text-transparent [-webkit-text-stroke:1.5px_var(--color-ink)]" : "text-ink"
            }`}
          >
            {word}
          </span>
        ))}
      </div>
    </div>
  );
}
