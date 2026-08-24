import type { Metadata } from "next";

import { Reveal } from "@/components/reveal";
import { ArrowLink, ButtonLink } from "@/components/ui";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Order confirmed" };

const INSTRUCTIONS: Record<string, { title: string; body: string }> = {
  cod: {
    title: "Pay on delivery",
    body: "Keep the exact amount ready for the courier. You will get an SMS an hour before the rider arrives.",
  },
  manual_bkash: {
    title: "Send the payment",
    body: "Send the total to 01700-000000 using Send Money, put the order number in the reference, then reply to the confirmation SMS with your trxID.",
  },
};

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const read = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const order = read("order") ?? "BKH-000000";
  const total = Number(read("total") ?? 0);
  const method = read("method") ?? "cod";
  const instruction = INSTRUCTIONS[method] ?? INSTRUCTIONS.cod;

  return (
    <section className="shell py-20 md:py-32">
      <Reveal>
        <p className="label text-accent">Order confirmed</p>
        <h1 className="display-lg mt-8 max-w-3xl">Thank you. It is being wrapped.</h1>
      </Reveal>

      <Reveal delay={100}>
        <dl className="mt-16 grid max-w-3xl gap-px border border-line bg-line sm:grid-cols-3">
          <div className="bg-paper p-7">
            <dt className="label text-muted">Order number</dt>
            <dd className="mt-3 font-display text-2xl">{order}</dd>
          </div>
          <div className="bg-paper p-7">
            <dt className="label text-muted">Total</dt>
            <dd className="mt-3 font-display text-2xl tabular-nums">{formatPrice(total)}</dd>
          </div>
          <div className="bg-paper p-7">
            <dt className="label text-muted">Arrives</dt>
            <dd className="mt-3 font-display text-2xl">2–4 days</dd>
          </div>
        </dl>
      </Reveal>

      <Reveal delay={160}>
        <div className="mt-14 max-w-2xl border-t border-line pt-10">
          <p className="label text-accent">{instruction.title}</p>
          <p className="mt-5 text-lg leading-relaxed text-muted">{instruction.body}</p>
        </div>
      </Reveal>

      <Reveal delay={220}>
        <div className="mt-14 flex flex-wrap items-center gap-6">
          <ButtonLink href="/shop">Keep shopping</ButtonLink>
          <ArrowLink href="/account" className="px-3 py-4">
            View your orders
          </ArrowLink>
        </div>
      </Reveal>
    </section>
  );
}
