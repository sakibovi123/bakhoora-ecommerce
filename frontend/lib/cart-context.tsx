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

import { deliveryFor } from "@/lib/api";
import { useShop } from "@/lib/shop-settings";
import type { CartLine, Product, ResolvedLine, Variant } from "@/lib/types";

// v2: lines carry their own product snapshot now that there is no bundled
// catalogue to resolve a slug against. A v1 cart cannot be read under the new
// shape, so the key change deliberately abandons it rather than half-render it.
const STORAGE_KEY = "bakhoora.cart.v2";

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
  add: (product: Product, variant: Variant, quantity?: number) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

function isCartLine(value: unknown): value is CartLine {
  if (typeof value !== "object" || value === null) return false;
  const line = value as Partial<CartLine>;
  return (
    typeof line.productSlug === "string" &&
    typeof line.variantId === "string" &&
    typeof line.quantity === "number" &&
    typeof line.name === "string" &&
    typeof line.variantName === "string" &&
    typeof line.unitPrice === "number"
  );
}

function readStorage(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCartLine);
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const shop = useShop();
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

  const add = useCallback((product: Product, variant: Variant, quantity = 1) => {
    const ceiling = variant.stock;
    if (ceiling <= 0) return;

    setRawLines((current) => {
      const existing = current.find((line) => line.variantId === variant.id);
      if (existing) {
        return current.map((line) =>
          line.variantId === variant.id
            ? { ...line, quantity: Math.min(line.quantity + quantity, ceiling) }
            : line,
        );
      }
      const snapshot: CartLine = {
        productSlug: product.slug,
        variantId: variant.id,
        quantity: Math.min(quantity, ceiling),
        name: product.name,
        brand: product.brand,
        categorySlug: product.category?.slug ?? null,
        variantName: variant.name,
        unitPrice: variant.price,
        image: product.primaryImage,
        stock: variant.stock,
      };
      return [...current, snapshot];
    });
    setIsOpen(true);
  }, []);

  const setQuantity = useCallback((variantId: string, quantity: number) => {
    setRawLines((current) =>
      quantity <= 0
        ? current.filter((line) => line.variantId !== variantId)
        : current.map((line) =>
            line.variantId === variantId
              ? { ...line, quantity: Math.min(quantity, line.stock || quantity) }
              : line,
          ),
    );
  }, []);

  const remove = useCallback((variantId: string) => {
    setRawLines((current) => current.filter((line) => line.variantId !== variantId));
  }, []);

  const clear = useCallback(() => setRawLines([]), []);

  const lines = useMemo<ResolvedLine[]>(
    () => rawLines.map((line) => ({ ...line, lineTotal: line.unitPrice * line.quantity })),
    [rawLines],
  );

  const subtotal = useMemo(() => lines.reduce((sum, line) => sum + line.lineTotal, 0), [lines]);
  const shipping = deliveryFor(subtotal, shop);

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
