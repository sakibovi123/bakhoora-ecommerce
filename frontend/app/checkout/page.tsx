"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { CartLineThumb } from "@/components/cart-line-thumb";
import { ButtonLink } from "@/components/ui";
import { useCart } from "@/lib/cart-context";
import { useMoney } from "@/lib/shop-settings";

const PAYMENT_METHODS = [
  {
    id: "cod",
    label: "Cash on delivery",
    detail: "Pay the courier when the parcel arrives. Available nationwide.",
  },
  {
    id: "manual_bkash",
    label: "bKash — send money",
    detail: "Send to 01700-000000, then enter your trxID. We confirm within an hour.",
  },
];

const DISTRICTS = ["Dhaka", "Chattogram", "Sylhet", "Khulna", "Rajshahi", "Barishal", "Rangpur", "Mymensingh"];

export default function CheckoutPage() {
  const { lines, subtotal, shipping, total, clear, isReady } = useCart();
  const money = useMoney();
  const router = useRouter();
  const [method, setMethod] = useState("cod");
  const [submitting, setSubmitting] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);

    // The FastAPI backend owns order creation. Until NEXT_PUBLIC_API_URL is wired up
    // we mint a local reference so the confirmation screen can be designed and tested.
    const reference = `BKH-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${Math.random()
      .toString(16)
      .slice(2, 8)
      .toUpperCase()}`;

    const amount = total;
    clear();
    router.push(`/checkout/success?order=${reference}&total=${amount}&method=${method}`);
  }

  if (!isReady) return <div className="shell py-32" aria-busy />;

  if (lines.length === 0) {
    return (
      <section className="shell py-24 text-center md:py-40">
        <p className="label text-muted">Checkout</p>
        <h1 className="display-md mt-7">There is nothing to pay for.</h1>
        <div className="mt-10 flex justify-center">
          <ButtonLink href="/shop">Browse fragrances</ButtonLink>
        </div>
      </section>
    );
  }

  return (
    <section className="shell py-14 md:py-20">
      <p className="label text-muted">Checkout</p>
      <h1 className="display-md mt-6">Where is it going?</h1>

      <form onSubmit={onSubmit} className="mt-14 grid gap-14 lg:grid-cols-[1.5fr_1fr] lg:gap-16">
        <div className="space-y-14">
          <fieldset>
            <legend className="label flex items-center gap-3 text-muted">
              <span className="text-accent">01</span>
              <span aria-hidden className="h-px w-8 bg-current opacity-40" />
              Contact
            </legend>
            <div className="mt-7 grid gap-6 sm:grid-cols-2">
              <Field label="Full name" name="name" autoComplete="name" required />
              <Field label="Phone" name="phone" type="tel" autoComplete="tel" required placeholder="01XXXXXXXXX" />
              <Field
                label="Email"
                name="email"
                type="email"
                autoComplete="email"
                className="sm:col-span-2"
              />
            </div>
          </fieldset>

          <fieldset>
            <legend className="label flex items-center gap-3 text-muted">
              <span className="text-accent">02</span>
              <span aria-hidden className="h-px w-8 bg-current opacity-40" />
              Delivery address
            </legend>
            <div className="mt-7 grid gap-6 sm:grid-cols-2">
              <Field
                label="Address line 1"
                name="line1"
                autoComplete="address-line1"
                required
                className="sm:col-span-2"
              />
              <Field
                label="Address line 2"
                name="line2"
                autoComplete="address-line2"
                className="sm:col-span-2"
              />
              <Field label="City / area" name="city" autoComplete="address-level2" required />
              <label className="flex flex-col gap-2">
                <span className="label text-muted">District</span>
                <select
                  name="district"
                  required
                  defaultValue="Dhaka"
                  className="border-b border-line bg-transparent py-3 focus:outline-none"
                >
                  {DISTRICTS.map((district) => (
                    <option key={district}>{district}</option>
                  ))}
                </select>
              </label>
              <Field label="Postal code" name="postal" autoComplete="postal-code" />
              <Field label="Note for the courier" name="note" className="sm:col-span-2" />
            </div>
          </fieldset>

          <fieldset>
            <legend className="label flex items-center gap-3 text-muted">
              <span className="text-accent">03</span>
              <span aria-hidden className="h-px w-8 bg-current opacity-40" />
              Payment
            </legend>
            <div className="mt-7 space-y-4">
              {PAYMENT_METHODS.map((option) => (
                <label
                  key={option.id}
                  className={`flex cursor-pointer items-start gap-4 border p-6 transition-colors duration-300 ${
                    method === option.id ? "border-ink bg-paper-2" : "border-line hover:border-ink"
                  }`}
                >
                  <input
                    type="radio"
                    name="payment"
                    value={option.id}
                    checked={method === option.id}
                    onChange={() => setMethod(option.id)}
                    className="mt-1 size-4 accent-[#16140f]"
                  />
                  <span>
                    <span className="label block">{option.label}</span>
                    <span className="mt-2 block text-sm text-muted">{option.detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="border border-line p-8">
            <p className="label text-muted">Your order</p>

            <ul className="mt-7 space-y-5">
              {lines.map((line) => (
                <li key={line.variantId} className="flex items-center gap-4">
                  <div className="size-16 shrink-0 bg-paper-2">
                    <CartLineThumb line={line} className="size-16" />
                  </div>
                  <div className="flex-1">
                    <p className="font-display text-lg leading-tight">{line.name}</p>
                    <p className="label mt-1 text-muted">
                      {line.variantName} × {line.quantity}
                    </p>
                  </div>
                  <p className="text-sm tabular-nums">{money(line.lineTotal)}</p>
                </li>
              ))}
            </ul>

            <dl className="mt-8 space-y-3 border-t border-line pt-6 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd className="tabular-nums">{money(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Delivery</dt>
                <dd className="tabular-nums">{shipping === 0 ? "Free" : money(shipping)}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-4 text-xl">
                <dt className="font-display">Total</dt>
                <dd className="font-display tabular-nums">{money(total)}</dd>
              </div>
            </dl>

            <button
              type="submit"
              disabled={submitting}
              className="label mt-8 w-full bg-ink px-7 py-4 text-paper transition-colors hover:bg-ink-2 disabled:opacity-50"
            >
              {submitting ? "Placing order…" : "Place order →"}
            </button>

            <p className="mt-5 text-center text-xs leading-relaxed text-muted">
              By placing this order you agree to our{" "}
              <Link href="/about" className="link-underline">
                terms
              </Link>
              .
            </p>
          </div>
        </aside>
      </form>
    </section>
  );
}

function Field({
  label,
  className = "",
  ...props
}: React.ComponentProps<"input"> & { label: string }) {
  return (
    <label className={`flex flex-col gap-2 ${className}`}>
      <span className="label text-muted">{label}</span>
      <input
        {...props}
        className="border-b border-line bg-transparent py-3 placeholder:text-muted/50 focus:outline-none"
      />
    </label>
  );
}
