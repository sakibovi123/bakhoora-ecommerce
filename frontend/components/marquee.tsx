export function Marquee({ items }: { items: string[] }) {
  const strip = [...items, ...items];

  return (
    <div className="overflow-hidden border-y border-line py-5" aria-hidden>
      <div className="marquee-track flex w-max gap-14 pr-14">
        {strip.map((item, index) => (
          <span key={`${item}-${index}`} className="label flex items-center gap-14 text-muted">
            {item}
            <span className="text-accent">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}
