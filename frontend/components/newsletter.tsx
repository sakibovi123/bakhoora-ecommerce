"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

export function Newsletter() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!email.includes("@")) return;
    setDone(true);
    setEmail("");
  }

  return (
    <div className="rounded-xl border border-paper/10 bg-paper/[0.03] p-6 md:p-7">
      <h2 className="text-2xl font-normal tracking-[-0.01em] text-paper">Stay in the loop</h2>
      <p className="mt-3 text-sm leading-relaxed text-paper/55">
        One letter a month: new arrivals first, restocks before they go.
      </p>

      <form onSubmit={onSubmit} className="mt-6">
        {done ? (
          <p className="rounded-md border border-paper/15 px-4 py-3.5 text-sm text-paper/80">
            You are on the list. Watch your inbox around the first of the month.
          </p>
        ) : (
          <div className="flex overflow-hidden rounded-md border border-paper/15 focus-within:border-paper/40">
            <label htmlFor="newsletter-email" className="sr-only">
              Email address
            </label>
            <input
              id="newsletter-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Enter your email"
              className="min-w-0 flex-1 bg-transparent px-4 py-3.5 text-sm text-paper placeholder:text-paper/35 focus:outline-none"
            />
            <button
              type="submit"
              className="whitespace-nowrap bg-paper px-3.5 text-sm font-semibold text-ink transition-colors hover:bg-accent-soft sm:px-5"
            >
              Subscribe →
            </button>
          </div>
        )}
      </form>

      <div className="mt-6 border-t border-paper/10 pt-5 text-sm">
        <p className="text-paper/40">Already ordered with us?</p>
        <Link href="/account" className="link-underline mt-1.5 inline-block text-paper/75">
          See your orders →
        </Link>
      </div>
    </div>
  );
}
