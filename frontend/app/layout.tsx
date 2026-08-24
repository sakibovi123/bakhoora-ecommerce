import type { Metadata } from "next";
import { Instrument_Serif, Roboto } from "next/font/google";

import { SiteChrome } from "@/components/site-chrome";
import { AuthProvider } from "@/lib/auth";

import "./globals.css";

const roboto = Roboto({
  subsets: ["latin"],
  variable: "--font-roboto",
  display: "swap",
});

const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument",
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
    <html lang="en" className={`${roboto.variable} ${instrument.variable}`}>
      <body className="min-h-dvh bg-paper text-ink">
        <AuthProvider>
          <SiteChrome>{children}</SiteChrome>
        </AuthProvider>
      </body>
    </html>
  );
}
