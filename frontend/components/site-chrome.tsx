"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { CartDrawer } from "@/components/cart-drawer";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { CartProvider } from "@/lib/cart-context";

/**
 * The storefront's header, footer and cart.
 *
 * The admin panel lives in the same Next app but shares none of this chrome —
 * and has no use for the cart context either, so it is not mounted there.
 */
export function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname.startsWith("/admin")) return <>{children}</>;

  return (
    <CartProvider>
      <a
        href="#main"
        className="label sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-100 focus:bg-ink focus:px-4 focus:py-3 focus:text-paper"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
      <CartDrawer />
    </CartProvider>
  );
}
