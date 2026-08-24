"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import {
  IconClose,
  IconExternal,
  IconAlert,
  IconChevronLeft,
  IconMenu,
  IconSignOut,
  MENU_ICONS,
} from "@/components/admin/icons";
import { MENU_TONE, TONE_TEXT } from "@/components/admin/tone";
import { apiConfigured } from "@/lib/admin/client";
import { useAuth } from "@/lib/auth";
import type { MenuKey } from "@/lib/admin/types";

const NAV: { href: string; label: string; menu: MenuKey; exact?: boolean }[] = [
  { href: "/admin", label: "Dashboard", menu: "dashboard", exact: true },
  { href: "/admin/orders", label: "Orders", menu: "orders" },
  { href: "/admin/products", label: "Products", menu: "products" },
  { href: "/admin/categories", label: "Categories", menu: "categories" },
  { href: "/admin/customers", label: "Customers", menu: "customers" },
  { href: "/admin/roles", label: "Roles & access", menu: "roles" },
];

function isCurrent(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { ready, token, user, isStaff, can, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const onLogin = pathname === "/admin/login";

  useEffect(() => {
    if (ready && !token && !onLogin) {
      router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [ready, token, onLogin, pathname, router]);

  useEffect(() => setMenuOpen(false), [pathname]);

  // A drawer you cannot dismiss with Escape, or that lets the page scroll
  // underneath it, reads as a broken overlay on a phone.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  if (!apiConfigured) return <NotConfigured />;
  if (onLogin) return <>{children}</>;

  if (!ready || !token) {
    return (
      <div className="grid min-h-dvh place-items-center bg-paper">
        <p className="label text-muted">Checking your session…</p>
      </div>
    );
  }

  // Signed in, but on a role with no panel access — a customer who typed the
  // URL, or someone whose role was changed while they were looking at it.
  if (!isStaff) return <NoPanelAccess />;

  // A role only sees the menus it holds. The API enforces the same list.
  const visible = NAV.filter((item) => can(item.menu));

  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[15rem_1fr]">
      {/* Sticky on a phone: the only way back to the menu is this bar. */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-ink-2 bg-ink px-4 py-3 lg:hidden">
        <Link href="/admin" className="label text-paper">
          Bakhoora Admin
        </Link>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="admin-nav"
          className="label -mr-2 flex min-h-11 items-center gap-2 px-2 text-paper"
        >
          {menuOpen ? <IconClose /> : <IconMenu />}
          {menuOpen ? "Close" : "Menu"}
        </button>
      </div>

      {/* Backdrop. Tapping anywhere off the drawer closes it. */}
      {menuOpen ? (
        <button
          type="button"
          aria-label="Close the menu"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-40 bg-night/50 lg:hidden"
        />
      ) : null}

      <aside
        id="admin-nav"
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] overflow-y-auto bg-ink transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        } lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:w-auto lg:max-w-none lg:translate-x-0 lg:border-r lg:border-ink-2 lg:transition-none`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between px-6 py-6">
            <div>
              <Link
                href="/admin"
                className="font-[family-name:var(--font-display)] text-2xl text-paper"
              >
                Bakhoora
              </Link>
              <p className="label mt-1 text-paper/45">Admin</p>
            </div>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Close the menu"
              className="-mr-2 -mt-1 p-2 text-paper/60 hover:text-paper lg:hidden"
            >
              <IconClose />
            </button>
          </div>

          <nav className="flex-1 px-3 py-3 lg:py-0">
            <ul className="space-y-0.5">
              {visible.map((item) => {
                const current = isCurrent(pathname, item.href, item.exact);
                const MenuIcon = MENU_ICONS[item.menu];
                const tone = MENU_TONE[item.menu];
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={current ? "page" : undefined}
                      className={`label flex min-h-11 items-center gap-3 py-2.5 pl-2 pr-3 transition-colors ${
                        current
                          ? "bg-paper/12 text-paper"
                          : "text-paper/55 hover:bg-paper/8 hover:text-paper"
                      }`}
                    >
                      <span
                        aria-hidden
                        className="h-5 w-0.5"
                        style={{
                          backgroundColor: current ? `var(--color-${tone})` : "transparent",
                        }}
                      />
                      {/* The hue is the same one that carries through to that
                          menu's screens, so the colour means "you are here". */}
                      <MenuIcon
                        className={current ? "" : "opacity-70"}
                        style={{ color: `var(--color-${tone})` }}
                      />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="border-t border-paper/10 px-6 py-5">
            <p className="truncate text-xs text-paper/60">{user?.email}</p>
            {user ? <p className="label mt-0.5 text-paper/35">{user.role.name}</p> : null}
            <div className="mt-3 flex flex-col gap-2">
              <Link
                href="/"
                className="label flex min-h-11 items-center gap-2 text-paper/50 hover:text-paper"
              >
                <IconExternal />
                View storefront
              </Link>
              <button
                type="button"
                onClick={() => {
                  signOut();
                  router.replace("/admin/login");
                }}
                className="label flex min-h-11 items-center gap-2 self-start text-paper/50 hover:text-paper"
              >
                <IconSignOut />
                Sign out
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main className="min-w-0 px-4 py-6 sm:px-5 md:px-8 md:py-9">{children}</main>
    </div>
  );
}

function NoPanelAccess() {
  const { user, signOut } = useAuth();
  return (
    <div className="grid min-h-dvh place-items-center bg-paper px-6">
      <div className="max-w-lg border border-line bg-paper p-8 text-center">
        <p className="label flex items-center justify-center gap-2 text-accent">
          <IconAlert />
          No panel access
        </p>
        <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl leading-none">
          This account is not staff.
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          You are signed in as <span className="text-ink">{user?.email}</span> on the{" "}
          <span className="text-ink">{user?.role.name}</span> role, which does not include the
          admin panel. An administrator can move you onto a staff role.
        </p>
        <div className="mt-6 flex justify-center gap-4">
          <Link href="/" className="label inline-flex items-center gap-1.5 text-ink hover:underline">
            <IconChevronLeft />
            Storefront
          </Link>
          <button type="button" onClick={signOut} className="label text-muted hover:text-ink">
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="grid min-h-dvh place-items-center bg-paper px-6">
      <div className="max-w-lg border border-line bg-paper p-8">
        <p className="label flex items-center gap-2 text-accent">
          <IconAlert />
          Not connected
        </p>
        <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl">
          The panel has no API to talk to.
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Unlike the storefront, the admin panel has no bundled sample data — every screen reads
          and writes real records. Set <code className="text-ink">NEXT_PUBLIC_API_URL</code> in{" "}
          <code className="text-ink">frontend/.env.local</code> to your FastAPI base URL (for
          example <code className="text-ink">http://localhost:8090/api/v1</code>) and reload.
        </p>
      </div>
    </div>
  );
}
