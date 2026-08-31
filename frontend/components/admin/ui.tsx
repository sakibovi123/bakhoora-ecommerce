"use client";

import Link from "next/link";
import {
  Children,
  cloneElement,
  createContext,
  forwardRef,
  isValidElement,
  useContext,
  type ComponentProps,
  type ReactNode,
} from "react";

import { toneVars, type Tone } from "@/components/admin/tone";
import {
  IconAlert,
  IconChevronLeft,
  IconChevronRight,
  IconSearch,
  IconSpinner,
} from "@/components/admin/icons";

/* ------------------------------------------------------------------ layout */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b border-line pb-5">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl leading-none sm:text-3xl">
          <span className="break-words">{title}</span>
        </h1>
        {subtitle ? <p className="mt-2 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  actions,
  children,
  className = "",
  bodyClassName = "p-4 sm:p-5",
  tone,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Tints the header. Panels do not change on hover — see .tone-tile. */
  tone?: Tone;
}) {
  return (
    <section
      style={tone ? toneVars(tone) : undefined}
      className={`border border-line bg-paper ${className}`}
    >
      {title ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5"
          style={tone ? { backgroundColor: "var(--tone-soft)" } : undefined}
        >
          <h2 className="label text-muted">{title}</h2>
          {actions}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/* ----------------------------------------------------------------- buttons */

type ButtonTone = "primary" | "ghost" | "danger";

const BUTTON_TONE: Record<ButtonTone, string> = {
  primary: "bg-ink text-paper hover:bg-ink-2 disabled:hover:bg-ink",
  ghost: "border border-line bg-paper text-ink hover:bg-paper-2",
  danger: "border border-accent/40 bg-paper text-accent hover:bg-accent/10",
};

const BTN =
  "label inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2.5 text-[0.6875rem] " +
  "transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40";

export const Button = forwardRef<
  HTMLButtonElement,
  ComponentProps<"button"> & { tone?: ButtonTone }
>(function Button({ tone = "primary", className = "", children, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={`${BTN} ${BUTTON_TONE[tone]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
});

export function LinkButton({
  href,
  tone = "ghost",
  className = "",
  children,
}: {
  href: string;
  tone?: ButtonTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`${BTN} ${BUTTON_TONE[tone]} ${className}`}>
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ fields */

export function Field({
  label,
  hint,
  error,
  children,
  className = "",
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="label text-muted">{label}</span>
      {children}
      {error ? (
        <span className="text-xs text-accent">{error}</span>
      ) : hint ? (
        <span className="text-xs text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

const CONTROL =
  "w-full border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted/70 " +
  "focus:border-ink focus:outline-none disabled:bg-paper-2 disabled:text-muted";

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input className={`${CONTROL} ${className}`} {...props} />;
}

export function Textarea({ className = "", ...props }: ComponentProps<"textarea">) {
  return <textarea className={`${CONTROL} ${className}`} rows={4} {...props} />;
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-[var(--color-ink)]"
      />
      <span>
        <span className="block text-sm text-ink">{label}</span>
        {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------- pills */

export function Pill({
  tone,
  dot,
  children,
}: {
  tone: string;
  /** Background class for the status dot. Omit for a plain pill. */
  dot?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`label inline-flex items-center gap-1.5 whitespace-nowrap px-2 py-1 text-[0.625rem] ${tone}`}
    >
      {dot ? <span aria-hidden className={`size-1.5 rounded-full ${dot}`} /> : null}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ states */

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-10 text-sm text-muted" role="status">
      <IconSpinner />
      {label}…
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="border border-accent/40 bg-accent/5 p-4">
      <p className="label flex items-center gap-2 text-accent">
        <IconAlert />
        Something went wrong
      </p>
      <p className="mt-2 whitespace-pre-line text-sm text-ink">{message}</p>
      {onRetry ? (
        <Button tone="ghost" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 border border-dashed border-line px-6 py-14 text-center">
      <IconSearch className="size-6 text-muted/60" />
      <p className="font-[family-name:var(--font-display)] text-xl">{title}</p>
      {body ? <p className="max-w-sm text-sm text-muted">{body}</p> : null}
      {action}
    </div>
  );
}

/* -------------------------------------------------------------- pagination */

export function Pagination({
  page,
  pages,
  total,
  noun,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  noun: string;
  onPage: (page: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
      <p className="text-xs text-muted">
        {total} {noun}
        {total === 1 ? "" : "s"}
        {pages > 1 ? ` · page ${page} of ${pages}` : ""}
      </p>
      {pages > 1 ? (
        <div className="flex gap-2">
          <Button tone="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            <IconChevronLeft />
            Prev
          </Button>
          <Button tone="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>
            Next
            <IconChevronRight />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ tables */

/** Column headers, so each <Cell> can label itself once the table stacks. */
const TableHeadContext = createContext<string[]>([]);

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <TableHeadContext.Provider value={head}>
      <div className="overflow-x-auto">
        {/* min-width only from md up — below that `.data-table` stacks instead. */}
        <table className="data-table w-full border-collapse text-sm md:min-w-[44rem]">
          <thead>
            <tr className="border-b border-line bg-paper-2/60">
              {head.map((cell, index) => (
                <th
                  key={index}
                  scope="col"
                  className="label px-4 py-2.5 text-left font-medium text-muted"
                >
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </TableHeadContext.Provider>
  );
}

export function Row({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  const head = useContext(TableHeadContext);
  return (
    <tr
      onClick={onClick}
      className={`border-b border-line/70 last:border-0 ${onClick ? "cursor-pointer" : ""}`}
    >
      {/* Hand each cell its column name rather than repeating it at every call
          site, where it would drift from the header the first time one moves.
          Counting only real cells matters: a conditional column written as
          `{canEdit ? <Cell/> : null}` still occupies an index in Children.map,
          which would shift every label after it by one on the stacked view. */}
      {labelCells(children, head)}
    </tr>
  );
}

function labelCells(children: ReactNode, head: string[]): ReactNode {
  let column = 0;
  return Children.map(children, (child) =>
    isValidElement<{ "data-label"?: string }>(child)
      ? cloneElement(child, { "data-label": head[column++] ?? "" })
      : child,
  );
}

export function Cell({
  children,
  className = "",
  colSpan,
  ...rest
}: ComponentProps<"td">) {
  return (
    <td colSpan={colSpan} className={`px-4 py-3 align-middle ${className}`} {...rest}>
      {children}
    </td>
  );
}


/** Text input with a search glyph. The icon is decorative — the field keeps its label. */
export function SearchInput({ className = "", ...props }: ComponentProps<"input">) {
  return (
    <div className={`relative ${className}`}>
      <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <Input type="search" className="pl-9" {...props} />
    </div>
  );
}
