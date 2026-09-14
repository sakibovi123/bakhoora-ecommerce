"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { Dropdown } from "@/components/admin/dropdown";
import {
  IconAlert,
  IconImage,
  IconSave,
  IconSparkle,
  IconSpinner,
  IconTrash,
} from "@/components/admin/icons";
import { useToast } from "@/components/admin/toast";
import {
  Button,
  Field,
  Input,
  Panel,
  Pill,
  Textarea,
} from "@/components/admin/ui";
import { ApiError, adminApi, mediaUrl } from "@/lib/admin/client";
import { moneyExact } from "@/lib/admin/format";
import type { ExpenseCategory, ReceiptDraft } from "@/lib/admin/types";
import { useAuth } from "@/lib/auth";

/** Today, built from local parts — `toISOString()` would hand back yesterday. */
function localToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${String(now.getDate()).padStart(2, "0")}`;
}

const CONFIDENCE: Record<
  ReceiptDraft["confidence"],
  { tone: string; label: string }
> = {
  high: { tone: "bg-[var(--color-green-soft)]", label: "Figures look printed and clear" },
  medium: { tone: "bg-[var(--color-amber-soft)]", label: "Handwritten — check the figures" },
  low: { tone: "bg-[var(--color-amber-soft)]", label: "Hard to read — check every figure" },
};

/**
 * Upload a photographed bill, then correct what was read off it before saving.
 *
 * The reading step never writes anything. A vision model transcribing Bengali
 * numerals off a creased cash memo will sometimes be wrong, and a wrong total
 * does not announce itself — it just moves the month's profit — so the draft
 * lands in a form beside the photograph and a person presses Save.
 */
export function ReceiptUpload({
  categories,
  onSaved,
}: {
  categories: ExpenseCategory[];
  onSaved: () => void;
}) {
  const { token } = useAuth();
  const { notify } = useToast();
  const picker = useRef<HTMLInputElement>(null);

  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [draft, setDraft] = useState<ReceiptDraft | null>(null);

  const read = useCallback(
    async (file: File) => {
      if (!token) return;
      setReading(true);
      try {
        setDraft(await adminApi.readReceipt(token, file));
      } catch (cause) {
        notify(
          cause instanceof ApiError ? cause.message : "Could not read that photo",
          "error",
        );
      } finally {
        setReading(false);
        // Clear the input so re-picking the same file fires change again.
        if (picker.current) picker.current.value = "";
      }
    },
    [token, notify],
  );

  if (draft) {
    return (
      <ReceiptReview
        draft={draft}
        categories={categories}
        onCancel={() => setDraft(null)}
        onSaved={() => {
          setDraft(null);
          onSaved();
        }}
      />
    );
  }

  return (
    <Panel tone="green" title="Upload a bill">
      <input
        ref={picker}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void read(file);
        }}
      />
      {/* A button, not a div with a click handler: this is the only control in
          the zone, so it should be the thing the keyboard lands on. */}
      <button
        type="button"
        disabled={reading}
        onClick={() => picker.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file) void read(file);
        }}
        className={`flex w-full flex-col items-center gap-2 border border-dashed px-4 py-8 text-center transition-colors ${
          dragging ? "border-[var(--color-green)] bg-[var(--color-green-soft)]" : "border-line"
        } ${reading ? "cursor-wait opacity-70" : "cursor-pointer hover:border-[var(--color-green)]"}`}
      >
        {reading ? (
          <>
            <IconSpinner className="animate-spin" />
            <span className="text-sm">Reading the bill…</span>
            <span className="text-xs text-muted">
              This takes a few seconds. Nothing is saved until you check it.
            </span>
          </>
        ) : (
          <>
            <IconImage />
            <span className="text-sm">Drop a photo of a cash memo, or click to pick one</span>
            <span className="text-xs text-muted">
              Handwriting and Bengali numerals are fine. You check every figure
              before it is saved.
            </span>
          </>
        )}
      </button>
    </Panel>
  );
}

/* ------------------------------------------------------------------ review */

function ReceiptReview({
  draft,
  categories,
  onCancel,
  onSaved,
}: {
  draft: ReceiptDraft;
  categories: ExpenseCategory[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { token } = useAuth();
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);

  // Seeded from the draft once. These are the operator's figures from here on;
  // re-syncing them to the draft would undo a correction as it was typed.
  const [spentOn, setSpentOn] = useState(draft.spent_on ?? localToday());
  const [amount, setAmount] = useState(draft.amount ?? "");
  const [paid, setPaid] = useState(draft.amount_paid ?? "");
  const [description, setDescription] = useState(draft.description ?? "");
  const [supplier, setSupplier] = useState(draft.supplier ?? "");
  const [reference, setReference] = useState(draft.reference ?? "");
  const [note, setNote] = useState(draft.note ?? "");
  const [categoryId, setCategoryId] = useState(draft.category_id ?? "");

  const total = Number.parseFloat(amount);
  const handed = paid.trim() === "" ? total : Number.parseFloat(paid);
  const due = Number.isFinite(total) && Number.isFinite(handed) ? total - handed : null;

  const overpaid = due !== null && due < 0;
  const ready =
    Boolean(description.trim() && categoryId && spentOn) &&
    Number.isFinite(total) &&
    total > 0 &&
    !overpaid;

  const confidence = CONFIDENCE[draft.confidence];

  async function save() {
    if (!token || !ready) return;
    setBusy(true);
    try {
      await adminApi.createExpense(token, {
        spent_on: spentOn,
        amount,
        // Blank means the bill was settled in full, which is what the API reads
        // an absent value as. An explicit 0 is a different statement and is
        // sent as one.
        amount_paid: paid.trim() === "" ? null : paid,
        description: description.trim(),
        note: note.trim() || null,
        supplier: supplier.trim() || null,
        reference: reference.trim() || null,
        // Ties the saved figure back to the paper it was read off.
        receipt_url: draft.receipt_url,
        category_id: categoryId,
      });
      notify(due && due > 0 ? "Expense recorded, with a due" : "Expense recorded");
      onSaved();
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : "Could not save", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      tone="green"
      title="Check this before it counts"
      actions={<Pill tone={confidence.tone}>{confidence.label}</Pill>}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* The paper, at a size you can actually read the handwriting at. */}
        <a
          href={mediaUrl(draft.receipt_url)}
          target="_blank"
          rel="noreferrer"
          className="block border border-line bg-paper-2"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl(draft.receipt_url)}
            alt="The uploaded bill"
            className="max-h-[32rem] w-full object-contain"
          />
        </a>

        <div className="space-y-4">
          {draft.warnings.length > 0 ? (
            <div className="flex gap-2 border border-[var(--color-amber)] bg-[var(--color-amber-soft)] p-3">
              <IconAlert className="mt-0.5 shrink-0" />
              <ul className="space-y-1 text-xs">
                {draft.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date on the bill">
              <Input
                type="date"
                value={spentOn}
                onChange={(event) => setSpentOn(event.target.value)}
              />
            </Field>
            <Field label="Category">
              {categories.length ? (
                <Dropdown
                  value={categoryId}
                  onChange={setCategoryId}
                  placeholder="Pick one"
                  aria-label="Category"
                  options={categories.map((item) => ({
                    value: item.id,
                    label: item.name,
                  }))}
                />
              ) : (
                <p className="text-xs text-muted">Add a category first.</p>
              )}
            </Field>
          </div>

          <Field label="What it was">
            <Input
              maxLength={200}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Supplier" hint="Optional.">
              <Input
                maxLength={120}
                value={supplier}
                onChange={(event) => setSupplier(event.target.value)}
              />
            </Field>
            <Field label="Memo no." hint="Optional.">
              <Input
                maxLength={60}
                value={reference}
                onChange={(event) => setReference(event.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bill total" hint="The whole cost, paid or not.">
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </Field>
            <Field label="Paid now" hint="Leave blank if settled in full.">
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder={Number.isFinite(total) ? total.toFixed(2) : "0.00"}
                value={paid}
                onChange={(event) => setPaid(event.target.value)}
              />
            </Field>
          </div>

          {/* The figure the operator is really checking against the paper's own
              "Due" line, shown as they type rather than after saving. */}
          <div
            className={`flex items-center justify-between border p-3 text-sm ${
              overpaid
                ? "border-[var(--color-amber)] bg-[var(--color-amber-soft)]"
                : "border-line bg-paper-2"
            }`}
          >
            <span className="label text-muted">Still owed</span>
            <span className="[font-variant-numeric:tabular-nums]">
              {overpaid
                ? "Paid is more than the total"
                : due === null
                  ? "—"
                  : moneyExact(due)}
            </span>
          </div>

          <Field label="Note" hint="What the bill itemised. Edit freely.">
            <Textarea
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>

          <div className="flex gap-2">
            <Button onClick={save} disabled={busy || !ready} className="flex-1">
              {busy ? <IconSpinner className="animate-spin" /> : <IconSave />}
              {busy ? "Saving…" : "Save expense"}
            </Button>
            <Button tone="ghost" onClick={onCancel} disabled={busy}>
              <IconTrash />
              Discard
            </Button>
          </div>

          <p className="flex items-center gap-1.5 text-[0.625rem] text-muted">
            <IconSparkle />
            Read by {draft.model}. Nothing is saved until you press Save.
          </p>
        </div>
      </div>
    </Panel>
  );
}
