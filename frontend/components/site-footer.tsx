import Link from "next/link";

import { Logo } from "@/components/logo";

import { Newsletter } from "@/components/newsletter";
import { CATEGORIES } from "@/lib/catalog";

const HELP = [
  { href: "/shop", label: "All fragrances" },
  { href: "/about", label: "Our story" },
  { href: "/account", label: "Order history" },
  { href: "/cart", label: "Your bag" },
];

export function SiteFooter() {
  return (
    <footer className="bg-night text-paper">
      <div className="shell py-20 md:py-28">
        <Newsletter />

        <div className="mt-20 grid gap-12 border-t border-paper/15 pt-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo variant="horizontal" className="h-16" alt="Bakhoora" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-paper/60">
              Perfume decants and oils, poured to order in Dhaka and shipped across Bangladesh
              in two to four days.
            </p>
          </div>

          <div>
            <p className="label text-paper/45">Collections</p>
            <ul className="mt-5 space-y-3 text-sm">
              {CATEGORIES.map((category) => (
                <li key={category.slug}>
                  <Link
                    href={`/shop?category=${category.slug}`}
                    className="link-underline text-paper/80"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="label text-paper/45">Help</p>
            <ul className="mt-5 space-y-3 text-sm">
              {HELP.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="link-underline text-paper/80">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="label text-paper/45">Reach us</p>
            <ul className="mt-5 space-y-3 text-sm text-paper/80">
              <li>Dhanmondi 27, Dhaka 1209</li>
              <li>
                <a href="tel:+8801700000000" className="link-underline">
                  +880 1700 000000
                </a>
              </li>
              <li>
                <a href="mailto:hello@bakhoora.bd" className="link-underline">
                  hello@bakhoora.bd
                </a>
              </li>
              <li className="text-paper/50">Sat–Thu, 10:00–20:00</li>
            </ul>
          </div>
        </div>

        <div className="mt-16 flex flex-col justify-between gap-4 border-t border-paper/15 pt-8 text-paper/45 md:flex-row">
          <p className="label">© {new Date().getFullYear()} Bakhoora</p>
          <p className="label">Cash on delivery · bKash · Nagad</p>
        </div>
      </div>
    </footer>
  );
}
