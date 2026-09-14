"use client";

import { useCallback } from "react";

import { adminApi } from "@/lib/admin/client";
import { useResource } from "@/lib/admin/use-resource";
import type { Product } from "@/lib/admin/types";

/** Enough pages for any catalogue this shop will have, and a stop either way. */
const MAX_PAGES = 20;

/**
 * The whole catalogue, variants and all.
 *
 * The combo builder needs every perfume's prices and stock at once: it has to
 * answer "can these five be made up at 6ml?" while the operator is still
 * choosing, before anything has been saved for the API to answer it about. The
 * products list is the only endpoint that carries variants, so it is walked to
 * the end rather than searched a page at a time.
 */
export function useCatalogue() {
  const load = useCallback(async (token: string) => {
    const all: Product[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const result = await adminApi.products(token, { page, size: 100, sort: "name" });
      all.push(...result.items);
      if (page >= result.pages) break;
    }
    return all;
  }, []);

  return useResource(load, []);
}
