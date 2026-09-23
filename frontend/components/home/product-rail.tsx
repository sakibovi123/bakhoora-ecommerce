"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ProductCard } from "@/components/product-card";
import type { Product } from "@/lib/types";

/**
 * A horizontal shelf: snap-scrolls by touch, drags with a mouse, pages with
 * the arrows. The thin rule underneath fills like a vial as you move along.
 */
export function ProductRail({ products }: { products: Product[] }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const measure = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const max = rail.scrollWidth - rail.clientWidth;
    setProgress(max > 0 ? rail.scrollLeft / max : 1);
    setAtStart(rail.scrollLeft < 4);
    setAtEnd(rail.scrollLeft > max - 4);
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  // Mouse drag. Touch already scrolls natively, so only a mouse opts in.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    let down = false;
    let moved = false;
    let startX = 0;
    let startLeft = 0;

    const onDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      down = true;
      moved = false;
      startX = event.clientX;
      startLeft = rail.scrollLeft;
    };
    const onMove = (event: PointerEvent) => {
      if (!down) return;
      const dx = event.clientX - startX;
      if (Math.abs(dx) > 5 && !moved) {
        moved = true;
        rail.style.scrollSnapType = "none";
        rail.setPointerCapture(event.pointerId);
      }
      if (moved) rail.scrollLeft = startLeft - dx;
    };
    const onUp = () => {
      if (!down) return;
      down = false;
      rail.style.scrollSnapType = "";
    };
    // A drag that ends over a card must not also follow its link.
    const onClick = (event: MouseEvent) => {
      if (moved) {
        event.preventDefault();
        event.stopPropagation();
        moved = false;
      }
    };

    rail.addEventListener("pointerdown", onDown);
    rail.addEventListener("pointermove", onMove);
    rail.addEventListener("pointerup", onUp);
    rail.addEventListener("pointercancel", onUp);
    rail.addEventListener("click", onClick, true);
    return () => {
      rail.removeEventListener("pointerdown", onDown);
      rail.removeEventListener("pointermove", onMove);
      rail.removeEventListener("pointerup", onUp);
      rail.removeEventListener("pointercancel", onUp);
      rail.removeEventListener("click", onClick, true);
    };
  }, []);

  function page(direction: 1 | -1) {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: direction * rail.clientWidth * 0.8, behavior: "smooth" });
  }

  return (
    <div>
      <div
        ref={railRef}
        onScroll={measure}
        className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-5 px-5 pb-2 md:-mx-10 md:scroll-px-10 md:px-10 [&_img]:pointer-events-none [&_img]:select-none"
      >
        {products.map((product, index) => (
          <div
            key={product.slug}
            className="w-[62%] shrink-0 snap-start sm:w-[38%] lg:w-[calc((100%-4rem)/5)]"
          >
            <ProductCard product={product} index={index} variant="shelf" />
          </div>
        ))}
      </div>

      <div className="mt-8 flex items-center gap-6">
        <div className="relative h-px flex-1 bg-line" aria-hidden>
          <span
            className="absolute inset-y-0 left-0 bg-ink transition-[width] duration-300"
            style={{ width: `${Math.max(progress, 0.08) * 100}%` }}
          />
          <span
            className="ember absolute top-1/2 block size-1.5 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-300"
            style={{ left: `${Math.max(progress, 0.08) * 100}%` }}
          />
        </div>
        <div className="flex">
          <button
            type="button"
            onClick={() => page(-1)}
            disabled={atStart}
            aria-label="Previous"
            className="grid size-10 place-items-center rounded-l-md bg-paper-2 text-ink transition-colors hover:bg-paper-3 disabled:text-muted/50"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => page(1)}
            disabled={atEnd}
            aria-label="Next"
            className="grid size-10 place-items-center rounded-r-md bg-ink text-paper transition-colors hover:bg-ink-2 disabled:bg-paper-3 disabled:text-muted/50"
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
}
