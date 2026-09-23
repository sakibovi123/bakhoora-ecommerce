"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { IconCart, IconMenu, IconSearch, IconUser } from "@/components/admin/icons";
import { Logo } from "@/components/logo";
import { SmokeMenu } from "@/components/smoke-menu";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart-context";
import { useShop } from "@/lib/shop-settings";

/**
 * Menu on the left, the name in the middle, the tools on the right.
 *
 * Over a dark hero (the homepage, the shop) the bar floats as clear glass
 * with white ink; once the hero has scrolled away, and on every other page,
 * it frosts over white. A hairline along its bottom edge fills with ember as
 * you read down the page.
 */
export function SiteHeader() {
  const { itemCount, open, isReady } = useCart();
  const shop = useShop();
  const { ready, user } = useAuth();
  const pathname = usePathname();
  // Pages that open on a dark hero (marked data-hero) get the clear bar.
  // The first paint guesses from the route; the scroll handler then measures.
  const [overHero, setOverHero] = useState(pathname === "/" || pathname === "/shop");
  const [menuOpen, setMenuOpen] = useState(false);
  const progressRef = useRef<HTMLSpanElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const hero = document.querySelector("[data-hero]");
      setOverHero(hero ? hero.getBoundingClientRect().bottom > 90 : false);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (progressRef.current) {
        progressRef.current.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [pathname]);

  useEffect(() => setMenuOpen(false), [pathname]);

  const ink = overHero ? "text-paper" : "text-ink";
  const iconButton = `grid size-10 place-items-center rounded-full transition-colors duration-300 ${
    overHero ? "hover:bg-paper/10" : "hover:bg-ink/5"
  }`;

  return (
    <>
      <header
        className={`sticky top-0 z-50 h-[var(--header-h)] transition-[background-color,border-color,backdrop-filter] duration-500 ${
          overHero
            ? "border-b border-paper/10 bg-paper/[0.04] backdrop-blur-md"
            : "border-b border-line/80 bg-paper/80 backdrop-blur-xl backdrop-saturate-150"
        }`}
      >
        <div className={`shell grid h-full grid-cols-[1fr_auto_1fr] items-center ${ink}`}>
          <div className="flex items-center gap-1">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-expanded={menuOpen}
              aria-label="Open menu"
              className={`${iconButton} -ml-2`}
            >
              <IconMenu />
            </button>
            <nav className="ml-4 hidden items-center gap-7 lg:flex" aria-label="Primary">
              {[
                { href: "/shop", label: "Shop" },
                { href: "/shop?category=decants", label: "Decants" },
                { href: "/shop?category=oils", label: "Oils" },
              ].map((item) => (
                <Link key={item.label} href={item.href} className="label link-underline text-[0.65rem]">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <Link href="/" className="flex items-center" aria-label={`${shop.siteTitle} — home`}>
            {shop.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={shop.logoUrl}
                alt=""
                className={`h-9 w-auto transition-[filter] duration-500 sm:h-10 ${overHero ? "brightness-0 invert" : ""}`}
              />
            ) : (
              <Logo
                variant="wordmark"
                className={`h-4 transition-[filter] duration-500 sm:h-5 ${overHero ? "brightness-0 invert" : ""}`}
                priority
                alt=""
              />
            )}
          </Link>

          <div className="flex items-center justify-end gap-0.5">
            <Link href="/shop" aria-label="Search the shop" className={`${iconButton} hidden sm:grid`}>
              <IconSearch />
            </Link>
            <Link
              href={ready && user ? "/account" : "/account/login"}
              aria-label={ready && user ? "Your account" : "Sign in"}
              className={iconButton}
            >
              <IconUser />
            </Link>
            <button type="button" onClick={open} aria-label="Open cart" className={`${iconButton} relative -mr-2`}>
              <IconCart />
              {isReady && itemCount > 0 ? (
                <span className="absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-accent text-[9px] font-semibold text-paper tabular-nums">
                  {itemCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        <span
          ref={progressRef}
          aria-hidden
          className="absolute inset-x-0 -bottom-px h-px origin-left scale-x-0 bg-gradient-to-r from-accent/40 via-accent to-accent-soft"
        />
      </header>

      <SmokeMenu open={menuOpen} onClose={() => setMenuOpen(false)} originRef={menuButtonRef} />
    </>
  );
}
