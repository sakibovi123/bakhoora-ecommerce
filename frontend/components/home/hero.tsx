"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { SmokeCanvas } from "@/components/home/smoke-canvas";
import { SmokeText } from "@/components/home/smoke-text";
import { prefersReducedMotion } from "@/lib/use-in-view";

/**
 * Full-bleed opener. The header floats over it (see SiteHeader's `overHero`),
 * so the section pulls itself up under the bar with a negative margin.
 *
 * As you scroll away the copy lifts and thins out while the smoke keeps
 * rising behind it — the page leaves, the coal stays lit.
 */
export function Hero() {
  const copyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const copy = copyRef.current;
    if (!copy || prefersReducedMotion()) return;

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const k = Math.min(window.scrollY / window.innerHeight, 1);
        copy.style.transform = `translate3d(0, ${k * -90}px, 0)`;
        copy.style.opacity = String(1 - k * 1.2);
        copy.style.filter = `blur(${k * 6}px)`;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <section className="relative -mt-[var(--header-h)] flex min-h-[calc(100svh-2.5rem)] items-end overflow-hidden bg-night text-paper">
      {/* The room the coal sits in: a warm floor glow and a cold vignette. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_60%_45%_at_72%_92%,rgba(184,67,28,0.28),transparent_70%),radial-gradient(ellipse_90%_70%_at_50%_0%,rgba(255,255,255,0.06),transparent_70%)] max-md:bg-[radial-gradient(ellipse_90%_40%_at_50%_95%,rgba(184,67,28,0.3),transparent_70%)]"
      />
      <SmokeCanvas />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-night/70 to-transparent"
      />

      <div ref={copyRef} className="shell relative z-10 pb-24 pt-40 will-change-transform md:pb-28">
        <p className="label text-paper/70">
          <SmokeText as="span" text="Decants · Perfume oil · Poured in Dhaka" />
        </p>

        <SmokeText
          as="h1"
          text="WEAR IT FIRST."
          delay={250}
          className="mt-5 max-w-4xl text-[clamp(2.75rem,8.5vw,7.5rem)] font-bold leading-[0.95] tracking-[-0.02em]"
        />

        <SmokeText
          as="p"
          text="The same fragrance the house made, poured from bottles we import ourselves — in 6, 10, 15 or 30ml, so a bottle you love is a decision, not a gamble."
          delay={600}
          className="mt-6 max-w-md text-[0.95rem] leading-relaxed text-paper/75"
        />

        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Link
            href="/shop?category=decants"
            className="label group inline-flex items-center gap-3 rounded-full bg-paper px-7 py-4 text-ink transition-transform duration-300 hover:-translate-y-0.5 active:scale-[0.98]"
          >
            Explore decants
            <span
              aria-hidden
              className="transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            >
              ↗
            </span>
          </Link>
          <Link
            href="/shop?category=oils"
            className="label inline-flex items-center gap-3 rounded-full border border-paper/35 px-7 py-4 text-paper backdrop-blur-sm transition-colors duration-300 hover:border-paper hover:bg-paper/10"
          >
            Perfume oil
          </Link>
        </div>
      </div>

      <p className="label absolute bottom-8 right-5 z-10 hidden items-center gap-3 text-paper/55 md:right-10 md:flex">
        Move your cursor through the smoke
      </p>
    </section>
  );
}
