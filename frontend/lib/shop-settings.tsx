"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { DEFAULT_SETTINGS } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import type { ShopSettings } from "@/lib/types";

/**
 * The shop's settings, fetched once on the server and handed down.
 *
 * Client components — the cart drawer, the buy panel — need the currency symbol
 * and the delivery charge to render, and neither can await a fetch. The root
 * layout reads them server-side and seeds this context, so every price on the
 * page is drawn from the same values the API just returned.
 */
const ShopContext = createContext<ShopSettings>(DEFAULT_SETTINGS);

export function ShopSettingsProvider({
  settings,
  children,
}: {
  settings: ShopSettings;
  children: ReactNode;
}) {
  return <ShopContext.Provider value={settings}>{children}</ShopContext.Provider>;
}

export function useShop(): ShopSettings {
  return useContext(ShopContext);
}

/**
 * A price formatter bound to the shop's currency.
 *
 * `formatPrice` still takes the symbol explicitly for callers with no context
 * (the admin panel, server components); this is the ergonomic form for the
 * storefront, where forgetting to pass it would silently print the wrong sign.
 */
export function useMoney(): (amount: number) => string {
  const { currencySymbol } = useShop();
  return useMemo(() => (amount: number) => formatPrice(amount, currencySymbol), [currencySymbol]);
}
