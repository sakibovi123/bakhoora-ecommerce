/**
 * Storefront types. These mirror the FastAPI schemas in `app/schemas/product.py`
 * rather than the richer shape the old hardcoded catalogue invented — the shop
 * now renders whatever the API actually returns, so anything the backend does
 * not store (note pyramids, longevity claims) has no business being a type.
 */

/**
 * We sell two things and the taxonomy says so: decants poured from imported
 * bottles, and oil bought by the bottle from the market and poured the same way.
 * A plain string, not a union — categories live in the database and the admin
 * can add one without a frontend deploy.
 */
export type CategorySlug = string;

export const DECANTS = "decants";
export const OILS = "oils";

export interface Category {
  slug: CategorySlug;
  name: string;
  blurb: string;
}

export interface Variant {
  id: string;
  /** Display label the API derives from the size, e.g. "6ml". */
  name: string;
  sku: string;
  sizeMl: number;
  /** Taka. The API sends Decimal as a JSON string; `normalizeProduct` coerces. */
  price: number;
  compareAtPrice: number | null;
  stock: number;
  isActive: boolean;
  inStock: boolean;
}

export interface ProductImage {
  id: string;
  url: string;
  alt: string | null;
  position: number;
  isPrimary: boolean;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  /** The house the bottle came from. Null for market oils with no house. */
  brand: string | null;
  /** `short_description` — the one line under the name on a card. */
  tagline: string;
  description: string;
  category: Category | null;
  variants: Variant[];
  images: ProductImage[];
  primaryImage: string | null;
  priceFrom: number | null;
  priceTo: number | null;
  inStock: boolean;
  featured: boolean;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

/**
 * What localStorage holds. The cart carries its own copy of everything it needs
 * to draw a line — name, size, price, image — because there is no longer a
 * bundled catalogue to look a slug up in, and refetching every product on boot
 * to render a two-line drawer is a bad trade. Prices are re-checked server-side
 * at checkout, so a stale snapshot is a display concern, never a pricing one.
 */
export interface CartLine {
  productSlug: string;
  variantId: string;
  quantity: number;
  name: string;
  brand: string | null;
  categorySlug: CategorySlug | null;
  variantName: string;
  unitPrice: number;
  image: string | null;
  /** Stock at the time it was added — the ceiling the quantity stepper honours. */
  stock: number;
}

export interface ResolvedLine extends CartLine {
  lineTotal: number;
}


export type AdvanceMode = "none" | "flat" | "delivery";

/** The shop's own settings, as the storefront needs them. Money as numbers. */
export interface ShopSettings {
  siteTitle: string;
  tagline: string | null;
  currencyCode: string;
  currencySymbol: string;
  deliveryCharge: number;
  /** Null means delivery is never free — distinct from a threshold of 0. */
  freeDeliveryThreshold: number | null;
  advanceMode: AdvanceMode;
  advanceAmount: number;
  logoUrl: string | null;
  faviconUrl: string | null;
}
