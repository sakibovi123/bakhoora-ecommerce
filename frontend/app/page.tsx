import { BrandLanes } from "@/components/home/brand-lanes";
import { FaqPanel } from "@/components/home/faq-panel";
import { FeatureTiles } from "@/components/home/feature-tiles";
import { Hero } from "@/components/home/hero";
import { MetricsGrid, type Metric } from "@/components/home/metrics-grid";
import { MoodTiles, type Mood } from "@/components/home/mood-tiles";
import { ProductRail } from "@/components/home/product-rail";
import { SectionHeading } from "@/components/home/section-heading";
import { SmokeText } from "@/components/home/smoke-text";
import { StepsRail } from "@/components/home/steps-rail";
import { VelocityMarquee } from "@/components/home/velocity-marquee";
import { fetchProducts, fetchShopSettings } from "@/lib/api";
import { formatPrice } from "@/lib/format";

export const dynamic = "force-dynamic";

const VERBS = ["Pour", "Wear", "Layer", "Linger", "Compare", "Discover", "Burn", "Decide"];

const MOODS: Mood[] = [
  {
    name: "Oud",
    line: "Dark wood, smoke and leather. The heart of the house.",
    query: "oud",
    ground: ["#2a1d17", "#0b0b0c"],
    ink: "paper",
  },
  {
    name: "Amber",
    line: "Warm resins and a slow, sweet dry-down that stays on a scarf for days.",
    query: "amber",
    ground: ["#c9793d", "#5a2610"],
    ink: "paper",
  },
  {
    name: "Resin",
    line: "Frankincense and myrrh — the smell of a room after the bakhoor burns out.",
    query: "resin",
    ground: ["#e9e4dc", "#b9ada0"],
    ink: "ink",
  },
  {
    name: "Fresh",
    line: "Citrus, sea air and clean musk, for Dhaka at forty degrees.",
    query: "fresh",
    ground: ["#f4f6f5", "#cfd8d6"],
    ink: "ink",
  },
];

const STEPS = [
  {
    step: "01",
    title: "We buy the bottle",
    text: "Full retail bottles, imported, and oil bought by the bottle from the market — never decanted stock bought on from someone else.",
  },
  {
    step: "02",
    title: "You pick a size",
    text: "6, 10, 15 or 30ml. The price per millilitre is on the product page, so you can see exactly what the split costs.",
  },
  {
    step: "03",
    title: "We pour it",
    text: "Hand-filled into fresh glass with a fresh pipette, labelled with the fragrance and the size, sealed, and boxed.",
  },
  {
    step: "04",
    title: "It ships",
    text: "Dhaka in 1–2 days, the rest of Bangladesh in 2–4, cash on delivery.",
  },
];

const QUESTIONS = [
  {
    q: "What is a decant?",
    a: "A smaller glass of a fragrance poured straight from the full bottle. The same liquid the house made — you are just not buying all 100ml of it at once.",
  },
  {
    q: "Is it authentic?",
    a: "It is whatever we poured it out of, and we pour out of bottles we bought ourselves. We are an independent decanter — not an authorised dealer for any house, and we do not claim to be.",
  },
  {
    q: "Why is a decant cheaper?",
    a: "You are paying for the fragrance and the small glass, not for the house's box, cap and full-size bottle. The trade is that it arrives in a plain vial.",
  },
  {
    q: "What about the oils?",
    a: "Bought by the bottle from the market and poured the same way. Alcohol-free, so they sit closer to the skin and last longer than a spray does.",
  },
  {
    q: "How long does delivery take?",
    a: "Dhaka in one to two days, everywhere else in Bangladesh in two to four. You can pay the rider in cash when it arrives.",
  },
];

export default async function HomePage() {
  // Featured is a flag on the product. If the operator has flagged too few to
  // fill a shelf, the newest in-stock bottles stand in rather than the
  // section disappearing.
  const [featured, catalogue, shop] = await Promise.all([
    fetchProducts("?featured=true&in_stock=true&size=12"),
    fetchProducts("?size=100&sort=newest"),
    fetchShopSettings(),
  ]);

  const shelf =
    featured.items.length >= 4
      ? featured.items
      : catalogue.items.filter((product) => product.inStock).slice(0, 12);

  // Brands are typed by hand in the admin, so "Rayhaan" and "RAyhaan" are
  // one house; the first spelling seen wins.
  const brandsByKey = new Map<string, string>();
  for (const product of catalogue.items) {
    const brand = product.brand?.trim();
    if (brand && !brandsByKey.has(brand.toLowerCase())) brandsByKey.set(brand.toLowerCase(), brand);
  }
  const brands = [...brandsByKey.values()].sort((a, b) => a.localeCompare(b));

  // Only facts the shop can stand behind: counts come from the live catalogue,
  // the rest from how the business actually runs.
  const metrics: Metric[] = [
    ...(catalogue.total > 0
      ? [{ kicker: "On the shelf", title: "", count: catalogue.total, note: "Fragrances you can order today" }]
      : []),
    { kicker: "Sizes poured", title: "6 · 10 · 15 · 30ml", note: "Price per ml on every page" },
    ...(brands.length > 1
      ? [{ kicker: "Houses we pour", title: "", count: brands.length, note: "Designer, niche and Arabian" }]
      : []),
    { kicker: "Delivery", title: "Within 2–4 days", note: "Nationwide · Dhaka in 1–2" },
    { kicker: "COD", title: "Cash on delivery", note: "Pay the rider when it arrives" },
    ...(shop.freeDeliveryThreshold !== null
      ? [
          {
            kicker: "Free delivery",
            title: `Over ${formatPrice(shop.freeDeliveryThreshold, shop.currencySymbol)}`,
            note: "Flat rate below it",
          },
        ]
      : []),
    { kicker: "Poured to order", title: "Filled the day it ships", note: "Never sitting in a vial for months" },
    { kicker: "Clean pour", title: "Fresh pipette, every time", note: "Nothing carries over between fragrances" },
    { kicker: "Oils", title: "Alcohol-free", note: "Close to the skin, long on it" },
    { kicker: "Honest label", title: "Independent decanter", note: "Not an authorised dealer — and we say so" },
    { kicker: "Payments", title: "bKash · Nagad · COD", note: "Whatever suits you" },
    { kicker: "Support", title: "Sat–Thu, 10–8", note: "Phone and email, a real person" },
  ];

  return (
    <>
      <Hero />

      <VelocityMarquee words={VERBS} />

      {shelf.length > 0 ? (
        <section className="shell pb-20 pt-6 md:pb-28">
          <SectionHeading title="Most loved" kicker="Bestsellers" />
          <div className="mt-10">
            <ProductRail products={shelf} />
          </div>
        </section>
      ) : null}

      <section className="shell pb-20 md:pb-28">
        <SectionHeading title="Decants | Oils" kicker="Two ways to wear it" align="right" />
        <div className="mt-8">
          <FeatureTiles
            tiles={[
              {
                href: "/shop?category=decants",
                title: "Decants",
                cta: "Shop decants",
                shape: "flacon",
                ground: "linear-gradient(160deg,#f3f2ef,#dcd9d3)",
                tones: [
                  ["#3b3b3f", "#0b0b0c"],
                  ["#d99b6c", "#8a3a16"],
                  ["#e8e2d6", "#9d8f7b"],
                ],
              },
              {
                href: "/shop?category=oils",
                title: "Perfume Oil",
                cta: "Shop oils",
                shape: "vial",
                ground: "linear-gradient(160deg,#1d1a18,#0b0b0c)",
                tones: [
                  ["#c9a227", "#6b4e12"],
                  ["#b5651d", "#5c2f0d"],
                  ["#e2b37c", "#8f5518"],
                ],
              },
            ]}
          />
        </div>
      </section>

      <section className="shell pb-20 md:pb-28">
        <SectionHeading title="Moods" kicker="Choose yours" align="right" />
        <div className="mt-8">
          <MoodTiles moods={MOODS} />
        </div>
      </section>

      {brands.length > 1 ? (
        <section className="pb-20 md:pb-28">
          <div className="shell">
            <h2 className="text-2xl font-semibold tracking-[-0.02em]">Houses we pour</h2>
          </div>
          <div className="mt-6">
            <BrandLanes brands={brands} />
          </div>
        </section>
      ) : null}

      <section className="shell pb-20 md:pb-28">
        <p className="label text-muted">Why Bakhoora</p>
        <SmokeText
          text="Poured honestly, sent quickly"
          className="mt-4 text-[clamp(2rem,4.5vw,3.25rem)] font-medium leading-[1.05] tracking-[-0.03em]"
        />
        <p className="mt-4 text-muted">A quick look at how the shop runs, and what is on the shelf right now.</p>
        <div className="mt-10">
          <MetricsGrid metrics={metrics} />
        </div>
      </section>

      <FaqPanel items={QUESTIONS} />

      <StepsRail steps={STEPS} />
    </>
  );
}
