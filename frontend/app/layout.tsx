import type { Metadata } from "next";
import { Poppins } from "next/font/google";

import { SiteChrome } from "@/components/site-chrome";
import { fetchShopSettings } from "@/lib/api";
import { AuthProvider } from "@/lib/auth";
import { ShopSettingsProvider } from "@/lib/shop-settings";

import "./globals.css";

// Poppins ships as static cuts, so the weights the UI actually uses have to be
// listed explicitly — there is no variable axis to interpolate from.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins",
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
    <html lang="en" className={poppins.variable}>
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
