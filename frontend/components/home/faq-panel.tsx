"use client";

import Link from "next/link";
import { useState } from "react";

import { SmokeText } from "@/components/home/smoke-text";

/**
 * Dark FAQ band: questions on the left, the heading on the right. The open
 * question's bullet catches like a coal and its row warms to a faint glow.
 */
export function FaqPanel({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="bg-night py-20 text-paper md:py-28">
      <div className="shell grid gap-14 lg:grid-cols-[1.9fr_1fr] lg:gap-10">
        <div className="order-2 border-t border-paper/10 lg:order-1">
          {items.map((item, index) => {
            const isOpen = open === index;
            return (
              <div
                key={item.q}
                className={`border-b border-paper/10 transition-colors duration-700 ${
                  isOpen ? "bg-[radial-gradient(ellipse_60%_120%_at_0%_0%,rgba(184,67,28,0.14),transparent_70%)]" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : index)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-4 px-4 py-5 text-left"
                >
                  <span
                    aria-hidden
                    className={`block size-1.5 shrink-0 rounded-full transition-colors duration-500 ${
                      isOpen ? "ember" : "bg-accent-soft/60"
                    }`}
                  />
                  <span className="flex-1 text-[0.95rem] font-semibold">{item.q}</span>
                  <span
                    aria-hidden
                    className={`text-paper/60 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  >
                    ⌄
                  </span>
                </button>
                <div
                  className={`grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="px-4 pb-6 pl-[2.1rem] leading-relaxed text-paper/70">{item.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="order-1 lg:order-2">
          <p className="label text-paper/55">FAQ</p>
          <SmokeText
            text="Straight answers"
            className="mt-4 text-[clamp(2.5rem,5vw,3.75rem)] font-medium leading-[1] tracking-[-0.03em] text-accent-soft"
          />
          <p className="mt-6 max-w-sm leading-relaxed text-paper/65">
            What people ask before their first decant — about the liquid, the price and the post.
          </p>
          <Link
            href="/about"
            className="label group mt-8 inline-flex items-center gap-3 rounded-full border border-accent-soft/60 px-6 py-3.5 text-accent-soft transition-colors duration-300 hover:bg-accent-soft hover:text-ink"
          >
            How we work
            <span
              aria-hidden
              className="transition-transform duration-500 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            >
              ↗
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}
