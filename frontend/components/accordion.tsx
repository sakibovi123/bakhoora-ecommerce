"use client";

import { useState, type ReactNode } from "react";

interface Item {
  title: string;
  body: ReactNode;
}

export function Accordion({ items, defaultOpen = 0 }: { items: Item[]; defaultOpen?: number }) {
  const [openIndex, setOpenIndex] = useState<number | null>(defaultOpen);

  return (
    <div className="border-t border-line">
      {items.map((item, index) => {
        const open = openIndex === index;
        return (
          <div key={item.title} className="border-b border-line">
            <button
              className="flex w-full items-center justify-between gap-6 py-6 text-left"
              onClick={() => setOpenIndex(open ? null : index)}
              aria-expanded={open}
            >
              <span className="label">{item.title}</span>
              <span
                aria-hidden
                className={`text-lg transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  open ? "rotate-45" : ""
                }`}
              >
                +
              </span>
            </button>
            <div
              className={`grid transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                open ? "grid-rows-[1fr] pb-6 opacity-100" : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden text-sm leading-relaxed text-muted">{item.body}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
