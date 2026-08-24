"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { IconAlert, IconCheck } from "@/components/admin/icons";

type ToastTone = "success" | "error";

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastValue {
  notify: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((message: string, tone: ToastTone = "success") => {
    setToasts((current) => [...current, { id: nextId++, tone, message }]);
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-80 flex-col gap-2"
      >
        {toasts.map((toast) => (
          <ToastCard
            key={toast.id}
            toast={toast}
            onDone={() => setToasts((c) => c.filter((t) => t.id !== toast.id))}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  useEffect(() => {
    // Errors can be long; give them longer to be read.
    const ms = toast.tone === "error" ? 7000 : 3500;
    const timer = window.setTimeout(onDone, ms);
    return () => window.clearTimeout(timer);
  }, [toast.tone, onDone]);

  return (
    <div
      className={`pointer-events-auto flex items-start gap-2.5 border px-4 py-3 text-sm shadow-sm ${
        toast.tone === "error"
          ? "border-accent/40 bg-paper text-ink"
          : "border-line bg-ink text-paper"
      }`}
    >
      {toast.tone === "error" ? (
        <IconAlert className="mt-0.5 text-accent" />
      ) : (
        <IconCheck className="mt-0.5" />
      )}
      <p className="whitespace-pre-line">{toast.message}</p>
    </div>
  );
}

export function useToast(): ToastValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider");
  return value;
}
