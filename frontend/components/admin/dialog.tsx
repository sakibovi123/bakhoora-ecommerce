"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { IconAlert, IconClose } from "@/components/admin/icons";
import { Button } from "@/components/admin/ui";

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" for anything that destroys data. */
  tone?: "primary" | "danger";
}

type Ask = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Ask | null>(null);

interface Pending extends ConfirmOptions {
  resolve: (answer: boolean) => void;
}

/**
 * The panel's own confirm dialog.
 *
 * `window.confirm` is a browser chrome box: it cannot be styled, it says
 * "localhost:3000 says", it blocks the whole thread, and on some setups it is
 * suppressed entirely — which would silently turn "delete?" into "deleted".
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);

  const ask = useCallback<Ask>(
    (options) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    [],
  );

  const close = useCallback(
    (answer: boolean) => {
      setPending((current) => {
        current?.resolve(answer);
        return null;
      });
    },
    [],
  );

  useEffect(() => {
    if (!pending) return;
    // Focus the action so Enter and Escape both work without reaching for the mouse.
    confirmButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(false);
      if (event.key === "Enter") close(true);
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [pending, close]);

  const value = useMemo(() => ask, [ask]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-night/50 p-4 sm:items-center">
          {/* Clicking away cancels, which is what Escape does too. */}
          <button
            type="button"
            aria-label={pending.cancelLabel ?? "Cancel"}
            onClick={() => close(false)}
            className="absolute inset-0 cursor-default"
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="relative w-full max-w-md border border-line bg-paper shadow-lg"
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <h2
                id="confirm-title"
                className="flex items-center gap-2 font-[family-name:var(--font-display)] text-xl leading-tight"
              >
                {pending.tone === "danger" ? <IconAlert className="text-accent" /> : null}
                {pending.title}
              </h2>
              <button
                type="button"
                onClick={() => close(false)}
                aria-label="Close"
                className="-mr-1 -mt-1 p-1.5 text-muted hover:text-ink"
              >
                <IconClose />
              </button>
            </div>

            {pending.body ? (
              <div className="px-5 py-4 text-sm leading-relaxed text-muted">{pending.body}</div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">
              <Button tone="ghost" onClick={() => close(false)}>
                {pending.cancelLabel ?? "Cancel"}
              </Button>
              <Button
                ref={confirmButton}
                tone={pending.tone === "danger" ? "danger" : "primary"}
                onClick={() => close(true)}
              >
                {pending.confirmLabel ?? "Confirm"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Ask {
  const value = useContext(ConfirmContext);
  if (!value) throw new Error("useConfirm must be used inside ConfirmProvider");
  return value;
}
