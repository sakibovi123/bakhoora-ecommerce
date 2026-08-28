"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Button, Field, Input } from "@/components/admin/ui";
import { Logo } from "@/components/logo";
import {
  IconAlert,
  IconExternal,
  IconLock,
  IconSpinner,
} from "@/components/admin/icons";
import { ApiError } from "@/lib/admin/client";
import { useAuth } from "@/lib/auth";

/**
 * Where to land after signing in.
 *
 * Read from `window.location` rather than `useSearchParams` on purpose: that
 * hook opts the whole route out of prerendering, which would leave this page
 * blank until the JS bundle arrives.
 */
function redirectTarget(): string {
  if (typeof window === "undefined") return "/admin";
  const next = new URLSearchParams(window.location.search).get("next");
  // Only ever bounce back inside the panel — never to an attacker-supplied URL.
  return next && next.startsWith("/admin") && !next.startsWith("//") ? next : "/admin";
}

export default function AdminLoginPage() {
  const { signIn, signOut, ready, user, isStaff } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in with panel access — go straight in.
  useEffect(() => {
    if (ready && isStaff) router.replace(redirectTarget());
  }, [ready, isStaff, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const profile = await signIn(email, password);
      if (!profile.role.is_staff) {
        setError(
          `${profile.email} is on the ${profile.role.name} role, which has no admin access. ` +
            "Ask an administrator to move you onto a staff role.",
        );
        setBusy(false);
        return;
      }
      router.replace(redirectTarget());
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not sign in. Please try again.");
      setBusy(false);
    }
  }

  // Signed in as a customer: offer a way out rather than a dead form.
  if (ready && user && !isStaff) {
    return (
      <div className="grid min-h-dvh place-items-center bg-paper-2 px-5 py-16">
        <div className="w-full max-w-sm border border-line bg-paper p-8 text-center">
          <p className="label flex items-center justify-center gap-2 text-accent">
            <IconAlert />
            No panel access
          </p>
          <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl leading-none">
            Wrong account.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            You are signed in as <span className="text-ink">{user.email}</span> on the{" "}
            <span className="text-ink">{user.role.name}</span> role, which cannot open the panel.
          </p>
          <div className="mt-6 flex justify-center gap-5">
            <button type="button" onClick={signOut} className="label text-ink hover:underline">
              Sign in as someone else
            </button>
            <Link
              href="/"
              className="label inline-flex items-center gap-1.5 text-muted hover:text-ink"
            >
              <IconExternal />
              Storefront
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-paper-2 px-5 py-16">
      <form onSubmit={onSubmit} className="w-full max-w-sm border border-line bg-paper p-8">
        {/* The sign-in card is the one admin screen with room for the full
            lockup, and it is the first thing staff see each morning. */}
        <Logo variant="primary" className="h-24" priority alt="Bakhoora" />
        <p className="label mt-6 flex items-center gap-2 text-muted">
          <IconLock />
          Staff area
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl leading-none">
          Admin sign in
        </h1>
        <p className="mt-3 text-sm text-muted">
          Staff accounts only. Customer logins are rejected here.
        </p>

        <div className="mt-7 space-y-5">
          <Field label="Email">
            <Input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
        </div>

        {error ? (
          <p className="mt-5 whitespace-pre-line border border-accent/40 bg-accent/5 px-3 py-2 text-sm text-accent">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={busy} className="mt-7 w-full">
          {busy ? <IconSpinner /> : <IconLock />}
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
