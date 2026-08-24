"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Reveal } from "@/components/reveal";
import { ArrowLink, ButtonLink } from "@/components/ui";
import { ApiError, adminApi, apiConfigured } from "@/lib/admin/client";
import { ORDER_STATUS_TONE, dateTime, money, titleCase } from "@/lib/admin/format";
import type { OrderListItem } from "@/lib/admin/types";
import { useAuth } from "@/lib/auth";

export function AccountScreen() {
  const { ready, token, user, isStaff, signOut } = useAuth();
  const router = useRouter();

  const [orders, setOrders] = useState<OrderListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !token) router.replace("/account/login?next=%2Faccount");
  }, [ready, token, router]);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setOrders((await adminApi.myOrders(token)).items);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not load your orders.");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!apiConfigured) {
    return (
      <section className="shell py-20 md:py-28">
        <p className="label text-muted">Account</p>
        <h1 className="display-md mt-6">Not connected.</h1>
        <p className="mt-7 max-w-lg leading-relaxed text-muted">
          Set <code className="text-ink">NEXT_PUBLIC_API_URL</code> to sign in against the
          FastAPI backend.
        </p>
      </section>
    );
  }

  if (!ready || !user) {
    return (
      <section className="shell py-20 md:py-28">
        <p className="label text-muted">Loading your account…</p>
      </section>
    );
  }

  return (
    <section className="shell py-20 md:py-28">
      <Reveal>
        <p className="label text-muted">Account</p>
        <h1 className="display-md mt-6">
          {user.full_name.split(" ")[0]}&rsquo;s shelf.
        </h1>
        <p className="mt-7 max-w-lg leading-relaxed text-muted">
          Signed in as <span className="text-ink">{user.email}</span>.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-6">
          <button
            type="button"
            onClick={() => {
              signOut();
              router.replace("/");
            }}
            className="label link-underline text-ink"
          >
            Sign out
          </button>
          {isStaff ? (
            <ArrowLink href="/admin">Open the admin panel</ArrowLink>
          ) : null}
        </div>
      </Reveal>

      <div className="mt-16 border-t border-line pt-10">
        <h2 className="label text-muted">Orders</h2>

        {error ? (
          <p className="mt-6 text-sm text-accent">{error}</p>
        ) : orders === null ? (
          <p className="mt-6 text-sm text-muted">Loading…</p>
        ) : orders.length === 0 ? (
          <div className="mt-6 max-w-lg">
            <p className="leading-relaxed text-muted">
              Nothing here yet. Everything you order shows up on this page with its status.
            </p>
            <ButtonLink href="/shop" className="mt-7">
              Browse fragrances
            </ButtonLink>
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-line border-t border-line">
            {orders.map((order) => (
              <li
                key={order.id}
                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 py-5"
              >
                <div>
                  <p className="font-medium text-ink">{order.order_number}</p>
                  <p className="text-sm text-muted">{dateTime(order.created_at)}</p>
                </div>
                <span
                  className={`label px-2 py-1 text-[0.625rem] ${ORDER_STATUS_TONE[order.status]}`}
                >
                  {titleCase(order.status)}
                </span>
                <p className="text-ink [font-variant-numeric:tabular-nums]">
                  {money(order.total)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-16 grid gap-10 border-t border-line pt-10 md:grid-cols-2">
        <div>
          <h2 className="label text-muted">Addresses</h2>
          <p className="mt-4 max-w-sm leading-relaxed text-muted">
            Saved at checkout so the next order is three fields instead of nine.
          </p>
          <ArrowLink href="/checkout" className="mt-5">
            Go to checkout
          </ArrowLink>
        </div>
        <div>
          <h2 className="label text-muted">Details</h2>
          <p className="mt-4 max-w-sm leading-relaxed text-muted">
            {user.full_name}
            {user.phone ? ` · ${user.phone}` : ""}
          </p>
          <p className="mt-2 text-sm text-muted">
            Role: <span className="text-ink">{user.role.name}</span>
          </p>
        </div>
      </div>
    </section>
  );
}
