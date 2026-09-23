"use client";

import { useState, type PointerEvent } from "react";

import { Bottle } from "@/components/bottle";
import type { ProductImage } from "@/lib/types";

/**
 * The bottle, on a white plinth. Move over it and it turns a few degrees
 * toward you while a warm light — the ember again — slides across the glass.
 * Switching photos dissolves one into the next through a blur, the way a
 * scent changes over the dry-down, instead of cutting.
 */
export function ProductStage({
  name,
  images,
  fallback,
}: {
  name: string;
  images: ProductImage[];
  fallback: { tone: [string, string]; shape: "flacon" | "vial" };
}) {
  const [active, setActive] = useState(0);

  function onMove(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const el = event.currentTarget;
    el.style.setProperty("--rx", `${(0.5 - y) * 8}deg`);
    el.style.setProperty("--ry", `${(x - 0.5) * 10}deg`);
    el.style.setProperty("--lx", `${x * 100}%`);
    el.style.setProperty("--ly", `${y * 100}%`);
    el.style.setProperty("--lo", "1");
  }

  function onLeave(event: PointerEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--lo", "0");
  }

  return (
    <div>
      <div
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        className="group relative aspect-square overflow-hidden rounded-2xl bg-paper [perspective:1200px]"
      >
        {/* Floor shadow the bottle stands on. */}
        <div
          aria-hidden
          className="absolute bottom-[9%] left-1/2 h-[6%] w-[46%] -translate-x-1/2 rounded-[50%] bg-black/15 blur-xl"
        />

        <div
          className="stage-float absolute inset-0 transition-transform duration-500 ease-out [transform:rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))] [transform-style:preserve-3d]"
        >
          {images.length > 0 ? (
            images.map((image, index) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={image.id}
                src={image.url}
                alt={index === active ? (image.alt ?? name) : ""}
                aria-hidden={index !== active}
                className="absolute inset-0 h-full w-full object-contain p-[6%] transition-[opacity,filter,transform] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{
                  opacity: index === active ? 1 : 0,
                  filter: index === active ? "blur(0)" : "blur(16px)",
                  transform: index === active ? "scale(1)" : "scale(1.06)",
                }}
              />
            ))
          ) : (
            <Bottle tone={fallback.tone} shape={fallback.shape} className="h-full w-full p-[8%]" />
          )}
        </div>

        {/* The travelling light: a warm pool the size of a palm, tinting
            whatever it passes over. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[var(--lo,0)] mix-blend-multiply transition-opacity duration-500 [background:radial-gradient(circle_at_var(--lx,50%)_var(--ly,40%),rgba(234,140,90,0.28),rgba(234,120,60,0.1)_20%,transparent_42%)]"
        />
      </div>

      {images.length > 1 ? (
        <div className="mt-4 flex gap-3 overflow-x-auto no-scrollbar">
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setActive(index)}
              aria-label={`Show photo ${index + 1}`}
              aria-pressed={index === active}
              className={`relative size-20 shrink-0 overflow-hidden rounded-lg bg-paper-2 ring-1 transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 ${
                index === active ? "ring-2 ring-ink" : "ring-line"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt="" className="h-full w-full object-cover" />
              {index === active ? (
                <span aria-hidden className="ember absolute bottom-1.5 left-1/2 block size-1.5 -translate-x-1/2" />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
