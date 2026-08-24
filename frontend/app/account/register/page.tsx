"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { AUTH_INPUT, AuthError, AuthField } from "@/components/auth-form";
import { ApiError, apiConfigured } from "@/lib/admin/client";
import { useAuth } from "@/lib/auth";

const MIN_PASSWORD = 8;

export default function RegisterPage() {
  const { signUp, ready, token } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && token) router.replace("/account");
  }, [ready, token, router]);

  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (form.password.length < MIN_PASSWORD) {
      setError(`Passwords need at least ${MIN_PASSWORD} characters.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Registering signs you straight in — no second trip to the login form.
      await signUp({
        email: form.email,
        password: form.password,
        full_name: form.full_name,
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      });
      router.replace("/account");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not create the account.");
      setBusy(false);
    }
  }

  return (
    <section className="shell grid gap-16 py-20 md:py-28 lg:grid-cols-[1fr_1fr] lg:items-center">
      <div>
        <p className="label text-muted">Account</p>
        <h1 className="display-md mt-6">Make reordering easy.</h1>
        <ul className="mt-9 space-y-4 text-muted">
          <li className="border-t border-line pt-4">Order history and tracking in one place</li>
          <li className="border-t border-line pt-4">Saved addresses for faster checkout</li>
          <li className="border-t border-line pt-4">First access to limited batches</li>
        </ul>
      </div>

      <form
        onSubmit={onSubmit}
        className="w-full max-w-md border border-line p-8 lg:justify-self-end"
      >
        <div className="space-y-7">
          <AuthField label="Full name">
            <input
              type="text"
              required
              minLength={2}
              autoComplete="name"
              className={AUTH_INPUT}
              value={form.full_name}
              onChange={(event) => set("full_name", event.target.value)}
            />
          </AuthField>
          <AuthField label="Email">
            <input
              type="email"
              required
              autoComplete="email"
              className={AUTH_INPUT}
              value={form.email}
              onChange={(event) => set("email", event.target.value)}
            />
          </AuthField>
          <AuthField label="Phone" hint="Optional — we only text about a live delivery.">
            <input
              type="tel"
              autoComplete="tel"
              className={AUTH_INPUT}
              value={form.phone}
              onChange={(event) => set("phone", event.target.value)}
            />
          </AuthField>
          <AuthField label="Password" hint={`At least ${MIN_PASSWORD} characters.`}>
            <input
              type="password"
              required
              minLength={MIN_PASSWORD}
              autoComplete="new-password"
              className={AUTH_INPUT}
              value={form.password}
              onChange={(event) => set("password", event.target.value)}
            />
          </AuthField>
        </div>

        <button
          type="submit"
          disabled={busy || !apiConfigured}
          className="label mt-9 w-full bg-ink px-7 py-4 text-paper disabled:opacity-40"
        >
          {busy ? "Creating…" : "Create account →"}
        </button>

        {error ? <AuthError message={error} /> : null}
        {!apiConfigured ? (
          <p className="mt-5 text-sm text-accent">
            Set NEXT_PUBLIC_API_URL to register against the FastAPI backend.
          </p>
        ) : null}

        <p className="mt-7 text-sm text-muted">
          Already registered?{" "}
          <Link href="/account/login" className="link-underline text-ink">
            Sign in
          </Link>
        </p>
      </form>
    </section>
  );
}
