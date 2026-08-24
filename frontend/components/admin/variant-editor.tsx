"use client";

import { Button, Field, Input, Toggle } from "@/components/admin/ui";
import { STANDARD_SIZES_ML } from "@/lib/admin/types";

export interface VariantDraft {
  size_ml: number;
  price: string;
  stock_quantity: string;
  sku: string;
  is_active: boolean;
}

export function standardDrafts(): VariantDraft[] {
  return STANDARD_SIZES_ML.map((size) => ({
    size_ml: size,
    price: "",
    stock_quantity: "0",
    sku: "",
    is_active: true,
  }));
}

export function isStandard(size: number): boolean {
  return (STANDARD_SIZES_ML as readonly number[]).includes(size);
}

/**
 * Prices for every bottle size.
 *
 * The four standard sizes are fixed rows — the API refuses a product without
 * them — and any extra size is an ordinary row that can be removed again.
 */
export function VariantEditor({
  drafts,
  onChange,
  errors = {},
}: {
  drafts: VariantDraft[];
  onChange: (next: VariantDraft[]) => void;
  errors?: Record<number, string>;
}) {
  const sorted = [...drafts].sort((a, b) => a.size_ml - b.size_ml);

  const update = (size: number, patch: Partial<VariantDraft>) =>
    onChange(drafts.map((draft) => (draft.size_ml === size ? { ...draft, ...patch } : draft)));

  const addSize = () => {
    const largest = Math.max(...drafts.map((d) => d.size_ml), 0);
    let candidate = largest + 20;
    while (drafts.some((draft) => draft.size_ml === candidate)) candidate += 5;
    onChange([
      ...drafts,
      { size_ml: candidate, price: "", stock_quantity: "0", sku: "", is_active: true },
    ]);
  };

  return (
    <div className="space-y-4">
      {sorted.map((draft) => {
        const locked = isStandard(draft.size_ml);
        return (
          <div
            key={draft.size_ml}
            className="grid gap-4 border border-line bg-paper p-4 sm:grid-cols-[5.5rem_1fr_1fr_1fr_auto] sm:items-end"
          >
            <Field label="Size">
              <div className="relative">
                <Input
                  type="number"
                  min={1}
                  max={10000}
                  value={draft.size_ml}
                  disabled={locked}
                  onChange={(event) =>
                    update(draft.size_ml, { size_ml: Number(event.target.value) || draft.size_ml })
                  }
                  aria-label={`Size in millilitres`}
                />
              </div>
            </Field>

            <Field
              label={`Price for ${draft.size_ml}ml`}
              error={errors[draft.size_ml]}
              hint={locked ? undefined : "Extra size"}
            >
              <Input
                inputMode="decimal"
                placeholder="0.00"
                value={draft.price}
                onChange={(event) => update(draft.size_ml, { price: event.target.value })}
              />
            </Field>

            <Field label="Stock">
              <Input
                type="number"
                min={0}
                value={draft.stock_quantity}
                onChange={(event) =>
                  update(draft.size_ml, { stock_quantity: event.target.value })
                }
              />
            </Field>

            <Field label="SKU" hint="Auto if blank">
              <Input
                maxLength={64}
                placeholder="auto"
                value={draft.sku}
                onChange={(event) => update(draft.size_ml, { sku: event.target.value })}
              />
            </Field>

            <div className="flex items-center gap-4 pb-2">
              <Toggle
                label="On sale"
                checked={draft.is_active}
                onChange={(next) => update(draft.size_ml, { is_active: next })}
              />
              {locked ? null : (
                <button
                  type="button"
                  onClick={() =>
                    onChange(drafts.filter((entry) => entry.size_ml !== draft.size_ml))
                  }
                  className="label text-accent hover:underline"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        );
      })}

      <Button tone="ghost" onClick={addSize}>
        + Add another size
      </Button>
      <p className="text-xs text-muted">
        Every product carries {STANDARD_SIZES_ML.join("ml, ")}ml. Those four rows cannot be
        removed — switch one off instead to take it out of the shop.
      </p>
    </div>
  );
}
