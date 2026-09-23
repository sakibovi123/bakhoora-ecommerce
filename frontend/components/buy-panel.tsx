"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { IconCart, IconCheck } from "@/components/admin/icons";
import { SmokeText } from "@/components/home/smoke-text";
import { deliveryFor } from "@/lib/api";
import { useCart } from "@/lib/cart-context";
import { useMoney, useShop } from "@/lib/shop-settings";
import type { Product, Variant } from "@/lib/types";

/** Roughly how many sprays an atomiser gets out of a millilitre. */
const SPRAYS_PER_ML = 15;

const CARD = "rounded-2xl bg-paper p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_14px_40px_rgba(0,0,0,0.07)] ring-1 ring-black/5 md:p-6";

/**
 * Everything on the right of the product page that depends on the chosen
 * size: the price, the sizes, the buttons, the vial gauge and the cart sum.
 * One piece of state drives all of it, so they move together when you pick.
 */
export function BuyPanel({
  product,
  tone,
  isOil,
}: {
  product: Product;
  tone: [string, string];
  isOil: boolean;
}) {
  const { add } = useCart();
  const money = useMoney();
  const router = useRouter();
  // A product with no active sizes is a real state now that the catalogue is
  // whatever the admin has entered — it must not index into an empty array.
  const sellable = [...product.variants.filter((variant) => variant.isActive)].sort(
    (a, b) => a.sizeMl - b.sizeMl,
  );
  const firstAvailable = sellable.find((variant) => variant.stock > 0) ?? sellable[0];
  const [variantId, setVariantId] = useState(firstAvailable?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [pour, setPour] = useState<"idle" | "pouring" | "added">("idle");
  const [shared, setShared] = useState(false);
  const [dockVisible, setDockVisible] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const variant = sellable.find((item) => item.id === variantId) ?? firstAvailable;

  // The mobile dock appears once the real button has scrolled off the top.
  useEffect(() => {
    const node = buttonRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) =>
      setDockVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  if (!variant) {
    return (
      <div>
        <Heading product={product} />
        <p className="label mt-8 text-muted">
          No sizes listed yet — write to us and we will tell you what is in the bottle.
        </p>
      </div>
    );
  }

  const soldOut = variant.stock <= 0;
  const lowStock = variant.stock > 0 && variant.stock <= 5;

  // The button fills left to right like a vial being poured, and only then
  // does the line land in the bag.
  function pourIntoBag(then?: () => void) {
    if (soldOut || pour !== "idle") return;
    setPour("pouring");
    window.setTimeout(() => {
      add(product, variant!, quantity);
      setPour("added");
      then?.();
      window.setTimeout(() => setPour("idle"), 1600);
    }, 650);
  }

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: product.name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    } catch {
      // Dismissing the share sheet is not an error worth showing.
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <Heading product={product} />
        <div className="mt-5 flex items-baseline gap-3">
          <RollingPrice text={money(variant.price * quantity)} />
          {variant.compareAtPrice && variant.compareAtPrice > variant.price ? (
            <span className="text-muted line-through tabular-nums">
              {money(variant.compareAtPrice * quantity)}
            </span>
          ) : null}
        </div>
        <p className="mt-1.5 text-sm text-muted">Delivery calculated at checkout.</p>
      </div>

      <div className={CARD}>
        <p className="text-xs font-medium text-muted">Size</p>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {sellable.map((option) => (
            <SizeChip
              key={option.id}
              option={option}
              isOil={isOil}
              selected={option.id === variant.id}
              money={money}
              onPick={() => {
                setVariantId(option.id);
                setQuantity(1);
              }}
            />
          ))}
        </div>

        <p className="mt-6 text-xs font-medium text-muted">Quantity</p>
        <div className="mt-2 flex items-center gap-4">
          <div className="inline-flex items-center overflow-hidden rounded-lg ring-1 ring-line">
            <button
              type="button"
              onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              disabled={quantity <= 1}
              aria-label="Decrease quantity"
              className="grid size-10 place-items-center bg-paper-2 transition-colors hover:bg-paper-3 disabled:text-muted/50"
            >
              −
            </button>
            <span className="grid w-10 place-items-center tabular-nums" aria-live="polite">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity((value) => Math.min(Math.max(variant.stock, 1), value + 1))}
              disabled={quantity >= variant.stock}
              aria-label="Increase quantity"
              className="grid size-10 place-items-center bg-ink text-paper transition-colors hover:bg-ink-2 disabled:bg-paper-3 disabled:text-muted/50"
            >
              +
            </button>
          </div>
          <StockNote stock={variant.stock} soldOut={soldOut} lowStock={lowStock} />
        </div>

        <button
          ref={buttonRef}
          type="button"
          disabled={soldOut}
          onClick={() => pourIntoBag()}
          className="label relative mt-6 w-full overflow-hidden rounded-lg bg-ink py-4 text-paper transition-transform active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-muted"
        >
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-accent to-accent-soft transition-[width] ease-[cubic-bezier(0.65,0,0.35,1)]"
            style={{
              width: pour === "idle" ? "0%" : "100%",
              transitionDuration: pour === "pouring" ? "650ms" : pour === "added" ? "0ms" : "400ms",
              opacity: pour === "added" ? 0 : 1,
            }}
          />
          <span className="relative inline-flex items-center gap-2">
            {soldOut ? (
              "Sold out"
            ) : pour === "pouring" ? (
              "Pouring…"
            ) : pour === "added" ? (
              <>
                <IconCheck /> Added to bag
              </>
            ) : (
              "Add to bag"
            )}
          </span>
        </button>

        <button
          type="button"
          disabled={soldOut}
          onClick={() => pourIntoBag(() => router.push("/checkout"))}
          className="label mt-3 w-full rounded-lg bg-paper py-4 text-ink shadow-[0_1px_3px_rgba(0,0,0,0.06),0_6px_20px_rgba(0,0,0,0.06)] ring-1 ring-black/5 transition-colors hover:bg-paper-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Buy it now
        </button>

        <button
          type="button"
          onClick={share}
          className="label mt-3 w-full rounded-lg py-3 text-[0.65rem] text-muted transition-colors hover:bg-paper-2 hover:text-ink"
        >
          {shared ? "Link copied ✓" : "Share this fragrance ↗"}
        </button>
      </div>

      <SizeVials
        options={sellable}
        selectedId={variant.id}
        tone={tone}
        onPick={(id) => {
          setVariantId(id);
          setQuantity(1);
        }}
      />

      <CartPreview adding={variant.price * quantity} label={`${quantity} × ${variant.name}`} />

      {/* Phone dock: the price and the button, pinned once the real ones scroll away. */}
      <div
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/90 px-5 py-3 backdrop-blur-xl transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] lg:hidden ${
          dockVisible ? "translate-y-0" : "translate-y-full"
        }`}
        inert={!dockVisible}
      >
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{product.name}</p>
            <p className="text-xs text-muted tabular-nums">
              {variant.name} · {money(variant.price * quantity)}
            </p>
          </div>
          <button
            type="button"
            disabled={soldOut}
            onClick={() => pourIntoBag()}
            className="label rounded-full bg-ink px-5 py-3 text-[0.65rem] text-paper disabled:bg-muted"
          >
            {pour === "added" ? "Added ✓" : soldOut ? "Sold out" : "Add to bag"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Heading({ product }: { product: Product }) {
  return (
    <>
      {product.brand ? <p className="label text-[0.65rem] text-muted">{product.brand}</p> : null}
      <SmokeText
        as="h1"
        text={product.name}
        className="mt-3 text-[clamp(2rem,3.4vw,2.75rem)] font-normal leading-[1.08] tracking-[-0.02em]"
      />
      {product.tagline ? <p className="mt-3 leading-relaxed text-muted">{product.tagline}</p> : null}
    </>
  );
}

/**
 * The price, as a row of number wheels. Changing size spins each digit to
 * its new value rather than swapping the text.
 */
function RollingPrice({ text }: { text: string }) {
  const chars = text.split("");
  return (
    <span className="relative inline-flex text-2xl font-medium tabular-nums" aria-label={text}>
      {chars.map((char, index) => {
        // Keyed from the right, so ৳900 → ৳1,200 rolls the units into units.
        const key = chars.length - index;
        if (!/\d/.test(char)) {
          return (
            <span key={`s${key}`} aria-hidden>
              {char}
            </span>
          );
        }
        const digit = Number(char);
        return (
          <span key={`d${key}`} aria-hidden className="relative inline-block h-[1.2em] overflow-hidden leading-[1.2em]">
            <span
              className="block transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{ transform: `translateY(-${digit * 10}%)` }}
            >
              {"0123456789".split("").map((n) => (
                <span key={n} className="block h-[1.2em]">
                  {n}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}

function SizeChip({
  option,
  isOil,
  selected,
  money,
  onPick,
}: {
  option: Variant;
  isOil: boolean;
  selected: boolean;
  money: (amount: number) => string;
  onPick: () => void;
}) {
  const unavailable = option.stock <= 0;
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      className={`group relative flex items-center gap-3 overflow-hidden rounded-lg px-4 py-3 text-left transition-[background-color,color,box-shadow] duration-300 ${
        selected
          ? "bg-ink text-paper shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
          : "bg-paper shadow-[0_1px_3px_rgba(0,0,0,0.06),0_4px_14px_rgba(0,0,0,0.05)] ring-1 ring-black/5 hover:ring-black/20"
      }`}
    >
      <span
        aria-hidden
        className={`grid size-4 shrink-0 place-items-center transition-[opacity,transform] duration-300 ${
          selected ? "scale-100 opacity-100" : "scale-50 opacity-0"
        }`}
      >
        <IconCheck />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[0.7rem] font-bold uppercase tracking-[0.06em] ${unavailable ? "line-through opacity-50" : ""}`}>
          {option.sizeMl}ml {isOil ? "oil" : "decant"}
        </span>
        <span className={`block text-[0.7rem] ${selected ? "text-paper/60" : "text-muted"}`}>
          {unavailable
            ? "Sold out"
            : isOil
              ? money(option.price)
              : `${money(option.price)} · ~${option.sizeMl * SPRAYS_PER_ML} sprays`}
        </span>
      </span>
    </button>
  );
}

function StockNote({ stock, soldOut, lowStock }: { stock: number; soldOut: boolean; lowStock: boolean }) {
  const colour = soldOut ? "bg-muted" : lowStock ? "bg-accent" : "bg-[#2e8b57]";
  return (
    <p className="label flex items-center gap-2 text-[0.6rem] text-muted">
      <span className="relative flex size-2">
        {!soldOut ? <span className={`absolute inset-0 animate-ping rounded-full opacity-60 ${colour}`} /> : null}
        <span className={`relative size-2 rounded-full ${colour}`} />
      </span>
      {soldOut ? "Out of stock" : lowStock ? `Only ${stock} left` : "In stock · ships in 24h"}
    </p>
  );
}

/**
 * Every size as a glass vial drawn to scale against the others. The one you
 * have chosen fills with the fragrance's own colour, a slow wave rocking on
 * its surface; the rest stand empty. Tapping a vial picks that size.
 */
function SizeVials({
  options,
  selectedId,
  tone,
  onPick,
}: {
  options: Variant[];
  selectedId: string;
  tone: [string, string];
  onPick: (id: string) => void;
}) {
  if (options.length < 2) return null;
  const largest = Math.max(...options.map((option) => option.sizeMl));

  return (
    <div className={CARD}>
      <p className="flex items-center gap-2 text-sm font-semibold">
        <span aria-hidden className="text-accent">
          ◖
        </span>
        Available sizes
      </p>
      <div className="mt-5 flex items-end justify-around gap-3">
        {options.map((option) => {
          const selected = option.id === selectedId;
          const height = 56 + (option.sizeMl / largest) * 64;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onPick(option.id)}
              aria-label={`Choose ${option.sizeMl}ml`}
              className="group flex flex-col items-center gap-2"
            >
              {/* cap */}
              <span className="block h-3 w-4 rounded-t-sm bg-ink/80" />
              <span
                className={`relative -mt-2 block w-9 overflow-hidden rounded-b-xl rounded-t-md bg-paper-2 ring-1 transition-[box-shadow] duration-300 ${
                  selected ? "ring-ink/40 shadow-[0_10px_24px_rgba(0,0,0,0.12)]" : "ring-line group-hover:ring-ink/30"
                }`}
                style={{ height }}
              >
                <span
                  className={`${selected ? "liquid" : ""} absolute inset-x-0 bottom-0 block transition-[height] duration-[1.1s] ease-[cubic-bezier(0.16,1,0.3,1)]`}
                  style={
                    {
                      height: selected ? "82%" : "0%",
                      background: `linear-gradient(180deg, ${tone[0]}, ${tone[1]})`,
                      "--wave": tone[0],
                    } as React.CSSProperties
                  }
                />
                {/* glass highlight */}
                <span className="absolute inset-y-2 left-1.5 block w-1 rounded-full bg-white/60" />
              </span>
              <span className={`text-[0.7rem] font-bold uppercase ${selected ? "text-ink" : "text-muted"}`}>
                {option.sizeMl}ml
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The bag, before and after this click — and how far that leaves you from
 * free delivery, drawn as a wick burning toward the threshold.
 */
function CartPreview({ adding, label }: { adding: number; label: string }) {
  const { subtotal, isReady } = useCart();
  const shop = useShop();
  const money = useMoney();
  const now = isReady ? subtotal : 0;
  const after = now + adding;
  const threshold = shop.freeDeliveryThreshold;
  const progress = threshold ? Math.min(after / threshold, 1) : 0;

  return (
    <div className={CARD}>
      <p className="flex items-center gap-2 text-sm font-semibold">
        <IconCart /> Your bag
      </p>
      <dl className="mt-4 space-y-2.5 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Current subtotal</dt>
          <dd className="font-semibold tabular-nums">{money(now)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">After adding {label}</dt>
          <dd className="font-semibold tabular-nums">{money(after)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Delivery</dt>
          <dd className="tabular-nums">{deliveryFor(after, shop) === 0 ? "Free" : money(deliveryFor(after, shop))}</dd>
        </div>
      </dl>

      {threshold ? (
        <div className="mt-5 rounded-xl bg-paper-2 p-4">
          <p className="text-sm font-medium">
            {progress >= 1
              ? "Free delivery unlocked"
              : `Add ${money(threshold - after)} more for free delivery`}
          </p>
          <div className="relative mt-3 h-1 rounded-full bg-line">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-ink to-accent transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{ width: `${progress * 100}%` }}
            />
            <span
              aria-hidden
              className="ember absolute top-1/2 block size-2 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{ left: `${progress * 100}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
