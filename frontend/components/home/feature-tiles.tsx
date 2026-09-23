"use client";

import Link from "next/link";
import type { PointerEvent } from "react";

import { Bottle } from "@/components/bottle";
import { useInView } from "@/lib/use-in-view";

interface Tile {
  href: string;
  title: string;
  cta: string;
  shape: "flacon" | "vial";
  /** Three tints, back to front. */
  tones: [string, string][];
  ground: string;
}

/**
 * The two things we sell, as two big doors. Each one is unveiled by a curtain
 * lifting off it as it scrolls in, and the bottles inside sit at three depths
 * that follow the pointer — a small still life you can lean around.
 */
export function FeatureTiles({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {tiles.map((tile, index) => (
        <FeatureTile key={tile.href} tile={tile} index={index} />
      ))}
    </div>
  );
}

function FeatureTile({ tile, index }: { tile: Tile; index: number }) {
  // Observed on a wrapper: Chrome measures a clipped element by its clip, so
  // a tile hidden behind its own curtain would never register as on screen.
  const [ref, inView] = useInView<HTMLDivElement>();

  function onMove(event: PointerEvent<HTMLAnchorElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    event.currentTarget.style.setProperty("--px", x.toFixed(3));
    event.currentTarget.style.setProperty("--py", y.toFixed(3));
  }

  function onLeave(event: PointerEvent<HTMLAnchorElement>) {
    event.currentTarget.style.setProperty("--px", "0");
    event.currentTarget.style.setProperty("--py", "0");
  }

  return (
    <div ref={ref}>
      <Link
        href={tile.href}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        className="group block overflow-hidden rounded-md shadow-[0_18px_50px_rgba(0,0,0,0.10)] transition-[clip-path] duration-[1.4s] ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{
          // The sides and bottom sit outside the tile so its shadow survives
          // the clip; only the top edge moves.
          clipPath: inView ? "inset(-20% -8% -30% -8%)" : "inset(100% -8% -30% -8%)",
          transitionDelay: `${index * 120}ms`,
        }}
      >
        <div className="relative aspect-[16/10] overflow-hidden" style={{ background: tile.ground }}>
          {/* A low shelf of light for the bottles to stand in. */}
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/10 to-transparent"
          />
          <div
            aria-hidden
            className="absolute left-1/2 top-[18%] size-[46%] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl transition-opacity duration-700 group-hover:opacity-100 md:opacity-60"
          />

          {tile.tones.map((tone, depth) => {
            const place = [
              "left-[14%] bottom-[6%] h-[62%]",
              "left-[60%] bottom-[8%] h-[70%]",
              "left-[36%] bottom-[2%] h-[86%]",
            ][depth];
            const pull = [10, 18, 30][depth];
            return (
              <div
                key={depth}
                aria-hidden
                className={`absolute ${place} transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]`}
                style={{
                  transform: `translate3d(calc(var(--px, 0) * ${pull}px), calc(var(--py, 0) * ${pull}px), 0)`,
                }}
              >
                <Bottle
                  tone={tone}
                  shape={tile.shape}
                  className="h-full w-auto drop-shadow-[0_24px_24px_rgba(0,0,0,0.18)] transition-transform duration-[1.2s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-2"
                />
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between bg-ink px-5 py-4 text-paper">
          <span className="text-lg font-medium">{tile.title}</span>
          <span className="label relative text-[0.625rem]">
            {tile.cta}
            <span
              aria-hidden
              className="absolute -bottom-1 left-0 h-px w-full origin-right bg-paper transition-transform duration-500 group-hover:origin-left group-hover:scale-x-110"
            />
          </span>
        </div>
      </Link>
    </div>
  );
}
