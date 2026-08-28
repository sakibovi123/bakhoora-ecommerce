"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { CATEGORIES, SORTS } from "@/lib/catalog";

export function ShopFilters({ resultCount }: { resultCount: number }) {
  const router = useRouter();
  const params = useSearchParams();

  const category = params.get("category") ?? "all";
  const sort = params.get("sort") ?? "newest";
  const inStockOnly = params.get("stock") === "1";

  const push = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value === null || value === "" || value === "all") {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      const query = next.toString();
      router.push(query ? `/shop?${query}` : "/shop", { scroll: false });
    },
    [params, router],
  );

  return (
    <div className="border-y border-line">
      <div className="flex flex-col gap-6 py-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
          <FilterPill active={category === "all"} onClick={() => push("category", null)}>
            All
          </FilterPill>
          {CATEGORIES.map((item) => (
            <FilterPill
              key={item.slug}
              active={category === item.slug}
              onClick={() => push("category", item.slug)}
            >
              {item.name}
            </FilterPill>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <label className="label flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(event) => push("stock", event.target.checked ? "1" : null)}
              className="size-4 accent-[#16140f]"
            />
            In stock only
          </label>

          <label className="label flex items-center gap-3">
            <span className="text-muted">Sort</span>
            <select
              value={sort}
              onChange={(event) => push("sort", event.target.value)}
              className="label cursor-pointer border border-line bg-transparent px-3 py-2"
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <p className="label text-muted tabular-nums">
            {resultCount} {resultCount === 1 ? "fragrance" : "fragrances"}
          </p>
        </div>
      </div>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`label whitespace-nowrap border px-5 py-3 transition-colors duration-300 ${
        active ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"
      }`}
    >
      {children}
    </button>
  );
}
