"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { IconSearch } from "@/components/admin/icons";
import { CATEGORIES, SORTS } from "@/lib/catalog";

/**
 * The shop's control bar. It frosts over the grid and sticks under the header
 * as you scroll, so filters are never more than a glance away.
 *
 * The category pills share one dark capsule that slides between them, with an
 * ember riding its edge — the same coal that marks progress everywhere else.
 */
export function ShopFilters({ resultCount }: { resultCount: number }) {
  const router = useRouter();
  const params = useSearchParams();

  const category = params.get("category") ?? "all";
  const sort = params.get("sort") ?? "newest";
  const inStockOnly = params.get("stock") === "1";
  const [search, setSearch] = useState(params.get("q") ?? "");

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

  // A brand chip or the back button can change ?q= under us; follow it —
  // unless the box has focus, where the URL is merely catching up to typing.
  const inputRef = useRef<HTMLInputElement>(null);
  const urlSearch = params.get("q") ?? "";
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setSearch(urlSearch);
  }, [urlSearch]);

  // Search as you type, but only once the typing pauses.
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (search.trim() === current) return;
    const timer = window.setTimeout(() => push("q", search.trim() || null), 350);
    return () => window.clearTimeout(timer);
  }, [search, params, push]);

  // The sliding capsule under the active pill.
  const trackRef = useRef<HTMLDivElement>(null);
  const [capsule, setCapsule] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const track = trackRef.current;
    const active = track?.querySelector<HTMLElement>("[data-active='true']");
    if (!track || !active) return;
    const measure = () => setCapsule({ left: active.offsetLeft, width: active.offsetWidth });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [category]);

  const pills = [{ slug: "all", name: "All" }, ...CATEGORIES];

  return (
    // Sticky from sm up. On a phone the bar is two rows tall, and pinning it
    // would leave a third of the screen for the bottles.
    <div className="relative z-30 -mx-5 sm:sticky sm:top-[var(--header-h)] border-b border-line/70 bg-paper/80 px-5 backdrop-blur-xl backdrop-saturate-150 md:-mx-10 md:px-10">
      <div className="flex flex-col gap-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div
            ref={trackRef}
            className="no-scrollbar relative flex shrink-0 gap-1 overflow-x-auto rounded-full bg-paper-2 p-1 ring-1 ring-black/5"
          >
            {capsule ? (
              <span
                aria-hidden
                className="absolute inset-y-1 rounded-full bg-ink shadow-[0_6px_18px_rgba(0,0,0,0.2)] transition-[left,width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{ left: capsule.left, width: capsule.width }}
              >
                <span className="ember absolute -right-0.5 top-1/2 block size-1.5 -translate-y-1/2" />
              </span>
            ) : null}
            {pills.map((item) => {
              const active = category === item.slug;
              return (
                <button
                  key={item.slug}
                  type="button"
                  data-active={active}
                  aria-pressed={active}
                  onClick={() => push("category", item.slug)}
                  className={`label relative whitespace-nowrap rounded-full px-5 py-2.5 text-[0.65rem] transition-colors duration-300 ${
                    active ? "text-paper" : "text-ink/70 hover:text-ink"
                  } ${active && !capsule ? "bg-ink" : ""}`}
                >
                  {item.name}
                </button>
              );
            })}
          </div>

          <label className="group relative flex min-w-0 items-center md:w-64">
            <span className="sr-only">Search fragrances</span>
            <span className="pointer-events-none absolute left-4 text-muted transition-colors group-focus-within:text-accent">
              <IconSearch />
            </span>
            <input
              ref={inputRef}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search a name or house"
              className="w-full rounded-full bg-paper-2 py-2.5 pl-11 pr-4 text-sm ring-1 ring-black/5 transition-shadow placeholder:text-muted/70 focus:bg-paper focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </label>
        </div>

        <div className="flex items-center gap-x-4 sm:gap-x-5">
          <button
            type="button"
            role="switch"
            aria-checked={inStockOnly}
            onClick={() => push("stock", inStockOnly ? null : "1")}
            className="label flex items-center gap-2.5 text-[0.65rem]"
          >
            <span
              className={`relative h-5 w-9 rounded-full transition-colors duration-300 ${
                inStockOnly ? "bg-ink" : "bg-paper-3"
              }`}
            >
              <span
                className={`absolute top-0.5 block size-4 rounded-full transition-[left,background] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  inStockOnly ? "ember left-[1.125rem]" : "left-0.5 bg-paper shadow"
                }`}
              />
            </span>
            In stock<span className="hidden sm:inline">&nbsp;only</span>
          </button>

          <label className="label flex items-center gap-2 text-[0.65rem]">
            <span className="hidden text-muted sm:inline">Sort</span>
            <select
              value={sort}
              onChange={(event) => push("sort", event.target.value)}
              aria-label="Sort by"
              className="cursor-pointer rounded-full bg-paper-2 px-3 py-2.5 text-xs sm:px-4 font-medium tracking-normal normal-case ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <p className="label ml-auto text-[0.65rem] text-muted tabular-nums lg:ml-0">
            {resultCount}
            <span className="hidden sm:inline"> {resultCount === 1 ? "fragrance" : "fragrances"}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
