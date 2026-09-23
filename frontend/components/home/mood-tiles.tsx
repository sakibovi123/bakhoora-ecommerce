import Link from "next/link";

import { Reveal } from "@/components/reveal";

export interface Mood {
  name: string;
  line: string;
  query: string;
  /** Two stops for the tile's ground; the smoke drifts over it. */
  ground: [string, string];
  ink: "paper" | "ink";
}

/**
 * The logo's own tagline — oud, amber, resin — plus the one people ask for
 * when they want none of that. Tall tiles in a row; on a wide screen the one
 * you hover opens out and its neighbours give way, and smoke keeps drifting
 * up through every one of them.
 */
export function MoodTiles({ moods }: { moods: Mood[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:flex lg:h-[34rem]">
      {moods.map((mood, index) => (
        <div
          key={mood.name}
          className="lg:min-w-0 lg:flex-1 lg:transition-[flex-grow] lg:duration-700 lg:ease-[cubic-bezier(0.16,1,0.3,1)] lg:hover:flex-[1.9]"
        >
          <Reveal delay={index * 90} className="h-full">
            <Link
              href={`/shop?q=${encodeURIComponent(mood.query)}`}
              className={`group relative flex h-[26rem] flex-col justify-end overflow-hidden rounded-md p-6 shadow-[0_18px_50px_rgba(0,0,0,0.08)] lg:h-full ${
                mood.ink === "paper" ? "text-paper" : "text-ink"
              }`}
              style={{ background: `linear-gradient(165deg, ${mood.ground[0]}, ${mood.ground[1]})` }}
            >
              {/* Smoke: a few soft blooms, each on its own clock. */}
              {[0, 1, 2, 3].map((n) => (
                <span
                  key={n}
                  aria-hidden
                  className="drift absolute bottom-0 block rounded-full blur-2xl"
                  style={
                    {
                      left: `${10 + n * 22}%`,
                      width: `${38 + (n % 2) * 18}%`,
                      aspectRatio: "1",
                      background:
                        mood.ink === "paper" ? "rgba(255,255,255,0.14)" : "rgba(11,11,12,0.08)",
                      "--dur": `${8 + n * 1.7}s`,
                      "--delay": `${index * 0.8 + n * 1.9}s`,
                    } as React.CSSProperties
                  }
                />
              ))}

              <span
                aria-hidden
                className="ember absolute left-6 top-6 block size-2 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
              />

              <div className="relative">
                <p className="label text-[0.625rem] opacity-60">Collection</p>
                <h3 className="mt-2 text-3xl font-medium">{mood.name}</h3>
                <p className="mt-3 max-w-[22rem] text-sm leading-relaxed opacity-75 transition-[opacity,max-height] duration-700 lg:max-h-0 lg:opacity-0 lg:group-hover:max-h-24 lg:group-hover:opacity-75">
                  {mood.line}
                </p>
                <span className="label mt-5 inline-flex items-center gap-2 text-[0.625rem]">
                  Explore
                  <span
                    aria-hidden
                    className="transition-transform duration-500 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  >
                    ↗
                  </span>
                </span>
              </div>
            </Link>
          </Reveal>
        </div>
      ))}
    </div>
  );
}
