"use client";

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
    <div className="grid gap-10 md:grid-cols-[1fr_1fr] md:items-end">
      <div>
        <p className="label text-paper/45">Newsletter</p>
        <h2 className="display-md mt-5 text-paper">
          One letter a month.
          <br />
          New blends first.
        </h2>
      </div>

      <form onSubmit={onSubmit} className="w-full">
        {done ? (
          <p className="border-b border-paper/30 pb-4 text-paper/80">
            You are on the list. Watch your inbox around the first of the month.
          </p>
        ) : (
          <div className="flex items-center gap-4 border-b border-paper/30 pb-4">
            <label htmlFor="newsletter-email" className="sr-only">
              Email address
            </label>
            <input
              id="newsletter-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="w-full bg-transparent text-paper placeholder:text-paper/35 focus:outline-none"
            />
            <button type="submit" className="label whitespace-nowrap text-paper">
              Subscribe →
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
