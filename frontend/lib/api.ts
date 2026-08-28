/**
 * Typed client for the FastAPI backend.
 *
 * The storefront used to render from a bundled `lib/catalog.ts`, which meant the
 * shop could show perfumes nobody actually had. It reads the API now: what the
 * admin has entered is what customers see, and an empty shop renders an empty
 * shop. Set NEXT_PUBLIC_API_URL to point this somewhere.
 */

import type { Category, Paged, Product, ProductImage, ShopSettings, Variant } from "@/lib/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export const apiConfigured = BASE_URL.length > 0;

/**
 * Uploaded images come back as server-relative paths ("/media/x.jpg") while
 * operator-pasted ones are already absolute. Resolving here means every URL a
 * component touches is ready to put in a `src`.
 */
export function mediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^(https?:)?\/\//.test(url) || url.startsWith("data:")) return url;
  const origin = BASE_URL.replace(/\/api\/v1\/?$/, "");
  return `${origin}${url.startsWith("/") ? "" : "/"}${url}`;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  if (!apiConfigured) {
    throw new ApiError("NEXT_PUBLIC_API_URL is not set", 0, "not_configured");
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = payload?.error;
    throw new ApiError(
      error?.message ?? `Request failed with ${response.status}`,
      response.status,
      error?.code,
    );
  }

  return payload as T;
}

// --- wire shapes ------------------------------------------------------------
// Pydantic serialises Decimal to a JSON *string*, so every price arrives as
// "1450.00" and would silently concatenate if used as a number. The normalisers
// below are the only place that conversion happens.

interface RawVariant {
  id: string;
  name: string;
  sku: string;
  size_ml: number;
  price: string | number;
  compare_at_price: string | number | null;
  stock_quantity: number;
  is_active: boolean;
  in_stock: boolean;
}

interface RawImage {
  id: string;
  url: string;
  alt_text: string | null;
  position: number;
  is_primary: boolean;
}

interface RawCategory {
  slug: string;
  name: string;
  description?: string | null;
}

interface RawProduct {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  short_description: string | null;
  description: string | null;
  category: RawCategory | null;
  variants: RawVariant[];
  images: RawImage[];
  primary_image: string | null;
  price_from: string | number | null;
  price_to: string | number | null;
  in_stock: boolean;
  is_featured: boolean;
}

function num(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeVariant(raw: RawVariant): Variant {
  return {
    id: raw.id,
    name: raw.name,
    sku: raw.sku,
    sizeMl: raw.size_ml,
    price: num(raw.price) ?? 0,
    compareAtPrice: num(raw.compare_at_price),
    stock: raw.stock_quantity,
    isActive: raw.is_active,
    inStock: raw.in_stock,
  };
}

function normalizeImage(raw: RawImage): ProductImage {
  return {
    id: raw.id,
    url: mediaUrl(raw.url) ?? raw.url,
    alt: raw.alt_text,
    position: raw.position,
    isPrimary: raw.is_primary,
  };
}

export function normalizeCategory(raw: RawCategory): Category {
  return { slug: raw.slug, name: raw.name, blurb: raw.description ?? "" };
}

export function normalizeProduct(raw: RawProduct): Product {
  return {
    id: raw.id,
    slug: raw.slug,
    name: raw.name,
    brand: raw.brand,
    tagline: raw.short_description ?? "",
    description: raw.description ?? "",
    category: raw.category ? normalizeCategory(raw.category) : null,
    variants: raw.variants.map(normalizeVariant),
    images: raw.images.map(normalizeImage),
    primaryImage: mediaUrl(raw.primary_image),
    priceFrom: num(raw.price_from),
    priceTo: num(raw.price_to),
    inStock: raw.in_stock,
    featured: raw.is_featured,
  };
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface ApiUser {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: "customer" | "admin";
}

export interface ApiPage<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export const api = {
  register: (body: { email: string; password: string; full_name: string; phone?: string }) =>
    request<ApiUser>("/auth/register", { method: "POST", body: JSON.stringify(body) }),

  login: (body: { email: string; password: string }) =>
    request<TokenPair>("/auth/login", { method: "POST", body: JSON.stringify(body) }),

  me: (token: string) => request<ApiUser>("/auth/me", {}, token),

  products: (query = "") => request<ApiPage<RawProduct>>(`/products${query}`),

  product: (slug: string) => request<RawProduct>(`/products/${encodeURIComponent(slug)}`),

  categories: () => request<RawCategory[]>("/categories"),

  addToCart: (token: string, body: { variant_id: string; quantity: number }) =>
    request<unknown>("/cart/items", { method: "POST", body: JSON.stringify(body) }, token),

  checkout: (token: string, body: unknown) =>
    request<unknown>("/orders/checkout", { method: "POST", body: JSON.stringify(body) }, token),

  orders: (token: string) => request<ApiPage<unknown>>("/orders", {}, token),
};

// --- storefront reads -------------------------------------------------------
// These swallow failures on purpose. A shop with an unreachable API should look
// like a shop with nothing in it, not a stack trace — the pages render their
// own empty state and the customer sees a sentence, not a 500.

/**
 * One error that must never be swallowed.
 *
 * Next signals "this route touched request-time data, so it cannot be
 * prerendered" by throwing through the call stack. Catching it hides that
 * signal, and the page can then be statically baked with whatever the fallback
 * returned — a shop frozen at the default title and currency. Re-thrown so Next
 * sees it and marks the route dynamic, which is what it actually needs to do.
 */
function rethrowIfFrameworkSignal(error: unknown): void {
  const digest = (error as { digest?: unknown })?.digest;
  if (typeof digest === "string" && digest.startsWith("DYNAMIC_SERVER_USAGE")) {
    throw error;
  }
}

const EMPTY: Paged<Product> = { items: [], total: 0, page: 1, size: 0, pages: 0 };

export async function fetchProducts(query = ""): Promise<Paged<Product>> {
  if (!apiConfigured) return EMPTY;
  try {
    const page = await api.products(query);
    return {
      items: page.items.map(normalizeProduct),
      total: page.total,
      page: page.page,
      size: page.size,
      pages: page.pages,
    };
  } catch (error) {
    rethrowIfFrameworkSignal(error);
    console.error("[shop] could not load products:", error);
    return EMPTY;
  }
}

/** Null when the slug is unknown *or* the API is down — both render a 404. */
export async function fetchProduct(slug: string): Promise<Product | null> {
  if (!apiConfigured) return null;
  try {
    return normalizeProduct(await api.product(slug));
  } catch (error) {
    rethrowIfFrameworkSignal(error);
    if (error instanceof ApiError && error.status === 404) return null;
    console.error(`[shop] could not load product ${slug}:`, error);
    return null;
  }
}

export async function fetchCategories(): Promise<Category[]> {
  if (!apiConfigured) return [];
  try {
    return (await api.categories()).map(normalizeCategory);
  } catch (error) {
    rethrowIfFrameworkSignal(error);
    console.error("[shop] could not load categories:", error);
    return [];
  }
}


// --- shop settings ----------------------------------------------------------

interface RawSettings {
  site_title: string;
  tagline: string | null;
  currency_code: string;
  currency_symbol: string;
  delivery_charge: string | number;
  free_delivery_threshold: string | number | null;
  advance_mode: "none" | "flat" | "delivery";
  advance_amount: string | number;
  logo_url: string | null;
  favicon_url: string | null;
}

/**
 * What the shop looks like with no backend answering. These match the column
 * defaults, so a cold API degrades to the shipped configuration rather than to
 * free delivery on everything.
 */
export const DEFAULT_SETTINGS: ShopSettings = {
  siteTitle: "Bakhoora",
  tagline: null,
  currencyCode: "BDT",
  currencySymbol: "৳",
  deliveryCharge: 70,
  freeDeliveryThreshold: 3000,
  advanceMode: "none",
  advanceAmount: 0,
  logoUrl: null,
  faviconUrl: null,
};

export async function fetchShopSettings(): Promise<ShopSettings> {
  if (!apiConfigured) return DEFAULT_SETTINGS;
  try {
    const raw = await request<RawSettings>("/settings", { cache: "no-store" });
    return {
      siteTitle: raw.site_title,
      tagline: raw.tagline,
      currencyCode: raw.currency_code,
      currencySymbol: raw.currency_symbol,
      deliveryCharge: num(raw.delivery_charge) ?? DEFAULT_SETTINGS.deliveryCharge,
      freeDeliveryThreshold: num(raw.free_delivery_threshold),
      advanceMode: raw.advance_mode,
      advanceAmount: num(raw.advance_amount) ?? 0,
      logoUrl: mediaUrl(raw.logo_url),
      faviconUrl: mediaUrl(raw.favicon_url),
    };
  } catch (error) {
    rethrowIfFrameworkSignal(error);
    console.error("[shop] could not load settings:", error);
    return DEFAULT_SETTINGS;
  }
}

/** Delivery on a basket of this size. Mirrors `ShopSettings.delivery_for`. */
export function deliveryFor(subtotal: number, shop: ShopSettings): number {
  if (subtotal <= 0) return 0;
  const threshold = shop.freeDeliveryThreshold;
  if (threshold !== null && subtotal >= threshold) return 0;
  return shop.deliveryCharge;
}
