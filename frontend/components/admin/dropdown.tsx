"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { IconCheck, IconSearch, IconSpinner } from "@/components/admin/icons";

export interface DropdownOption {
  value: string;
  label: string;
  /** Second line, for anything that needs qualifying. */
  hint?: string;
  disabled?: boolean;
}

/** Past this many rows, scanning beats scrolling, so search turns itself on. */
const SEARCH_THRESHOLD = 8;

/**
 * The panel's own dropdown, with search.
 *
 * A native `<select>` renders its list with the operating system's widget: it
 * ignores the panel's type and colour, looks different on every platform, and
 * cannot show a second line, a tick, or a search box.
 *
 * It keeps the keyboard contract a native select has — arrows move, Enter and
 * Space choose, Escape closes, Home/End jump — because a dropdown that can only
 * be used with a mouse is a downgrade however good it looks.
 *
 * Search filters the options here. Pass `onSearch` instead when the list comes
 * from the server and is too long to hold in the browser (customers), and the
 * options are then used exactly as given.
 */
export function Dropdown({
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled = false,
  className = "",
  searchable,
  searchPlaceholder = "Search…",
  onSearch,
  loading = false,
  emptyLabel = "Nothing matches",
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Defaults to on once the list is long enough to be worth searching. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Server-side search. Given, the options are shown as-is, unfiltered here. */
  onSearch?: (term: string) => void;
  loading?: boolean;
  emptyLabel?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [term, setTerm] = useState("");
  const wrapper = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const id = useId();

  const withSearch = searchable ?? (Boolean(onSearch) || options.length > SEARCH_THRESHOLD);

  const shown = useMemo(() => {
    // A server-driven list has already been filtered; filtering again here
    // would hide rows the server deliberately returned.
    if (onSearch || !term.trim()) return options;
    const needle = term.trim().toLowerCase();
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) ||
        option.hint?.toLowerCase().includes(needle),
    );
  }, [options, term, onSearch]);

  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  useEffect(() => {
    if (!open) {
      setTerm("");
      return;
    }
    // Open on the current choice rather than the top of the list.
    const index = shown.findIndex((option) => option.value === value);
    setActive(index >= 0 ? index : 0);
    if (withSearch) search.current?.focus();
    // Only when the popup opens; re-running on every keystroke would fight the
    // arrow keys for control of the highlight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Typing narrows the list, so the highlight has to come back into range.
  useEffect(() => {
    setActive(0);
  }, [term]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({
      block: "nearest",
    });
  }, [open, active]);

  const choose = (index: number) => {
    const option = shown[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
  };

  const step = (delta: number) => {
    if (shown.length === 0) return;
    let next = active;
    for (let i = 0; i < shown.length; i += 1) {
      next = (next + delta + shown.length) % shown.length;
      if (!shown[next]?.disabled) break;
    }
    setActive(next);
  };

  function onKeyDown(event: React.KeyboardEvent) {
    if (disabled) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (open) step(1);
        else setOpen(true);
        break;
      case "ArrowUp":
        event.preventDefault();
        if (open) step(-1);
        else setOpen(true);
        break;
      case "Home":
        if (open) {
          event.preventDefault();
          setActive(0);
        }
        break;
      case "End":
        if (open) {
          event.preventDefault();
          setActive(shown.length - 1);
        }
        break;
      case "Enter":
        event.preventDefault();
        if (open) choose(active);
        else setOpen(true);
        break;
      case " ":
        // Space is a character while typing a search term.
        if (!open) {
          event.preventDefault();
          setOpen(true);
        } else if (!withSearch) {
          event.preventDefault();
          choose(active);
        }
        break;
      case "Escape":
        if (open) {
          event.preventDefault();
          setOpen(false);
        }
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        break;
    }
  }

  return (
    <div ref={wrapper} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-controls={open ? `${id}-list` : undefined}
        className={`flex w-full items-center justify-between gap-2 border px-3 py-2 text-left text-sm transition-colors ${
          disabled
            ? "cursor-not-allowed border-line bg-paper-2 text-muted"
            : "border-line bg-paper text-ink hover:border-ink/40"
        } ${open ? "border-ink" : ""}`}
      >
        <span className={`truncate ${selected ? "" : "text-muted"}`}>
          {selected?.label ?? placeholder}
        </span>
        <span
          aria-hidden
          className={`shrink-0 text-muted transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
               strokeLinecap="round" strokeLinejoin="round" className="size-4">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      {open ? (
        <div className="absolute z-30 mt-1 w-full border border-ink bg-paper shadow-lg">
          {withSearch ? (
            <div className="relative border-b border-line">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                ref={search}
                type="text"
                value={term}
                placeholder={searchPlaceholder}
                aria-label={ariaLabel ? `Search ${ariaLabel.toLowerCase()}` : "Search"}
                aria-controls={`${id}-list`}
                onKeyDown={onKeyDown}
                onChange={(event) => {
                  setTerm(event.target.value);
                  onSearch?.(event.target.value);
                }}
                className="w-full bg-paper py-2 pl-9 pr-3 text-sm text-ink placeholder:text-muted/70 focus:outline-none"
              />
              {loading ? (
                <IconSpinner className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
              ) : null}
            </div>
          ) : null}

          <ul
            ref={list}
            id={`${id}-list`}
            role="listbox"
            aria-label={ariaLabel}
            tabIndex={-1}
            className="max-h-64 overflow-y-auto"
          >
            {shown.length === 0 ? (
              <li className="px-3 py-3 text-sm text-muted">
                {loading ? "Searching…" : emptyLabel}
              </li>
            ) : (
              shown.map((option, index) => {
                const isSelected = option.value === value;
                return (
                  <li key={option.value || `blank-${index}`}>
                    <button
                      type="button"
                      role="option"
                      data-index={index}
                      aria-selected={isSelected}
                      disabled={option.disabled}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => choose(index)}
                      className={`flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-sm transition-colors ${
                        option.disabled
                          ? "cursor-not-allowed text-muted/60"
                          : index === active
                            ? "bg-paper-2 text-ink"
                            : "text-ink"
                      }`}
                    >
                      <span>
                        <span className="block">{option.label}</span>
                        {option.hint ? (
                          <span className="block text-xs text-muted">{option.hint}</span>
                        ) : null}
                      </span>
                      {isSelected ? <IconCheck className="mt-0.5 shrink-0" /> : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
