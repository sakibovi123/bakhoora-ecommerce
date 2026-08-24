export type CategorySlug = "attar" | "oud" | "eau-de-parfum" | "body-mist";

export interface Category {
  slug: CategorySlug;
  name: string;
  blurb: string;
}

export interface Variant {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
}

export interface Notes {
  top: string[];
  heart: string[];
  base: string[];
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: CategorySlug;
  concentration: string;
  longevity: string;
  origin: string;
  tone: [string, string];
  notes: Notes;
  variants: Variant[];
  featured: boolean;
}

export interface CartLine {
  productSlug: string;
  variantId: string;
  quantity: number;
}

export interface ResolvedLine extends CartLine {
  product: Product;
  variant: Variant;
  lineTotal: number;
}
