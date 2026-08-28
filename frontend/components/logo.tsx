import Image from "next/image";

import compact from "@/public/brand/compact.png";
import horizontal from "@/public/brand/horizontal-light.png";
import mark from "@/public/brand/mark.png";
import primary from "@/public/brand/primary.png";
import wordmark from "@/public/brand/wordmark.png";

/**
 * The Bakhoora lockup, in the cut that fits where it is going.
 *
 * The brand ships two masters and they are drawn for opposite grounds, so the
 * variant already decides the ground — there is no `tone` to get wrong:
 *
 *   from bakhoora-logo-primary-transparent.png — dark artwork, LIGHT grounds
 *     primary   the whole stack incl. OUD · AMBER · RESIN. Needs room: a
 *               sign-in card, a page header.
 *     compact   the same without the tagline, for a printed sheet.
 *     wordmark  BAKHOORA alone, ~9.5:1. The only cut that holds together in a
 *               nav bar — the smoke is hairline and dissolves below ~40px.
 *     mark      smoke and ember alone, where the name is already set.
 *
 *   from bakhoora-logo-horizontal-dark.jpg — light artwork, DARK grounds
 *     horizontal  the official horizontal lockup, mark and gold rule included.
 *               Keyed off its flat ground rather than recoloured, so these are
 *               the designer's own pixels and the gold rule survives.
 *
 * Putting `horizontal` on paper (or `wordmark` on ink) leaves an invisible
 * logo — the artwork is genuinely transparent, not a tinted block.
 */
const ART = { primary, compact, wordmark, mark, horizontal } as const;

/**
 * Roughly how wide each cut is actually drawn, so the browser picks a matching
 * candidate off the srcSet. Without a hint the fallback reaches for the 3840px
 * rendition to paint a 24px-tall header logo.
 */
const SLOT: Record<keyof typeof ART, string> = {
  primary: "400px",
  compact: "260px",
  wordmark: "220px",
  mark: "96px",
  horizontal: "260px",
};

export function Logo({
  variant = "wordmark",
  className = "",
  priority = false,
  unoptimized = false,
  sizes,
  alt = "Bakhoora",
}: {
  variant?: keyof typeof ART;
  /** Set the height here (e.g. `h-6`); the width follows the aspect ratio. */
  className?: string;
  /** Only the one above the fold — every other instance stays lazy. */
  priority?: boolean;
  /** Serve the file as-is. For the print sheet — see the invoice header. */
  unoptimized?: boolean;
  /** Override the per-variant width hint where a slot is unusually wide. */
  sizes?: string;
  /**
   * Empty where the name is already written beside it, so a screen reader is
   * not told "Bakhoora Bakhoora".
   */
  alt?: string;
}) {
  return (
    <Image
      src={ART[variant]}
      alt={alt}
      priority={priority}
      unoptimized={unoptimized}
      className={`w-auto ${className}`}
      // The intrinsic size rides along with the static import, so the box is
      // reserved before the bytes land and the header cannot jump.
      sizes={sizes ?? SLOT[variant]}
    />
  );
}
