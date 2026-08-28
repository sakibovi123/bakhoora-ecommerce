/**
 * Shop configuration — the parts of the storefront that are business facts
 * rather than inventory.
 *
 * Products used to live here as a hardcoded array, which meant the shop could
 * advertise bottles nobody had. They come from the API now. What is left is the
 * taxonomy and the shipping rules: two things that change when the business
 * changes, not when stock does.
 */

import type { Category } from "@/lib/types";
import { DECANTS, OILS } from "@/lib/types";

/**
 * Two categories, because there are two things being sold.
 *
 * Kept here rather than fetched so the nav, the footer and the filter rail
 * never render blank while the API is cold — but the slugs must match the
 * category rows in the database, or filtering by one returns nothing.
 */
export const CATEGORIES: Category[] = [
  {
    slug: DECANTS,
    name: "Decants",
    blurb:
      "Imported bottles, poured into smaller glass. The same fragrance the house made — a size you will actually finish.",
  },
  {
    slug: OILS,
    name: "Perfume Oil",
    blurb: "Alcohol-free oil, sourced by the bottle and poured to order. Close to the skin, long on it.",
  },
];

export function getCategory(slug: string): Category | undefined {
  return CATEGORIES.find((category) => category.slug === slug);
}

/** Slim vials for oil, squat flacons for everything poured from a spray bottle. */
export function bottleShape(categorySlug: string | null | undefined): "flacon" | "vial" {
  return categorySlug === OILS ? "vial" : "flacon";
}

/**
 * Sort keys the shop offers, and what each one means to the API. The old list
 * led with "featured", which the backend cannot sort by — it only filters on it.
 */
export const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price · low to high" },
  { value: "price_desc", label: "Price · high to low" },
  { value: "name", label: "A–Z" },
] as const;

export type SortKey = (typeof SORTS)[number]["value"];

export function isSortKey(value: string | null | undefined): value is SortKey {
  return SORTS.some((sort) => sort.value === value);
}

// Delivery used to be two constants here. It is the operator's to set now —
// see `deliveryFor` in lib/api.ts and the Settings page in the admin panel.

/**
 * A deterministic ink for the drawn bottle, since the API has no colour field.
 * Same slug always yields the same pair, so a product does not change shade
 * between the grid and its own page. Only used where there is no photograph.
 */
const TONES: [string, string][] = [
  ["#c9a227", "#6b4e12"],
  ["#b5651d", "#5c2f0d"],
  ["#8d6e63", "#3e2723"],
  ["#a1887f", "#4e342e"],
  ["#9e9d24", "#4a4a12"],
  ["#ad8b73", "#553c2c"],
];

export function toneFor(slug: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < slug.length; i += 1) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return TONES[hash % TONES.length];
}
