import type { Category, Product } from "@/lib/types";

export const CATEGORIES: Category[] = [
  {
    slug: "attar",
    name: "Attar",
    blurb: "Alcohol-free oils, pressed close to the skin. A single drop lasts the day.",
  },
  {
    slug: "oud",
    name: "Oud",
    blurb: "Aged agarwood from Assam and Cambodia. Smoke, resin, and a long dry-down.",
  },
  {
    slug: "eau-de-parfum",
    name: "Eau de Parfum",
    blurb: "Sprays built for Dhaka humidity — 18% concentration, no thin top notes.",
  },
  {
    slug: "body-mist",
    name: "Body Mist",
    blurb: "Light, everyday freshness. Reach for it twice a day and never think about it.",
  },
];

export const PRODUCTS: Product[] = [
  {
    id: "p-01",
    slug: "royal-oud-intense",
    name: "Royal Oud Intense",
    tagline: "Smoke, saffron, and a rose that refuses to leave",
    description:
      "Our densest blend. Assam agarwood is aged eighteen months before it meets saffron and Taif rose, then rested again in glass. It opens sharp and medicinal — that is the oud telling the truth — and settles after twenty minutes into something warm and unmistakably yours.",
    category: "oud",
    concentration: "Pure oil · 100%",
    longevity: "10–14 hours",
    origin: "Assam agarwood",
    tone: ["#6b3f1d", "#2c1a0b"],
    notes: {
      top: ["Saffron", "Bergamot"],
      heart: ["Taif rose", "Patchouli"],
      base: ["Assam oud", "Amber", "Musk"],
    },
    variants: [
      { id: "v-01a", name: "6ml", sku: "OUD-RI-006ML", price: 1450, stock: 40 },
      { id: "v-01b", name: "10ml", sku: "OUD-RI-010ML", price: 2200, stock: 30 },
      { id: "v-01c", name: "15ml", sku: "OUD-RI-015ML", price: 3050, stock: 22 },
      { id: "v-01d", name: "30ml", sku: "OUD-RI-030ML", price: 5600, stock: 12 },
    ],
    featured: true,
  },
  {
    id: "p-02",
    slug: "musk-al-haramain",
    name: "Musk Al Haramain",
    tagline: "Clean linen, powdered and quiet",
    description:
      "White musk with nothing hiding behind it. This is the bottle people ask about in lifts and prayer halls — soft, powdery, and close to the skin. Unisex by construction, not by marketing.",
    category: "attar",
    concentration: "Pure oil · 100%",
    longevity: "8–10 hours",
    origin: "Blended in Dhaka",
    tone: ["#e8ddc8", "#b9a887"],
    notes: {
      top: ["Aldehydes", "Pear"],
      heart: ["White musk", "Iris"],
      base: ["Sandalwood", "Vanilla"],
    },
    variants: [
      { id: "v-02a", name: "6ml", sku: "ATR-MH-006ML", price: 890, stock: 60 },
      { id: "v-02b", name: "10ml", sku: "ATR-MH-010ML", price: 1350, stock: 45 },
      { id: "v-02c", name: "15ml", sku: "ATR-MH-015ML", price: 1850, stock: 30 },
      { id: "v-02d", name: "30ml", sku: "ATR-MH-030ML", price: 3300, stock: 18 },
    ],
    featured: true,
  },
  {
    id: "p-03",
    slug: "amber-nights",
    name: "Amber Nights",
    tagline: "Vanilla, tonka, and the last hour of a wedding",
    description:
      "Warm amber over tonka bean and a vanilla that stays creamy instead of turning sweet. Built for evenings in December when the air finally cools down.",
    category: "eau-de-parfum",
    concentration: "EDP · 18%",
    longevity: "7–9 hours",
    origin: "Bottled in Dhaka",
    tone: ["#d99a3c", "#8a5312"],
    notes: {
      top: ["Cardamom", "Mandarin"],
      heart: ["Amber", "Labdanum"],
      base: ["Tonka bean", "Vanilla", "Benzoin"],
    },
    variants: [
      { id: "v-03a", name: "6ml", sku: "EDP-AN-006ML", price: 1100, stock: 35 },
      { id: "v-03b", name: "10ml", sku: "EDP-AN-010ML", price: 1650, stock: 28 },
      { id: "v-03c", name: "15ml", sku: "EDP-AN-015ML", price: 2300, stock: 20 },
      { id: "v-03d", name: "30ml", sku: "EDP-AN-030ML", price: 4100, stock: 14 },
      { id: "v-03e", name: "50ml", sku: "EDP-AN-050ML", price: 6200, stock: 8 },
    ],
    featured: true,
  },
  {
    id: "p-04",
    slug: "rose-taifi",
    name: "Rose Taifi",
    tagline: "Rose picked at dawn, before the heat gets to it",
    description:
      "Taif rose absolute laid over sandalwood. Green and slightly sharp at first, then it rounds out. If you think you dislike rose perfumes, this is the one worth testing.",
    category: "attar",
    concentration: "Pure oil · 100%",
    longevity: "9–11 hours",
    origin: "Taif rose absolute",
    tone: ["#c9758a", "#7a3448"],
    notes: {
      top: ["Green leaf", "Lychee"],
      heart: ["Taif rose", "Geranium"],
      base: ["Sandalwood", "Cedar"],
    },
    variants: [
      { id: "v-04a", name: "6ml", sku: "ATR-RT-006ML", price: 1250, stock: 35 },
      { id: "v-04b", name: "10ml", sku: "ATR-RT-010ML", price: 1900, stock: 26 },
      { id: "v-04c", name: "15ml", sku: "ATR-RT-015ML", price: 2600, stock: 18 },
      { id: "v-04d", name: "30ml", sku: "ATR-RT-030ML", price: 4700, stock: 10 },
    ],
    featured: true,
  },
  {
    id: "p-05",
    slug: "ocean-breeze-mist",
    name: "Ocean Breeze Mist",
    tagline: "Citrus and salt for a 9am commute",
    description:
      "A body mist that does not smell like a body mist. Bergamot and sea salt over a light musk — the one you keep in a bag and use without thinking.",
    category: "body-mist",
    concentration: "Mist · 4%",
    longevity: "3–4 hours",
    origin: "Bottled in Dhaka",
    tone: ["#7fb6c4", "#2f5f6e"],
    notes: {
      top: ["Bergamot", "Sea salt"],
      heart: ["Neroli", "Marine accord"],
      base: ["White musk"],
    },
    variants: [
      { id: "v-05a", name: "6ml", sku: "MST-OB-006ML", price: 120, stock: 90 },
      { id: "v-05b", name: "10ml", sku: "MST-OB-010ML", price: 180, stock: 75 },
      { id: "v-05c", name: "15ml", sku: "MST-OB-015ML", price: 250, stock: 60 },
      { id: "v-05d", name: "30ml", sku: "MST-OB-030ML", price: 420, stock: 40 },
      { id: "v-05e", name: "250ml", sku: "MST-OB-250ML", price: 750, stock: 80 },
    ],
    featured: false,
  },
  {
    id: "p-06",
    slug: "cambodi-oud",
    name: "Cambodi Oud",
    tagline: "Sweeter, darker, fruit at the edge of smoke",
    description:
      "Cambodian agarwood runs sweeter than Assam — dried fruit and leather where the Indian oud gives you barn and medicine. Aged three years. We bottle it undiluted.",
    category: "oud",
    concentration: "Pure oil · 100%",
    longevity: "12–16 hours",
    origin: "Cambodian agarwood",
    tone: ["#8a5a2b", "#3a2412"],
    notes: {
      top: ["Dried plum"],
      heart: ["Cambodian oud", "Leather"],
      base: ["Vetiver", "Tobacco", "Amber"],
    },
    variants: [
      { id: "v-06a", name: "6ml", sku: "OUD-CB-006ML", price: 2900, stock: 14 },
      { id: "v-06b", name: "10ml", sku: "OUD-CB-010ML", price: 4400, stock: 10 },
      { id: "v-06c", name: "15ml", sku: "OUD-CB-015ML", price: 6100, stock: 6 },
      { id: "v-06d", name: "30ml", sku: "OUD-CB-030ML", price: 11200, stock: 3 },
    ],
    featured: true,
  },
  {
    id: "p-07",
    slug: "jannat-al-firdaus",
    name: "Jannat Al Firdaus",
    tagline: "Honeyed florals with a cool green spine",
    description:
      "A classic of the attar shelf, rebuilt. Honey and jasmine kept in check by vetiver so it never turns cloying in the heat.",
    category: "attar",
    concentration: "Pure oil · 100%",
    longevity: "8–10 hours",
    origin: "Blended in Dhaka",
    tone: ["#a8b878", "#4c5a2e"],
    notes: {
      top: ["Honey", "Bergamot"],
      heart: ["Jasmine", "Ylang ylang"],
      base: ["Vetiver", "Musk"],
    },
    variants: [
      { id: "v-07a", name: "6ml", sku: "ATR-JF-006ML", price: 980, stock: 42 },
      { id: "v-07b", name: "10ml", sku: "ATR-JF-010ML", price: 1480, stock: 33 },
      { id: "v-07c", name: "15ml", sku: "ATR-JF-015ML", price: 2040, stock: 21 },
      { id: "v-07d", name: "30ml", sku: "ATR-JF-030ML", price: 3650, stock: 12 },
    ],
    featured: false,
  },
  {
    id: "p-08",
    slug: "midnight-bakhoor",
    name: "Midnight Bakhoor",
    tagline: "The smell of a house an hour after the bakhoor burner",
    description:
      "Incense, dark resin, and dry wood — an interpretation of bakhoor smoke that you can wear to work. Our most-requested reformulation, now in spray.",
    category: "eau-de-parfum",
    concentration: "EDP · 20%",
    longevity: "8–10 hours",
    origin: "Bottled in Dhaka",
    tone: ["#6e5a8c", "#241a33"],
    notes: {
      top: ["Pink pepper", "Elemi"],
      heart: ["Incense", "Myrrh"],
      base: ["Guaiac wood", "Oud accord", "Styrax"],
    },
    variants: [
      { id: "v-08a", name: "6ml", sku: "EDP-MB-006ML", price: 980, stock: 30 },
      { id: "v-08b", name: "10ml", sku: "EDP-MB-010ML", price: 1450, stock: 24 },
      { id: "v-08c", name: "15ml", sku: "EDP-MB-015ML", price: 1980, stock: 18 },
      { id: "v-08d", name: "30ml", sku: "EDP-MB-030ML", price: 3100, stock: 16 },
      { id: "v-08e", name: "50ml", sku: "EDP-MB-050ML", price: 4200, stock: 9 },
      { id: "v-08f", name: "100ml", sku: "EDP-MB-100ML", price: 7400, stock: 4 },
    ],
    featured: true,
  },
  {
    id: "p-09",
    slug: "sandal-sultan",
    name: "Sandal Sultan",
    tagline: "Creamy sandalwood, nothing else shouting",
    description:
      "Mysore-profile sandalwood with a whisper of saffron. The quietest bottle we make and the one that sells out first every winter.",
    category: "attar",
    concentration: "Pure oil · 100%",
    longevity: "9–12 hours",
    origin: "Sandalwood blend",
    tone: ["#d8bb8e", "#8f6a3b"],
    notes: {
      top: ["Saffron"],
      heart: ["Sandalwood", "Cardamom"],
      base: ["Cedar", "Soft amber"],
    },
    variants: [
      { id: "v-09a", name: "6ml", sku: "ATR-SS-006ML", price: 1650, stock: 3 },
      { id: "v-09b", name: "10ml", sku: "ATR-SS-010ML", price: 2500, stock: 2 },
      { id: "v-09c", name: "15ml", sku: "ATR-SS-015ML", price: 3450, stock: 1 },
      { id: "v-09d", name: "30ml", sku: "ATR-SS-030ML", price: 6200, stock: 0 },
    ],
    featured: false,
  },
  {
    id: "p-10",
    slug: "citrus-noir",
    name: "Citrus Noir",
    tagline: "Bitter grapefruit dropped onto black tea",
    description:
      "A daytime spray with teeth. Grapefruit and petitgrain over smoked black tea, so it reads fresh without reading like soap.",
    category: "eau-de-parfum",
    concentration: "EDP · 16%",
    longevity: "6–8 hours",
    origin: "Bottled in Dhaka",
    tone: ["#c2c04a", "#4f5015"],
    notes: {
      top: ["Grapefruit", "Petitgrain"],
      heart: ["Black tea", "Neroli"],
      base: ["Vetiver", "Musk"],
    },
    variants: [
      { id: "v-10a", name: "6ml", sku: "EDP-CN-006ML", price: 760, stock: 44 },
      { id: "v-10b", name: "10ml", sku: "EDP-CN-010ML", price: 1140, stock: 36 },
      { id: "v-10c", name: "15ml", sku: "EDP-CN-015ML", price: 1560, stock: 28 },
      { id: "v-10d", name: "30ml", sku: "EDP-CN-030ML", price: 2450, stock: 22 },
      { id: "v-10e", name: "50ml", sku: "EDP-CN-050ML", price: 3300, stock: 15 },
      { id: "v-10f", name: "100ml", sku: "EDP-CN-100ML", price: 5400, stock: 8 },
    ],
    featured: false,
  },
];

export function getProduct(slug: string): Product | undefined {
  return PRODUCTS.find((product) => product.slug === slug);
}

export function getVariant(slug: string, variantId: string) {
  return getProduct(slug)?.variants.find((variant) => variant.id === variantId);
}

export function getCategory(slug: string): Category | undefined {
  return CATEGORIES.find((category) => category.slug === slug);
}

export function priceFrom(product: Product): number {
  return Math.min(...product.variants.map((variant) => variant.price));
}

export function inStock(product: Product): boolean {
  return product.variants.some((variant) => variant.stock > 0);
}

export type SortKey = "featured" | "price-asc" | "price-desc" | "name";

export interface ProductQuery {
  category?: string;
  sort?: SortKey;
  search?: string;
  maxPrice?: number;
  inStockOnly?: boolean;
}

export function queryProducts({
  category,
  sort = "featured",
  search,
  maxPrice,
  inStockOnly,
}: ProductQuery = {}): Product[] {
  let results = [...PRODUCTS];

  if (category && category !== "all") {
    results = results.filter((product) => product.category === category);
  }
  if (search) {
    const term = search.trim().toLowerCase();
    results = results.filter((product) =>
      [product.name, product.tagline, ...product.notes.top, ...product.notes.heart, ...product.notes.base]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }
  if (typeof maxPrice === "number") {
    results = results.filter((product) => priceFrom(product) <= maxPrice);
  }
  if (inStockOnly) {
    results = results.filter(inStock);
  }

  const sorters: Record<SortKey, (a: Product, b: Product) => number> = {
    featured: (a, b) => Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name),
    "price-asc": (a, b) => priceFrom(a) - priceFrom(b),
    "price-desc": (a, b) => priceFrom(b) - priceFrom(a),
    name: (a, b) => a.name.localeCompare(b.name),
  };

  return results.sort(sorters[sort]);
}

export function relatedProducts(product: Product, limit = 3): Product[] {
  const sameCategory = PRODUCTS.filter(
    (candidate) => candidate.category === product.category && candidate.slug !== product.slug,
  );
  const others = PRODUCTS.filter(
    (candidate) => candidate.category !== product.category && candidate.slug !== product.slug,
  );
  return [...sameCategory, ...others].slice(0, limit);
}

export const SHIPPING_FLAT_FEE = 70;
export const FREE_SHIPPING_THRESHOLD = 3000;

export function shippingFor(subtotal: number): number {
  if (subtotal <= 0 || subtotal >= FREE_SHIPPING_THRESHOLD) return 0;
  return SHIPPING_FLAT_FEE;
}
