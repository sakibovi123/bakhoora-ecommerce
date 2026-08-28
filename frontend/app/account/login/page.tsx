"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { AUTH_INPUT, AuthError, AuthField } from "@/components/auth-form";
import { ApiError, apiConfigured } from "@/lib/admin/client";
import { useAuth } from "@/lib/auth";

function target(): string {
  if (typeof window === "undefined") return "/account";
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/account";
}

export default function LoginPage() {
  const { signIn, ready, token } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in — nothing to do here.
  useEffect(() => {
    if (ready && token) router.replace("/account");
  }, [ready, token, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      router.replace(target());
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not sign in.");
      setBusy(false);
    }
  }

  return (
    <section className="shell grid gap-16 py-20 md:py-28 lg:grid-cols-[1fr_1fr] lg:items-center">
      <div>
        <p className="label text-muted">Account</p>
        <h1 className="display-md mt-6">Welcome back.</h1>
        <p className="mt-7 max-w-sm leading-relaxed text-muted">
          Sign in to see past orders, saved addresses and reorder in two clicks.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="w-full max-w-md border border-line p-8 lg:justify-self-end"
      >
        <div className="space-y-7">
          <AuthField label="Email">
            <input
              type="email"
              required
              autoComplete="email"
              className={AUTH_INPUT}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </AuthField>
          <AuthField label="Password">
            <input
              type="password"
              required
              autoComplete="current-password"
              className={AUTH_INPUT}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </AuthField>
        </div>

        <button
          type="submit"
          disabled={busy || !apiConfigured}
          className="label mt-9 w-full bg-ink px-7 py-4 text-paper disabled:opacity-40"
        >
          {busy ? "Signing in…" : "Sign in →"}
        </button>

        {error ? <AuthError message={error} /> : null}
        {!apiConfigured ? (
          <p className="mt-5 text-sm text-accent">
            Set NEXT_PUBLIC_API_URL to sign in against the FastAPI backend.
          </p>
        ) : null}

        <p className="mt-7 text-sm text-muted">
          New here?{" "}
          <Link href="/account/register" className="link-underline text-ink">
            Create an account
          </Link>
        </p>
      </form>
    </section>
  );
}
