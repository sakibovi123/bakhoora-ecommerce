"use client";

import type { ReactNode } from "react";

export function AuthField({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="label text-muted">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export const AUTH_INPUT =
  "border-b border-line bg-transparent py-3 text-ink placeholder:text-muted/60 focus:outline-none";

export function AuthError({ message }: { message: string }) {
  return (
    <p className="mt-5 whitespace-pre-line border border-accent/40 bg-accent/5 px-3 py-2 text-sm text-accent">
      {message}
    </p>
  );
}
