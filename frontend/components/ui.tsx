import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Tone = "ink" | "paper" | "outline";

const TONES: Record<Tone, string> = {
  ink: "bg-ink text-paper hover:bg-ink-2",
  paper: "bg-paper text-ink hover:bg-paper-2",
  outline: "border border-current text-ink hover:bg-ink hover:text-paper",
};

const BASE =
  "label inline-flex items-center justify-center gap-2 px-7 py-4 transition-colors duration-300 disabled:cursor-not-allowed disabled:opacity-40";

export function Button({
  tone = "ink",
  className = "",
  children,
  ...props
}: ComponentProps<"button"> & { tone?: Tone }) {
  return (
    <button className={`${BASE} ${TONES[tone]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  tone = "ink",
  className = "",
  children,
}: {
  href: string;
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`${BASE} ${TONES[tone]} ${className}`}>
      {children}
    </Link>
  );
}

/** Text link with the arrow-and-rule treatment used across the site. */
export function ArrowLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`label group inline-flex items-center gap-3 ${className}`}
    >
      <span className="link-underline">{children}</span>
      <span
        aria-hidden
        className="transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1.5"
      >
        →
      </span>
    </Link>
  );
}

export function Rule({ className = "" }: { className?: string }) {
  return <hr className={`border-0 border-t border-line ${className}`} />;
}
