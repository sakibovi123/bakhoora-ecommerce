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

import { getProduct, shippingFor } from "@/lib/catalog";
import type { CartLine, ResolvedLine } from "@/lib/types";

const STORAGE_KEY = "bakhoora.cart.v1";

interface CartContextValue {
  lines: ResolvedLine[];
  itemCount: number;
  subtotal: number;
  shipping: number;
  total: number;
  isOpen: boolean;
  isReady: boolean;
  open: () => void;
  close: () => void;
  add: (productSlug: string, variantId: string, quantity?: number) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

function readStorage(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (line): line is CartLine =>
        typeof line === "object" &&
        line !== null &&
        typeof (line as CartLine).variantId === "string" &&
        typeof (line as CartLine).productSlug === "string" &&
        typeof (line as CartLine).quantity === "number",
    );
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [rawLines, setRawLines] = useState<CartLine[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Hydrate after mount so server and client markup match.
  useEffect(() => {
    setRawLines(readStorage());
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rawLines));
  }, [rawLines, isReady]);

  // Lock the page behind the drawer.
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const add = useCallback((productSlug: string, variantId: string, quantity = 1) => {
    setRawLines((current) => {
      const existing = current.find((line) => line.variantId === variantId);
      const variant = getProduct(productSlug)?.variants.find((v) => v.id === variantId);
      const ceiling = variant?.stock ?? 0;
      if (ceiling <= 0) return current;

      if (!existing) {
        return [...current, { productSlug, variantId, quantity: Math.min(quantity, ceiling) }];
      }
      return current.map((line) =>
        line.variantId === variantId
          ? { ...line, quantity: Math.min(line.quantity + quantity, ceiling) }
          : line,
      );
    });
    setIsOpen(true);
  }, []);

  const setQuantity = useCallback((variantId: string, quantity: number) => {
    setRawLines((current) =>
      quantity <= 0
        ? current.filter((line) => line.variantId !== variantId)
        : current.map((line) => (line.variantId === variantId ? { ...line, quantity } : line)),
    );
  }, []);

  const remove = useCallback((variantId: string) => {
    setRawLines((current) => current.filter((line) => line.variantId !== variantId));
  }, []);

  const clear = useCallback(() => setRawLines([]), []);

  const lines = useMemo<ResolvedLine[]>(() => {
    return rawLines.flatMap((line) => {
      const product = getProduct(line.productSlug);
      const variant = product?.variants.find((v) => v.id === line.variantId);
      if (!product || !variant) return [];
      return [{ ...line, product, variant, lineTotal: variant.price * line.quantity }];
    });
  }, [rawLines]);

  const subtotal = useMemo(() => lines.reduce((sum, line) => sum + line.lineTotal, 0), [lines]);
  const shipping = shippingFor(subtotal);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      subtotal,
      shipping,
      total: subtotal + shipping,
      isOpen,
      isReady,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      add,
      setQuantity,
      remove,
      clear,
    }),
    [lines, subtotal, shipping, isOpen, isReady, add, setQuantity, remove, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside <CartProvider>");
  return context;
}
