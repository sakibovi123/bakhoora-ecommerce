"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { IconChevronLeft, IconLock } from "@/components/admin/icons";
import { Spinner } from "@/components/admin/ui";
import { useAuth } from "@/lib/auth";
import type { MenuAction, MenuKey } from "@/lib/admin/types";

const LABELS: Record<MenuKey, string> = {
  dashboard: "the dashboard",
  reports: "sales reports",
  orders: "orders",
  products: "products",
  categories: "categories",
  customers: "customers",
  roles: "roles and access",
  expenses: "expenses",
  settings: "shop settings",
};

/**
 * Hides a screen the signed-in role cannot use.
 *
 * The API refuses the same request regardless — this exists so someone who
 * types the URL gets an explanation instead of a wall of 403s.
 */
export function Require({
  menu,
  action = "view",
  children,
}: {
  menu: MenuKey;
  action?: MenuAction;
  children: ReactNode;
}) {
  const { ready, user, can } = useAuth();

  if (!ready || !user) return <Spinner label="Checking access" />;
  if (can(menu, action)) return <>{children}</>;

  return (
    <div className="mx-auto max-w-lg border border-line bg-paper p-8 text-center">
      <p className="label flex items-center justify-center gap-2 text-muted">
        <IconLock />
        Not available to you
      </p>
      <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl leading-none">
        No access to {LABELS[menu]}.
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-muted">
        Your role, <span className="text-ink">{user.role.name}</span>, does not include{" "}
        {action === "manage" ? "permission to change" : "access to"} {LABELS[menu]}. An
        administrator can grant it under Roles &amp; access.
      </p>
      <Link
        href="/admin"
        className="label mt-6 inline-flex items-center gap-1.5 text-ink hover:underline"
      >
        <IconChevronLeft />
        Back to the panel
      </Link>
    </div>
  );
}
