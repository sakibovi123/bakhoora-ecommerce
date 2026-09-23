"use client";

import Link from "next/link";
import { useEffect, useRef, type RefObject } from "react";

import { IconClose } from "@/components/admin/icons";
import { useAuth } from "@/lib/auth";

/**
 * Full-screen menu. It opens as a dark ring spreading out from the button you
 * pressed — smoke filling a room — and the links rise out of it one by one.
 */
export function SmokeMenu({
  open,
  onClose,
  originRef,
}: {
  open: boolean;
  onClose: () => void;
  originRef: RefObject<HTMLButtonElement | null>;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const { ready, user } = useAuth();

  // Spread from wherever the button actually is; it moves with the
  // announcement bar, so this is measured on every open.
  useEffect(() => {
    const panel = panelRef.current;
    const button = originRef.current;
    if (!panel || !button || !open) return;
    const rect = button.getBoundingClientRect();
    panel.style.setProperty("--ox", `${rect.left + rect.width / 2}px`);
    panel.style.setProperty("--oy", `${rect.top + rect.height / 2}px`);
  }, [open, originRef]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const links = [
    { href: "/shop", label: "Shop everything" },
    { href: "/shop?category=decants", label: "Decants" },
    { href: "/shop?category=oils", label: "Perfume oil" },
    { href: "/about", label: "How we work" },
    ready && user
      ? { href: "/account", label: "Your account" }
      : { href: "/account/login", label: "Sign in" },
  ];

  return (
    <div
      ref={panelRef}
      data-open={open}
      aria-hidden={!open}
      inert={!open}
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      className="smoke-menu fixed inset-0 z-[70] overflow-y-auto bg-night text-paper"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_85%_100%,rgba(184,67,28,0.25),transparent_70%)]"
      />

      <div className="shell relative flex min-h-full flex-col py-6">
        <div className="flex items-center justify-between">
          <p className="label menu-item text-paper/50">Menu</p>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="grid size-11 place-items-center rounded-full border border-paper/20 transition-colors hover:bg-paper hover:text-ink"
          >
            <IconClose />
          </button>
        </div>

        <nav className="mt-10 flex-1" aria-label="Menu">
          <ul>
            {links.map((link, index) => (
              <li key={link.href} className="menu-item" style={{ "--i": index } as React.CSSProperties}>
                <Link
                  href={link.href}
                  onClick={onClose}
                  className="group flex items-center gap-5 border-b border-paper/10 py-3.5 md:py-4"
                >
                  <span className="label w-6 text-paper/35 transition-colors group-hover:text-accent-soft">
                    0{index + 1}
                  </span>
                  <span className="text-[clamp(1.5rem,3.2vw,2.5rem)] font-medium leading-none tracking-[-0.02em] transition-[transform,color] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-3 group-hover:text-accent-soft">
                    {link.label}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div
          className="menu-item mt-14 flex flex-col justify-between gap-4 text-sm text-paper/55 md:flex-row"
          style={{ "--i": links.length } as React.CSSProperties}
        >
          <p className="flex items-center gap-3">
            <span aria-hidden className="ember block size-2" />
            Poured to order in Dhaka · delivered nationwide
          </p>
          <a href="mailto:hello@bakhoora.bd" className="link-underline self-start">
            hello@bakhoora.bd
          </a>
        </div>
      </div>
    </div>
  );
}
