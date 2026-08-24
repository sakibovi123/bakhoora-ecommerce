"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { IconCart, IconUser } from "@/components/admin/icons";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart-context";

const NAV = [
  { href: "/shop", label: "Shop" },
  { href: "/shop?category=attar", label: "Attar" },
  { href: "/shop?category=oud", label: "Oud" },
  { href: "/about", label: "Story" },
];

export function SiteHeader() {
  const { itemCount, open, isReady } = useCart();
  const { ready, user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <header
      className={`sticky top-0 z-50 transition-colors duration-500 ${
        scrolled ? "bg-paper/85 backdrop-blur-md" : "bg-transparent"
      }`}
    >
      <div className="shell flex h-20 items-center justify-between border-b border-line/70">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="font-display text-2xl tracking-tight">Bakhoora</span>
          <span className="label hidden text-muted sm:inline">Dhaka</span>
        </Link>

        <nav className="hidden items-center gap-9 md:flex" aria-label="Primary">
          {NAV.map((item) => (
            <Link key={item.label} href={item.href} className="label link-underline text-ink">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-5">
          <Link
            href={ready && user ? "/account" : "/account/login"}
            className="label hidden items-center gap-2 text-ink sm:inline-flex"
          >
            <IconUser />
            {/* Nothing user-specific until the session is restored, or the
                server and client markup disagree on the first paint. */}
            <span className="link-underline">
              {ready && user ? user.full_name.split(" ")[0] : "Account"}
            </span>
          </Link>
          <button onClick={open} className="label flex items-center gap-2 text-ink">
            <IconCart />
            <span className="link-underline">Cart</span>
            <span className="grid size-6 place-items-center rounded-full bg-ink text-[10px] text-paper tabular-nums">
              {isReady ? itemCount : 0}
            </span>
          </button>
          <button
            className="label md:hidden"
            onClick={() => setMenuOpen((value) => !value)}
            aria-expanded={menuOpen}
            aria-label="Toggle menu"
          >
            {menuOpen ? "Close" : "Menu"}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div className="border-b border-line bg-paper md:hidden">
          <nav className="shell flex flex-col py-4" aria-label="Mobile">
            {[
              ...NAV,
              ready && user
                ? { href: "/account", label: user.full_name.split(" ")[0] }
                : { href: "/account/login", label: "Account" },
            ].map((item) => (
              <Link key={item.label} href={item.href} className="label border-b border-line/60 py-4">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
