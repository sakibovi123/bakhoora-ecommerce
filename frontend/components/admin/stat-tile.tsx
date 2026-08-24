import type { ComponentType, ReactNode } from "react";

import type { IconProps } from "@/components/admin/icons";
import { TONE_TEXT, type Tone, toneVars } from "@/components/admin/tone";

/** 1284 → "1,284"; 12900 → "12.9K". Keeps a tile's value from wrapping. */
export function compact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 10_000) return `${(value / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat("en-BD").format(value);
}

export function StatTile({
  label,
  value,
  note,
  hero = false,
  tone = "neutral",
  icon: Glyph,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  /** Exactly one hero per view — the number the dashboard leads with. */
  hero?: boolean;
  /** The hue this figure belongs to. "alert" overrides it when something is wrong. */
  tone?: Tone | "alert";
  icon?: ComponentType<IconProps>;
}) {
  const alert = tone === "alert";
  return (
    <div
      style={alert ? undefined : toneVars(tone)}
      className={`tone-tile border p-4 sm:p-5 ${
        alert ? "border-accent/50 bg-accent/8" : "border-line bg-paper"
      }`}
    >
      {/* A hairline of the hue along the top — the cheapest way to make a row
          of tiles read as four different things at a glance. */}
      <span
        aria-hidden
        className={`mb-3 block h-0.5 w-8 ${alert ? "bg-accent" : ""}`}
        style={alert ? undefined : { backgroundColor: "var(--tone)" }}
      />
      <p className="label flex items-center gap-2 text-muted">
        {Glyph ? <Glyph className={alert ? "text-accent" : TONE_TEXT[tone]} /> : null}
        {label}
      </p>
      <p
        className={`mt-3 font-[family-name:var(--font-sans)] font-semibold leading-none text-ink ${
          hero ? "text-5xl" : "text-2xl"
        }`}
      >
        {value}
      </p>
      {note ? <p className="mt-2 text-xs text-muted">{note}</p> : null}
    </div>
  );
}
