import type { Metadata } from "next";
import { Playfair_Display, Urbanist } from "next/font/google";

import { SiteChrome } from "@/components/site-chrome";
import { fetchShopSettings } from "@/lib/api";
import { AuthProvider } from "@/lib/auth";
import { ShopSettingsProvider } from "@/lib/shop-settings";

import "./globals.css";

// Urbanist is variable, so every weight the UI reaches for comes from one file.
const urbanist = Urbanist({
  subsets: ["latin"],
  variable: "--font-urbanist",
  display: "swap",
});

// The serif only sets the giant marquee words and the footer wordmark — the
// same high-contrast family as the logo's BAKHOORA, so the two rhyme.
const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["700", "900"],
  variable: "--font-playfair",
  display: "swap",
});

const FALLBACK_DESCRIPTION =
  "Perfume decants poured from imported bottles, and perfume oil by the millilitre. " +
  "6 to 30ml, filled to order in Dhaka.";

// Async, because the title and the favicon are now the operator's to set. An
// uploaded favicon wins; with none, Next keeps serving app/icon.png by
// convention, so `icons` is only set when there is something to override it.
export async function generateMetadata(): Promise<Metadata> {
  const shop = await fetchShopSettings();
  const description = shop.tagline ?? FALLBACK_DESCRIPTION;

  return {
    metadataBase: new URL("https://bakhoora.bd"),
    title: { default: shop.siteTitle, template: `%s — ${shop.siteTitle}` },
    description,
    openGraph: { title: shop.siteTitle, description, type: "website" },
    ...(shop.faviconUrl ? { icons: { icon: shop.faviconUrl } } : {}),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const settings = await fetchShopSettings();

  return (
    <html lang="en" className={`${urbanist.variable} ${playfair.variable}`}>
      <body className="min-h-dvh bg-paper text-ink">
        <ShopSettingsProvider settings={settings}>
          <AuthProvider>
            <SiteChrome>{children}</SiteChrome>
          </AuthProvider>
        </ShopSettingsProvider>
      </body>
    </html>
  );
}
