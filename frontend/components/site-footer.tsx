"use client";

import Link from "next/link";
import type { PointerEvent } from "react";

import { Newsletter } from "@/components/newsletter";
import { CATEGORIES } from "@/lib/catalog";
import { useShop } from "@/lib/shop-settings";

const HELP = [
  { href: "/about", label: "How we work" },
  { href: "/account", label: "Order history" },
  { href: "/cart", label: "Your bag" },
  { href: "/checkout", label: "Checkout" },
];

/**
 * The wordmark runs the full width, set in outline-grey — until the pointer
 * crosses it. Then a coal follows the cursor through the letters and lights
 * them from within.
 */
export function SiteFooter() {
  const shop = useShop();

  function onMove(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--mx", `${((event.clientX - rect.left) / rect.width) * 100}%`);
    event.currentTarget.style.setProperty("--my", `${((event.clientY - rect.top) / rect.height) * 100}%`);
  }

  return (
    <footer className="overflow-hidden bg-night text-paper">
      <div className="shell pt-14 md:pt-20">
        <div
          onPointerMove={onMove}
          onPointerLeave={(event) => {
            event.currentTarget.style.setProperty("--mx", "50%");
            event.currentTarget.style.setProperty("--my", "160%");
          }}
          className="border-b border-paper/10 pb-8 [--my:160%] [container-type:inline-size]"
          aria-hidden
        >
          {/* Sized off its own box (cqw), not the viewport, so the name spans
              the row edge to edge at every width without ever clipping. */}
          <p className="coal-text select-none whitespace-nowrap text-center font-serif text-[min(16.6cqw,15rem)] font-bold uppercase leading-[0.9] tracking-[0.02em]">
            {shop.siteTitle}
          </p>
        </div>

        <div className="grid gap-12 py-14 lg:grid-cols-[1fr_1.5fr] lg:gap-16 [&>*]:min-w-0">
          <Newsletter />

          <div>
            <p className="max-w-md text-paper/70">
              Perfume decants and oils, poured to order in Dhaka and shipped across Bangladesh in
              two to four days.
            </p>

            <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3">
              <div>
                <p className="label text-paper/40">Shop</p>
                <ul className="mt-5 space-y-3 text-sm">
                  <li>
                    <Link href="/shop" className="link-underline text-paper/75 hover:text-paper">
                      Everything
                    </Link>
                  </li>
                  {CATEGORIES.map((category) => (
                    <li key={category.slug}>
                      <Link
                        href={`/shop?category=${category.slug}`}
                        className="link-underline text-paper/75 hover:text-paper"
                      >
                        {category.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="label text-paper/40">Help</p>
                <ul className="mt-5 space-y-3 text-sm">
                  {HELP.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href} className="link-underline text-paper/75 hover:text-paper">
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="label text-paper/40">Reach us</p>
                <ul className="mt-5 space-y-3 text-sm text-paper/75">
                  <li>Dhanmondi 27, Dhaka 1209</li>
                  <li>
                    <a href="tel:+8801700000000" className="link-underline hover:text-paper">
                      +880 1700 000000
                    </a>
                  </li>
                  <li>
                    <a href="mailto:hello@bakhoora.bd" className="link-underline hover:text-paper">
                      hello@bakhoora.bd
                    </a>
                  </li>
                  <li className="text-paper/45">Sat–Thu, 10:00–20:00</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-3 border-t border-paper/10 py-8 text-xs text-paper/45 md:flex-row">
          <p>
            © {new Date().getFullYear()} {shop.siteTitle}
          </p>
          <p className="flex items-center gap-2.5">
            <span aria-hidden className="ember block size-1.5" />
            Cash on delivery · bKash · Nagad
          </p>
        </div>
      </div>
    </footer>
  );
}
