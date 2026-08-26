import type { CSSProperties } from "react";

import type { MenuKey } from "@/lib/admin/types";

/**
 * The four panel hues.
 *
 * Assigned by what a thing *is*, not decoratively: money is green, order flow
 * is blue, the catalogue is amber, people are plum. Four rather than six on
 * purpose — six hues could not be told apart on this surface under simulated
 * colour-blindness (rose and green came out at ΔE 1.1, effectively identical).
 * These four were validated as a categorical set against --color-paper.
 */
export type Tone = "amber" | "green" | "blue" | "plum" | "neutral";

/** CSS variables the `.tone-card` / `.tone-row` rules read. */
export function toneVars(tone: Tone): CSSProperties {
  if (tone === "neutral") {
    return {
      "--tone": "var(--color-line)",
      "--tone-soft": "var(--color-paper-2)",
    } as CSSProperties;
  }
  return {
    "--tone": `var(--color-${tone})`,
    "--tone-soft": `var(--color-${tone}-soft)`,
  } as CSSProperties;
}

/** Text/icon colour for a tone. Tailwind needs whole class names, not built ones. */
export const TONE_TEXT: Record<Tone, string> = {
  amber: "text-[var(--color-amber)]",
  green: "text-[var(--color-green)]",
  blue: "text-[var(--color-blue)]",
  plum: "text-[var(--color-plum)]",
  neutral: "text-muted",
};

export const TONE_BG_SOFT: Record<Tone, string> = {
  amber: "bg-[var(--color-amber-soft)]",
  green: "bg-[var(--color-green-soft)]",
  blue: "bg-[var(--color-blue-soft)]",
  plum: "bg-[var(--color-plum-soft)]",
  neutral: "bg-paper-2",
};

export const TONE_BORDER: Record<Tone, string> = {
  amber: "border-[var(--color-amber)]",
  green: "border-[var(--color-green)]",
  blue: "border-[var(--color-blue)]",
  plum: "border-[var(--color-plum)]",
  neutral: "border-line",
};

/** Which hue each area of the panel belongs to. */
export const MENU_TONE: Record<MenuKey, Tone> = {
  dashboard: "green",
  reports: "green",
  orders: "blue",
  products: "amber",
  categories: "amber",
  customers: "plum",
  roles: "plum",
};
