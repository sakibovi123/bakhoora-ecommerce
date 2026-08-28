interface BottleProps {
  tone: [string, string];
  /** Squat flacons for sprays, slim vials for oils. */
  shape?: "flacon" | "vial";
  className?: string;
}

/**
 * Product imagery is drawn, not photographed — one consistent silhouette per format,
 * tinted per product. No asset pipeline, no mismatched crops.
 */
export function Bottle({ tone, shape = "flacon", className }: BottleProps) {
  const [light, dark] = tone;
  // Deterministic gradient id keeps this a server component (no useId hook).
  const id = `${light}${dark}${shape}`.replace(/[^a-z0-9]/gi, "");
  const slim = shape === "vial";

  const bodyX = slim ? 158 : 130;
  const bodyW = slim ? 84 : 140;
  const bodyY = slim ? 176 : 190;
  const bodyH = slim ? 300 : 290;
  const radius = slim ? 14 : 26;

  return (
    <svg
      viewBox="0 0 400 520"
      role="presentation"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={`liquid-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={light} />
          <stop offset="100%" stopColor={dark} />
        </linearGradient>
        <linearGradient id={`glass-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="38%" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.10" />
        </linearGradient>
        <clipPath id={`body-${id}`}>
          <rect x={bodyX} y={bodyY} width={bodyW} height={bodyH} rx={radius} />
        </clipPath>
      </defs>

      {/* arch backdrop */}
      <path
        d="M60 470 L60 230 A140 140 0 0 1 340 230 L340 470 Z"
        fill={light}
        opacity="0.14"
      />

      <ellipse cx="200" cy="486" rx={slim ? 62 : 92} ry="11" fill={dark} opacity="0.12" />

      {/* cap */}
      <rect
        x={slim ? 180 : 168}
        y="92"
        width={slim ? 40 : 64}
        height="52"
        rx="9"
        fill={dark}
      />
      <rect
        x={slim ? 180 : 168}
        y="92"
        width={slim ? 40 : 64}
        height="52"
        rx="9"
        fill={`url(#glass-${id})`}
      />
      {/* collar */}
      <rect x={slim ? 184 : 176} y="138" width={slim ? 32 : 48} height="12" rx="4" fill={dark} opacity="0.75" />
      {/* neck */}
      <rect x={slim ? 188 : 182} y="146" width={slim ? 24 : 36} height="48" rx="4" fill={dark} opacity="0.55" />

      {/* body */}
      <rect
        x={bodyX}
        y={bodyY}
        width={bodyW}
        height={bodyH}
        rx={radius}
        fill={light}
        opacity="0.22"
      />
      <g clipPath={`url(#body-${id})`}>
        <rect
          x={bodyX}
          y={bodyY + bodyH * 0.18}
          width={bodyW}
          height={bodyH}
          fill={`url(#liquid-${id})`}
        />
        <rect x={bodyX} y={bodyY} width={bodyW} height={bodyH} fill={`url(#glass-${id})`} />
      </g>
      <rect
        x={bodyX}
        y={bodyY}
        width={bodyW}
        height={bodyH}
        rx={radius}
        fill="none"
        stroke={dark}
        strokeOpacity="0.35"
      />

      {/* highlight */}
      <rect
        x={bodyX + 16}
        y={bodyY + 26}
        width="9"
        height={bodyH * 0.55}
        rx="5"
        fill="#ffffff"
        opacity="0.3"
      />

      {/* label band */}
      <rect
        x={bodyX + (slim ? 12 : 22)}
        y={bodyY + bodyH * 0.52}
        width={bodyW - (slim ? 24 : 44)}
        height={slim ? 52 : 62}
        rx="3"
        fill="#f6f2ea"
        opacity="0.9"
      />
      <rect
        x={bodyX + (slim ? 22 : 36)}
        y={bodyY + bodyH * 0.52 + (slim ? 16 : 20)}
        width={bodyW - (slim ? 44 : 72)}
        height="2"
        fill={dark}
        opacity="0.55"
      />
      <rect
        x={bodyX + (slim ? 22 : 36)}
        y={bodyY + bodyH * 0.52 + (slim ? 26 : 32)}
        width={(bodyW - (slim ? 44 : 72)) * 0.6}
        height="2"
        fill={dark}
        opacity="0.3"
      />
    </svg>
  );
}
