import type { Metadata } from "next";
import { Poppins } from "next/font/google";

import { SiteChrome } from "@/components/site-chrome";
import { AuthProvider } from "@/lib/auth";

import "./globals.css";

// Poppins ships as static cuts, so the weights the UI actually uses have to be
// listed explicitly — there is no variable axis to interpolate from.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://bakhoora.bd"),
  title: {
    default: "Bakhoora — Attar, Oud & Perfume",
    template: "%s — Bakhoora",
  },
  description:
    "Hand-blended attar, oud and eau de parfum, bottled in Bangladesh. Small batches, long wear, no shortcuts.",
  openGraph: {
    title: "Bakhoora — Attar, Oud & Perfume",
    description: "Hand-blended attar, oud and eau de parfum, bottled in Bangladesh.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className="min-h-dvh bg-paper text-ink">
        <AuthProvider>
          <SiteChrome>{children}</SiteChrome>
        </AuthProvider>
      </body>
    </html>
  );
}
