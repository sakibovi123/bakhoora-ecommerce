"use client";

import { useEffect, useState } from "react";

import { IconChevronLeft, IconChevronRight } from "@/components/admin/icons";
import { useMoney, useShop } from "@/lib/shop-settings";

/**
 * The strip above the header. One message at a time, each rising up out of a
 * blur like the headlines do; it turns over on its own every few seconds and
 * holds still while the pointer is on it.
 */
export function AnnouncementBar() {
  const shop = useShop();
  const money = useMoney();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const messages = [
    shop.freeDeliveryThreshold !== null
      ? `Free delivery on orders over ${money(shop.freeDeliveryThreshold)}`
      : "Delivered nationwide in 2–4 days",
    "Cash on delivery across Bangladesh",
    "Every decant poured to order, the day it ships",
  ];

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % messages.length), 4500);
    return () => window.clearInterval(timer);
  }, [paused, messages.length]);

  const step = (direction: 1 | -1) =>
    setIndex((value) => (value + direction + messages.length) % messages.length);

  return (
    <div
      className="relative z-[60] bg-night text-paper"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      <div className="shell flex h-10 items-center justify-between gap-4">
        <button type="button" onClick={() => step(-1)} aria-label="Previous message" className="text-paper/70 hover:text-paper">
          <IconChevronLeft />
        </button>
        <p className="overflow-hidden text-center text-xs font-medium tracking-wide" aria-live="polite">
          <span key={index} className="ticker-in block">
            {messages[index]}
          </span>
        </p>
        <button type="button" onClick={() => step(1)} aria-label="Next message" className="text-paper/70 hover:text-paper">
          <IconChevronRight />
        </button>
      </div>
    </div>
  );
}
