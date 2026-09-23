/**
 * The picture beside a collection's title, drawn rather than photographed:
 * a row of glass atomisers in the four sizes we pour (or dropper vials, for
 * oil) standing on a plinth. The liquid rocks, and on the atomisers every
 * few seconds the tallest one lets off a puff of mist that drifts and thins.
 *
 * Pure SVG + CSS, so it is a server component and costs no JavaScript.
 */

const SIZES = [
  { ml: 6, h: 118, x: 70 },
  { ml: 10, h: 150, x: 150 },
  { ml: 30, h: 214, x: 240 },
  { ml: 15, h: 176, x: 336 },
];

const LIQUIDS: [string, string][] = [
  ["#e7b98b", "#b8662e"],
  ["#d8d1c2", "#9c8f78"],
  ["#c9793d", "#6b2c10"],
  ["#3b3b3f", "#0b0b0c"],
];

export function CollectionArt({ kind }: { kind: "decant" | "oil" | "all" }) {
  const oil = kind === "oil";

  return (
    <svg
      viewBox="0 0 440 340"
      role="img"
      aria-label={oil ? "Perfume oil vials in four sizes" : "Decant atomisers in four sizes"}
      className="collection-art h-full w-full"
    >
      <defs>
        <linearGradient id="ca-glass" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="0.3" stopColor="#fff" stopOpacity="0.15" />
          <stop offset="0.8" stopColor="#000" stopOpacity="0.05" />
          <stop offset="1" stopColor="#000" stopOpacity="0.14" />
        </linearGradient>
        <linearGradient id="ca-metal" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#6b6b70" />
          <stop offset="0.35" stopColor="#e9e9ea" />
          <stop offset="0.6" stopColor="#9a9a9f" />
          <stop offset="1" stopColor="#4a4a4f" />
        </linearGradient>
        <linearGradient id="ca-plinth" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4f3f1" />
          <stop offset="1" stopColor="#dcd9d4" />
        </linearGradient>
        <radialGradient id="ca-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ea7a3c" stopOpacity="0.28" />
          <stop offset="1" stopColor="#ea7a3c" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ca-mist" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#c8ccc9" stopOpacity="0.9" />
          <stop offset="1" stopColor="#c8ccc9" stopOpacity="0" />
        </radialGradient>
        {LIQUIDS.map(([light, dark], index) => (
          <linearGradient key={index} id={`ca-liquid-${index}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={light} />
            <stop offset="1" stopColor={dark} />
          </linearGradient>
        ))}
      </defs>

      {/* warm light behind the group */}
      <ellipse cx="220" cy="190" rx="200" ry="140" fill="url(#ca-glow)" className="ca-breathe" />

      {/* plinth */}
      <path d="M30 292 L410 292 L430 312 L10 312 Z" fill="url(#ca-plinth)" />
      <rect x="10" y="312" width="420" height="18" fill="#cfcbc5" />

      {SIZES.map((size, index) => {
        const width = 50;
        const top = 292 - size.h;
        const bodyTop = top + (oil ? 46 : 40);
        const bodyH = 292 - bodyTop;
        const level = bodyTop + bodyH * 0.22;
        const clip = `ca-body-${index}`;
        return (
          <g key={size.ml} className="ca-bottle" style={{ animationDelay: `${index * 0.15}s` }}>
            {/* floor shadow */}
            <ellipse cx={size.x + width / 2} cy="293" rx={width * 0.62} ry="5" fill="#000" opacity="0.14" />

            <clipPath id={clip}>
              <rect x={size.x} y={bodyTop} width={width} height={bodyH} rx="9" />
            </clipPath>

            {/* liquid, with a rocking surface */}
            <g clipPath={`url(#${clip})`}>
              <rect x={size.x - 10} y={level} width={width + 20} height={bodyH} fill={`url(#ca-liquid-${index})`} />
              <path
                className="ca-wave"
                style={{ animationDelay: `${index * -0.7}s` }}
                d={`M${size.x - 40} ${level} q 12.5 -5 25 0 t 25 0 t 25 0 t 25 0 t 25 0 t 25 0 V ${level + 8} H ${size.x - 40} Z`}
                fill={LIQUIDS[index][0]}
              />
            </g>

            {/* glass */}
            <rect x={size.x} y={bodyTop} width={width} height={bodyH} rx="9" fill="url(#ca-glass)" stroke="#000" strokeOpacity="0.12" />
            <rect x={size.x + 7} y={bodyTop + 10} width="4" height={bodyH - 20} rx="2" fill="#fff" opacity="0.7" />

            {/* label */}
            <rect x={size.x + 9} y={bodyTop + bodyH * 0.42} width={width - 18} height="30" rx="2" fill="#fbfaf7" opacity="0.95" />
            <text
              x={size.x + width / 2}
              y={bodyTop + bodyH * 0.42 + 13}
              textAnchor="middle"
              fontSize="5.2"
              letterSpacing="0.6"
              fill="#0b0b0c"
              fontFamily="var(--font-playfair), serif"
            >
              BAKHOORA
            </text>
            <text x={size.x + width / 2} y={bodyTop + bodyH * 0.42 + 24} textAnchor="middle" fontSize="7" fill="#6b6b70">
              {size.ml} ML
            </text>

            {oil ? (
              <>
                {/* dropper: collar and rubber bulb */}
                <rect x={size.x + 13} y={bodyTop - 12} width={width - 26} height="14" rx="2" fill="url(#ca-metal)" />
                <path
                  d={`M${size.x + 17} ${bodyTop - 12} v -18 a ${(width - 34) / 2} ${(width - 34) / 2} 0 0 1 ${width - 34} 0 v 18 Z`}
                  fill="#1d1d1f"
                />
              </>
            ) : (
              <>
                {/* atomiser: crimp collar, actuator, nozzle */}
                <rect x={size.x + 12} y={bodyTop - 10} width={width - 24} height="12" rx="2" fill="url(#ca-metal)" />
                <rect x={size.x + 16} y={bodyTop - 26} width={width - 32} height="17" rx="3" fill="url(#ca-metal)" />
                <rect x={size.x + width - 18} y={bodyTop - 21} width="5" height="3" rx="1" fill="#2a2a2e" />
              </>
            )}
          </g>
        );
      })}

      {/* a puff of mist from the tallest atomiser */}
      {oil ? null : (
        <g transform={`translate(${SIZES[2].x + 38} ${292 - SIZES[2].h + 20})`}>
          {[0, 1, 2, 3, 4].map((n) => (
            <circle
              key={n}
              className="ca-mist"
              r={6 + n * 2}
              fill="url(#ca-mist)"
              style={
                {
                  animationDelay: `${n * 0.09}s`,
                  "--dx": `${40 + n * 14}px`,
                  "--dy": `${-18 - n * 7}px`,
                } as React.CSSProperties
              }
            />
          ))}
        </g>
      )}
    </svg>
  );
}
