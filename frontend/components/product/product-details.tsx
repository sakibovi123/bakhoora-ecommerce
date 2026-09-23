"use client";

import { useState, type ReactNode } from "react";

import { useMoney, useShop } from "@/lib/shop-settings";

const CARD = "rounded-2xl bg-paper shadow-[0_1px_3px_rgba(0,0,0,0.04),0_14px_40px_rgba(0,0,0,0.07)] ring-1 ring-black/5";

function Glyph({ d }: { d: string }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-paper-2 transition-colors duration-300 group-aria-expanded:bg-ink group-aria-expanded:text-paper">
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={d} />
      </svg>
    </span>
  );
}

const ICONS = {
  truck: "M3 6h11v9H3zM14 9h4l3 3v3h-7M7 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  shield: "M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6zM9 12l2 2 4-4",
  cycle: "M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  drop: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
};

/**
 * The fine print, as a stack of rows that open in place. The open row's icon
 * darkens and its body unrolls — height and blur together, so the text
 * resolves as it arrives rather than sliding in sharp.
 */
export function ProductInfo({ isOil }: { isOil: boolean }) {
  const shop = useShop();
  const money = useMoney();
  const [open, setOpen] = useState<number | null>(null);

  const items: { icon: keyof typeof ICONS; title: string; body: ReactNode }[] = [
    {
      icon: "truck",
      title: "Delivery & fees",
      body: (
        <>
          <p>
            Flat {money(shop.deliveryCharge)} anywhere in Bangladesh
            {shop.freeDeliveryThreshold !== null
              ? `, free on orders over ${money(shop.freeDeliveryThreshold)}`
              : ""}
            .
          </p>
          <p className="mt-2">Dhaka in 1–2 days, the rest of the country in 2–4. Cash on delivery.</p>
        </>
      ),
    },
    {
      icon: "shield",
      title: isOil ? "Poured oil, not a full bottle" : "A genuine decant, not a full bottle",
      body: isOil ? (
        <p>
          Perfume oil, bought by the bottle and poured into fresh glass to order. Alcohol-free, so it
          sits close to the skin and lasts longer than a spray.
        </p>
      ) : (
        <p>
          We import the full bottle, then transfer it into smaller glass — the same liquid the house
          bottled. We are an independent decanter, not a dealer for any brand, and we never mix,
          dilute or top anything up.
        </p>
      ),
    },
    {
      icon: "cycle",
      title: "Returns",
      body: (
        <p>
          A decant is poured for you, so we can only take back a sealed, unopened vial within seven
          days. Anything broken in transit, tell us the day it arrives and we will replace it.
        </p>
      ),
    },
    {
      icon: "lock",
      title: "Payment",
      body: <p>Cash on delivery, bKash or Nagad. You never pay for something before it is poured.</p>,
    },
    {
      icon: "drop",
      title: "How to wear it",
      body: (
        <p>
          {isOil
            ? "Dab — do not rub — on pulse points. Rubbing shears the top notes and shortens the dry-down."
            : "Two sprays on the chest, one on the back of the neck. Spray onto skin, not clothing, so the base notes develop."}
        </p>
      ),
    },
    {
      icon: "sun",
      title: "Storage",
      body: (
        <p>
          Keep it in the box, away from sunlight and off the bathroom shelf. Heat and light are what
          turn a fragrance, not time in the glass.
        </p>
      ),
    },
  ];

  return (
    <div className={`${CARD} overflow-hidden`}>
      {items.map((item, index) => {
        const isOpen = open === index;
        return (
          <div key={item.title} className="border-b border-line last:border-b-0">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : index)}
              className="group flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-paper-2/60"
            >
              <Glyph d={ICONS[item.icon]} />
              <span className="flex-1 text-sm font-semibold">{item.title}</span>
              <span
                aria-hidden
                className={`text-muted transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${isOpen ? "rotate-180" : ""}`}
              >
                ⌄
              </span>
            </button>
            <div
              className={`grid transition-[grid-template-rows,opacity,filter] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                isOpen ? "grid-rows-[1fr] opacity-100 blur-0" : "grid-rows-[0fr] opacity-0 blur-sm"
              }`}
            >
              <div className="overflow-hidden">
                <div className="px-5 pb-5 pl-16 text-sm leading-relaxed text-muted">{item.body}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The long description, folded to a few lines under a fade until asked for. */
export function ProductDescription({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 280;

  return (
    <div className={`${CARD} p-5 md:p-6`}>
      <p className="text-sm font-semibold">About this fragrance</p>
      <div
        className={`relative mt-3 overflow-hidden transition-[max-height] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          !long || open ? "max-h-[80rem]" : "max-h-28"
        }`}
      >
        <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{text}</p>
        {long && !open ? (
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-paper to-transparent" />
        ) : null}
      </div>
      {long ? (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="label mt-4 text-[0.65rem] text-ink"
        >
          <span className="link-underline">{open ? "Show less" : "Read the full description"}</span>{" "}
          <span aria-hidden>{open ? "−" : "+"}</span>
        </button>
      ) : null}
    </div>
  );
}
