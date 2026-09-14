"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { useConfirm } from "@/components/admin/dialog";
import { IconAlert, IconCheck, IconChevronLeft, IconClose, IconSpinner } from "@/components/admin/icons";
import { Require } from "@/components/admin/require";
import { useToast } from "@/components/admin/toast";
import {
  Button,
  ErrorNote,
  Field,
  PageHeader,
  Panel,
  Pill,
  Spinner,
  Textarea,
} from "@/components/admin/ui";
import { ApiError, adminApi } from "@/lib/admin/client";
import { dateTime, moneyExact } from "@/lib/admin/format";
import type { PriceReview, PriceReviewLine } from "@/lib/admin/types";
import { useResource } from "@/lib/admin/use-resource";
import { useAuth } from "@/lib/auth";

const STATUS_TONE: Record<PriceReview["status"], string> = {
  pending: "bg-[var(--color-amber-soft)]",
  approved: "bg-[var(--color-green-soft)]",
  rejected: "bg-paper-2",
};

export default function PriceReviewPage() {
  return (
    <Require menu="pricing">
      <ReviewScreen />
    </Require>
  );
}

function ReviewScreen() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const { notify } = useToast();
  const confirm = useConfirm();
  const router = useRouter();

  const load = useCallback((auth: string) => adminApi.priceReview(auth, id), [id]);
  const { data: review, error, loading, reload } = useResource(load, [id]);

  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const isAdmin = user?.role.slug === "admin";

  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (loading && !review) return <Spinner label="Loading the sheet" />;
  if (!review) return null;

  const drifted = review.lines.filter((line) => line.drifted);
  const losses = review.lines.filter((line) => line.below_cost);

  async function approve() {
    if (!token || !review) return;
    const sure = await confirm({
      title: `Apply ${review.reference}?`,
      body: `${review.line_count} price${review.line_count === 1 ? "" : "s"} will change in the shop immediately.${
        drifted.length ? ` ${drifted.length} of them will overwrite a price somebody changed since this sheet was drawn up.` : ""
      }`,
      confirmLabel: "Approve and apply",
    });
    if (!sure) return;
    setBusy(true);
    try {
      const applied = await adminApi.approvePrices(token, review.id, note.trim() || null);
      notify(
        applied.skipped.length
          ? `${applied.updated} applied · ${applied.skipped.length} skipped`
          : `${applied.updated} price${applied.updated === 1 ? "" : "s"} updated`,
      );
      if (applied.skipped.length) {
        notify(`No longer in the catalogue: ${applied.skipped.join(", ")}`, "error");
      }
      reload();
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : "Could not approve", "error");
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!token || !review) return;
    setBusy(true);
    try {
      await adminApi.rejectPrices(token, review.id, note.trim() || null);
      notify(`${review.reference} rejected`);
      reload();
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : "Could not reject", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={review.reference}
        subtitle={
          <>
            Proposed {dateTime(review.created_at)}
            {review.proposed_by ? ` by ${review.proposed_by}` : ""}
          </>
        }
        actions={
          <Link
            href="/admin/pricing"
            className="label inline-flex items-center gap-1.5 text-muted hover:text-ink"
          >
            <IconChevronLeft />
            Pricing
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={STATUS_TONE[review.status]}>{review.status}</Pill>
        {review.reviewed_by ? (
          <span className="label text-muted">
            {review.status} by {review.reviewed_by}
            {review.reviewed_at ? ` · ${dateTime(review.reviewed_at)}` : ""}
          </span>
        ) : null}
      </div>

      {review.note ? (
        <Panel title="Why">
          <p className="whitespace-pre-wrap text-sm">{review.note}</p>
        </Panel>
      ) : null}

      {review.status === "pending" && drifted.length > 0 ? (
        <div className="flex gap-2 border border-[var(--color-amber)] bg-[var(--color-amber-soft)] p-3 text-xs">
          <IconAlert className="mt-0.5 shrink-0" />
          <p>
            {drifted.length === 1 ? "One price has" : `${drifted.length} prices have`} been
            changed since this sheet was drawn up. Approving replaces those changes with
            the figures below — the live price is shown against each.
          </p>
        </div>
      ) : null}

      {losses.length > 0 ? (
        <div className="flex gap-2 border border-accent bg-paper-2 p-3 text-xs">
          <IconAlert className="mt-0.5 shrink-0 text-accent" />
          <p>
            {losses.length === 1 ? "One line sells" : `${losses.length} lines sell`} below
            what the bottle costs. That may be deliberate — check before approving.
          </p>
        </div>
      ) : null}

      <Panel tone="green" title="The changes" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="label px-3 py-2 font-normal text-muted">Product</th>
                <th className="label px-3 py-2 font-normal text-muted">Size</th>
                <th className="label px-3 py-2 font-normal text-muted">Buying</th>
                <th className="label px-3 py-2 font-normal text-muted">Was</th>
                <th className="label px-3 py-2 font-normal text-muted">Becomes</th>
                <th className="label px-3 py-2 text-right font-normal text-muted">Profit</th>
                <th className="label px-3 py-2 text-right font-normal text-muted">Margin</th>
              </tr>
            </thead>
            <tbody>
              {review.lines.map((line) => (
                <Line key={line.id} line={line} pending={review.status === "pending"} />
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {review.review_note ? (
        <Panel title="Decision note">
          <p className="whitespace-pre-wrap text-sm">{review.review_note}</p>
        </Panel>
      ) : null}

      {review.status === "pending" && isAdmin ? (
        <Panel title="Decide">
          <div className="space-y-4">
            <Field label="Note" hint="Optional. Worth filling in when rejecting.">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button onClick={approve} disabled={busy}>
                {busy ? <IconSpinner className="animate-spin" /> : <IconCheck />}
                Approve and apply
              </Button>
              <Button tone="danger" onClick={reject} disabled={busy}>
                <IconClose />
                Reject
              </Button>
            </div>
          </div>
        </Panel>
      ) : null}

      {review.status !== "pending" ? (
        <Button tone="ghost" onClick={() => router.push("/admin/pricing")}>
          Back to the sheet
        </Button>
      ) : null}
    </div>
  );
}

function Line({ line, pending }: { line: PriceReviewLine; pending: boolean }) {
  const drifted = Boolean(line.drifted);
  return (
    <tr className={`border-b border-line/60 ${line.below_cost ? "bg-paper-2" : ""}`}>
      <td className="px-3 py-2">
        <span className="text-ink">{line.product_name}</span>
        <span className="block font-mono text-xs text-muted">{line.sku}</span>
        {line.variant_id === null ? (
          <span className="label mt-1 block text-accent">no longer in the catalogue</span>
        ) : null}
      </td>
      <td className="px-3 py-2 text-muted">{line.variant_name}</td>
      <td className="px-3 py-2 [font-variant-numeric:tabular-nums]">
        <span className="text-muted">{line.from_cost ? moneyExact(line.from_cost) : "—"}</span>
        <span className="mx-1 text-muted">→</span>
        <span className="text-ink">{line.to_cost ? moneyExact(line.to_cost) : "—"}</span>
      </td>
      <td className="px-3 py-2 text-muted [font-variant-numeric:tabular-nums]">
        {moneyExact(line.from_price)}
        {/* Only worth showing while it can still be acted on. */}
        {pending && drifted ? (
          <span className="label mt-1 block text-[var(--color-amber)]">
            now {line.current_price ? moneyExact(line.current_price) : "—"}
          </span>
        ) : null}
      </td>
      <td className="px-3 py-2 font-medium [font-variant-numeric:tabular-nums]">
        {moneyExact(line.to_price)}
      </td>
      <td
        className={`px-3 py-2 text-right [font-variant-numeric:tabular-nums] ${
          line.below_cost ? "text-accent" : ""
        }`}
      >
        {line.to_profit === null ? (
          <span className="text-muted">—</span>
        ) : (
          moneyExact(line.to_profit)
        )}
      </td>
      <td className="px-3 py-2 text-right text-muted [font-variant-numeric:tabular-nums]">
        {line.to_margin_pct === null ? "—" : `${line.to_margin_pct}%`}
      </td>
    </tr>
  );
}
