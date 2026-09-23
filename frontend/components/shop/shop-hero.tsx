import { SmokeCanvas } from "@/components/home/smoke-canvas";
import { SmokeText } from "@/components/home/smoke-text";
import { CollectionArt } from "@/components/shop/collection-art";

/**
 * The shop's opener, in the same room as the homepage: dark, a coal glowing
 * low in the frame, smoke rising and bending around the cursor. The header
 * floats over it (the section is marked data-hero). On the right, the
 * collection's picture sits on a lit shelf — a real photo if one has been
 * dropped into public/shop/, otherwise the drawn bottles.
 */
export function ShopHero({
  kicker,
  title,
  blurb,
  photo,
  art,
  count,
}: {
  kicker: string;
  title: string;
  blurb: string;
  photo: string | null;
  art: "decant" | "oil" | "all";
  count: number;
}) {
  return (
    <section
      data-hero
      className="relative -mt-[var(--header-h)] overflow-hidden bg-night text-paper"
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_45%_55%_at_75%_60%,rgba(184,67,28,0.22),transparent_70%),radial-gradient(ellipse_90%_70%_at_50%_0%,rgba(255,255,255,0.05),transparent_70%)]"
      />
      <SmokeCanvas origin={{ x: 0.5, y: 0.97 }} mobileOrigin={{ x: 0.82, y: 0.985 }} />

      <div className="shell relative z-10 grid items-center gap-10 pb-16 pt-[calc(var(--header-h)+3.5rem)] md:pb-20 lg:min-h-[78svh] lg:grid-cols-[1.05fr_1fr] lg:pt-[calc(var(--header-h)+2rem)]">
        <div>
          <p className="label text-paper/65">
            <SmokeText as="span" text={kicker} />
          </p>
          <SmokeText
            as="h1"
            text={title}
            delay={200}
            className="mt-5 text-[clamp(2.75rem,7.5vw,6.5rem)] font-bold uppercase leading-[0.95] tracking-[-0.02em]"
          />
          <SmokeText
            as="p"
            text={blurb}
            delay={500}
            className="mt-6 max-w-md leading-relaxed text-paper/70"
          />
          <p className="label mt-9 flex items-center gap-3 text-[0.65rem] text-paper/55">
            <span aria-hidden className="ember block size-2" />
            <span className="tabular-nums">
              {count} {count === 1 ? "fragrance" : "fragrances"} on the shelf
            </span>
          </p>
        </div>

        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl ring-1 ring-paper/10 [background:radial-gradient(ellipse_at_50%_70%,rgba(255,255,255,0.10),rgba(255,255,255,0.02)_70%)] backdrop-blur-[2px]">
          {photo ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={photo} alt={title} className="h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 p-[6%]">
              <CollectionArt kind={art} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
