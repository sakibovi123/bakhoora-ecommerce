import Link from "next/link";

/**
 * Every house on the shelf, as chips drifting in two lanes that pass each
 * other in opposite directions. Hovering a lane holds it still so a name can
 * be clicked. Each chip searches the shop for that house.
 */
export function BrandLanes({ brands }: { brands: string[] }) {
  const half = Math.ceil(brands.length / 2);
  const lanes = brands.length > 8 ? [brands.slice(0, half), brands.slice(half)] : [brands];

  return (
    <div className="relative space-y-4 [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
      {lanes.map((lane, index) => {
        // Short lanes repeat so the strip is always wider than the screen.
        const fill = Array.from({ length: Math.max(2, Math.ceil(16 / lane.length)) }, () => lane).flat();
        const strip = [...fill, ...fill];
        return (
          <div key={index} className="overflow-hidden py-2">
            <div
              className="lane flex w-max gap-3.5"
              data-reverse={index % 2 === 1}
              style={{ "--dur": `${strip.length * 2.4}s` } as React.CSSProperties}
            >
              {strip.map((brand, n) => (
                <Link
                  key={`${brand}-${n}`}
                  href={`/shop?q=${encodeURIComponent(brand)}`}
                  tabIndex={n < fill.length ? 0 : -1}
                  aria-hidden={n >= fill.length || undefined}
                  className="label flex h-11 items-center whitespace-nowrap rounded bg-paper px-6 text-[0.75rem] text-ink/70 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.06)] ring-1 ring-black/5 transition-[color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:text-ink hover:shadow-[0_4px_12px_rgba(0,0,0,0.08),0_12px_32px_rgba(0,0,0,0.10)]"
                >
                  {brand}
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
