"use client";

import { useMemo } from "react";

import { Dropdown } from "@/components/admin/dropdown";
import {
  IconArrowDown,
  IconArrowUp,
  IconAlert,
  IconCheck,
  IconPlus,
  IconTrash,
} from "@/components/admin/icons";
import { Field, Input, Panel, Pill, Textarea, Toggle } from "@/components/admin/ui";
import { money } from "@/lib/admin/format";
import {
  MAX_COMBO_PRODUCTS,
  MIN_COMBO_PRODUCTS,
  STANDARD_SIZES_ML,
  type Product,
  type Variant,
} from "@/lib/admin/types";

/* ------------------------------------------------------------------ shapes */

export interface ComboDetails {
  name: string;
  slug: string;
  tagline: string;
  use_case: string;
  occasion: string;
  description: string;
  is_active: boolean;
  is_featured: boolean;
}

export interface SizeDraft {
  size_ml: number;
  price: string;
  is_active: boolean;
}

export const EMPTY_COMBO: ComboDetails = {
  name: "",
  slug: "",
  tagline: "",
  use_case: "",
  occasion: "",
  description: "",
  is_active: true,
  is_featured: false,
};

/** The campaign sheet prices its bundles at one size; 6ml is where they start. */
export function startingSizes(): SizeDraft[] {
  return [{ size_ml: 6, price: "", is_active: true }];
}

const blankToNull = (value: string) => (value.trim() ? value.trim() : null);

export function comboPayload(details: ComboDetails, picks: string[], sizes: SizeDraft[]) {
  return {
    name: details.name.trim(),
    tagline: blankToNull(details.tagline),
    use_case: blankToNull(details.use_case),
    occasion: blankToNull(details.occasion),
    description: blankToNull(details.description),
    is_active: details.is_active,
    is_featured: details.is_featured,
    products: picks,
    sizes: sizes.map((size) => ({
      size_ml: size.size_ml,
      price: Number.parseFloat(size.price).toFixed(2),
      is_active: size.is_active,
    })),
  };
}

/**
 * What stops this combo being saved, in the order the form reads.
 *
 * Returned rather than thrown so the page can disable its save button on the
 * same answer it prints — the two drifting apart is how a form ends up with a
 * button that does nothing when pressed.
 */
export function comboProblems(
  details: ComboDetails,
  picks: string[],
  sizes: SizeDraft[],
): string[] {
  const problems: string[] = [];
  if (!details.name.trim()) problems.push("The combo needs a name.");
  if (picks.length < MIN_COMBO_PRODUCTS) {
    problems.push(`Pick at least ${MIN_COMBO_PRODUCTS} perfumes.`);
  }
  if (!sizes.length) problems.push("Add at least one size, or there is nothing to buy.");
  for (const size of sizes) {
    const price = Number.parseFloat(size.price);
    if (!size.price.trim() || Number.isNaN(price) || price <= 0) {
      problems.push(`The ${size.size_ml}ml option needs a price above zero.`);
    }
  }
  return problems;
}

/* -------------------------------------------------------------- stock maths */

function bottleAt(product: Product | undefined, sizeMl: number): Variant | undefined {
  return product?.variants.find((variant) => variant.size_ml === sizeMl);
}

interface SizeReading {
  /** How many of the bundle could be made up from stock on hand. */
  sets: number;
  /** One line per perfume that is in the way, ready to print. */
  blockers: string[];
  /** What the same bottles cost bought one by one. Null if one is missing. */
  worth: number | null;
}

/**
 * Read a size option against live stock, in the browser.
 *
 * The API works the same figure out when it serves a saved combo, but the
 * builder has to answer it for a combo that does not exist yet — otherwise the
 * operator picks five oils, saves, and only then finds out that one of them has
 * no 6ml bottle. Both sides agree on the rule: the scarcest bottle decides, and
 * a missing or hidden one means none at all.
 */
export function readSize(picks: string[], byId: Map<string, Product>, sizeMl: number): SizeReading {
  const blockers: string[] = [];
  const counts: number[] = [];
  let worth = 0;
  let priced = true;

  for (const id of picks) {
    const product = byId.get(id);
    if (!product) continue;
    const bottle = bottleAt(product, sizeMl);
    if (!bottle) {
      blockers.push(`${product.name} is not sold in ${sizeMl}ml`);
      priced = false;
      continue;
    }
    worth += Number.parseFloat(bottle.price) || 0;
    if (!product.is_active) {
      blockers.push(`${product.name} is hidden from the storefront`);
      continue;
    }
    if (!bottle.is_active) {
      blockers.push(`${product.name} has its ${sizeMl}ml switched off`);
      continue;
    }
    if (bottle.stock_quantity <= 0) {
      blockers.push(`${product.name} is out of stock at ${sizeMl}ml`);
      continue;
    }
    counts.push(bottle.stock_quantity);
  }

  return {
    sets: blockers.length || !counts.length ? 0 : Math.min(...counts),
    blockers,
    worth: priced && picks.length ? worth : null,
  };
}

/* ----------------------------------------------------------------- details */

export function ComboFields({
  value,
  onChange,
  showSlug = true,
}: {
  value: ComboDetails;
  onChange: (next: ComboDetails) => void;
  showSlug?: boolean;
}) {
  const set = <K extends keyof ComboDetails>(key: K, next: ComboDetails[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Combo name" hint="What the campaign calls it.">
          <Input
            required
            maxLength={200}
            placeholder="Everyday Fresh 5"
            value={value.name}
            onChange={(event) => set("name", event.target.value)}
          />
        </Field>
        <Field label="Use / occasion" hint="How the campaign groups it.">
          <Input
            maxLength={120}
            placeholder="Everyday / Fresh"
            value={value.use_case}
            onChange={(event) => set("use_case", event.target.value)}
          />
        </Field>
      </div>

      {showSlug ? (
        <Field label="Slug" hint="Leave blank and one is generated from the name.">
          <Input
            maxLength={220}
            placeholder="everyday-fresh-5"
            value={value.slug}
            onChange={(event) => set("slug", event.target.value)}
          />
        </Field>
      ) : null}

      <Field label="Short description" hint="One line, shown on the card.">
        <Input
          maxLength={300}
          placeholder="Everyday rotation"
          value={value.tagline}
          onChange={(event) => set("tagline", event.target.value)}
        />
      </Field>

      <Field label="Notes / occasion" hint="When to wear it. Printed under the contents.">
        <Input
          maxLength={300}
          placeholder="Best: hot and humid weather."
          value={value.occasion}
          onChange={(event) => set("occasion", event.target.value)}
        />
      </Field>

      <Field label="Description">
        <Textarea
          rows={4}
          value={value.description}
          onChange={(event) => set("description", event.target.value)}
        />
      </Field>

      <div className="flex flex-wrap gap-8 border-t border-line pt-5">
        <Toggle
          label="Live on the storefront"
          hint="Turn off to park a campaign without deleting it."
          checked={value.is_active}
          onChange={(next) => set("is_active", next)}
        />
        <Toggle
          label="Featured"
          hint="Shown on the home page."
          checked={value.is_featured}
          onChange={(next) => set("is_featured", next)}
        />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- contents */

export function ComboContents({
  picks,
  onChange,
  products,
  loading,
}: {
  picks: string[];
  onChange: (next: string[]) => void;
  products: Product[];
  loading?: boolean;
}) {
  const byId = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const options = useMemo(
    () =>
      products
        .filter((product) => !picks.includes(product.id))
        .map((product) => ({
          value: product.id,
          label: product.name,
          hint: [product.brand, product.is_active ? null : "Hidden from the storefront"]
            .filter(Boolean)
            .join(" · "),
        })),
    [products, picks],
  );

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= picks.length) return;
    const next = [...picks];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const full = picks.length >= MAX_COMBO_PRODUCTS;

  return (
    <div className="space-y-4">
      {picks.length === 0 ? (
        <p className="border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          Nothing in this combo yet. Add {MIN_COMBO_PRODUCTS} or more perfumes below.
        </p>
      ) : (
        <ol className="space-y-2">
          {picks.map((id, index) => {
            const product = byId.get(id);
            return (
              <li
                key={id}
                className="flex flex-wrap items-center gap-3 border border-line bg-paper px-3 py-2.5"
              >
                <span className="label w-6 shrink-0 text-muted">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">
                    {product?.name ?? "This perfume is no longer in the catalogue"}
                  </span>
                  {product?.brand ? (
                    <span className="block truncate text-xs text-muted">{product.brand}</span>
                  ) : null}
                </span>
                {product && !product.is_active ? (
                  <Pill tone="bg-paper-2 text-muted">Hidden</Pill>
                ) : null}
                <span className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${product?.name ?? "this perfume"} up`}
                    className="flex size-9 items-center justify-center border border-line text-muted disabled:opacity-30 hover:enabled:bg-paper-2"
                  >
                    <IconArrowUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === picks.length - 1}
                    aria-label={`Move ${product?.name ?? "this perfume"} down`}
                    className="flex size-9 items-center justify-center border border-line text-muted disabled:opacity-30 hover:enabled:bg-paper-2"
                  >
                    <IconArrowDown className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange(picks.filter((entry) => entry !== id))}
                    aria-label={`Remove ${product?.name ?? "this perfume"}`}
                    className="flex size-9 items-center justify-center border border-line text-accent hover:bg-accent/10"
                  >
                    <IconTrash className="size-3.5" />
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <Field
        label="Add a perfume"
        hint={
          full
            ? `That is the most a combo can hold (${MAX_COMBO_PRODUCTS}).`
            : "The order here is the order it is listed in."
        }
      >
        <Dropdown
          value=""
          aria-label="Add a perfume to this combo"
          searchable
          disabled={full || loading}
          loading={loading}
          placeholder={loading ? "Loading the catalogue…" : "Search perfumes…"}
          searchPlaceholder="Search perfumes…"
          emptyLabel="No perfume matches"
          options={options}
          onChange={(id) => id && onChange([...picks, id])}
        />
      </Field>
    </div>
  );
}

/* ----------------------------------------------------------- sizes & prices */

export function ComboSizes({
  sizes,
  onChange,
  picks,
  products,
}: {
  sizes: SizeDraft[];
  onChange: (next: SizeDraft[]) => void;
  picks: string[];
  products: Product[];
}) {
  const byId = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const sorted = [...sizes].sort((a, b) => a.size_ml - b.size_ml);
  const update = (sizeMl: number, patch: Partial<SizeDraft>) =>
    onChange(sizes.map((size) => (size.size_ml === sizeMl ? { ...size, ...patch } : size)));

  const addSize = () => {
    const free = STANDARD_SIZES_ML.find((size) => !sizes.some((entry) => entry.size_ml === size));
    let candidate = free ?? Math.max(...sizes.map((s) => s.size_ml), 0) + 10;
    while (sizes.some((size) => size.size_ml === candidate)) candidate += 5;
    onChange([...sizes, { size_ml: candidate, price: "", is_active: true }]);
  };

  return (
    <div className="space-y-4">
      {sorted.map((size) => {
        const reading = readSize(picks, byId, size.size_ml);
        const price = Number.parseFloat(size.price);
        const saving =
          reading.worth !== null && !Number.isNaN(price) ? reading.worth - price : null;

        return (
          <div key={size.size_ml} className="border border-line bg-paper p-4">
            <div className="grid gap-4 sm:grid-cols-[7rem_1fr_auto] sm:items-end">
              <Field label="Size">
                <Input
                  type="number"
                  min={1}
                  max={10000}
                  value={size.size_ml}
                  aria-label="Bottle size in millilitres"
                  onChange={(event) => {
                    const next = Number(event.target.value) || size.size_ml;
                    if (next !== size.size_ml && sizes.some((e) => e.size_ml === next)) return;
                    update(size.size_ml, { size_ml: next });
                  }}
                />
              </Field>

              <Field
                label={`Price for the whole combo at ${size.size_ml}ml`}
                hint={
                  reading.worth === null
                    ? "Typed in by hand — nothing derives it."
                    : `Bought one by one these come to ${money(reading.worth)}.`
                }
              >
                <Input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={size.price}
                  onChange={(event) => update(size.size_ml, { price: event.target.value })}
                />
              </Field>

              <div className="flex items-center gap-4 pb-2">
                <Toggle
                  label="On sale"
                  checked={size.is_active}
                  onChange={(next) => update(size.size_ml, { is_active: next })}
                />
                <button
                  type="button"
                  onClick={() => onChange(sizes.filter((e) => e.size_ml !== size.size_ml))}
                  className="label text-accent hover:underline"
                >
                  Remove
                </button>
              </div>
            </div>

            <SizeReadout picks={picks} reading={reading} saving={saving} />
          </div>
        );
      })}

      <button
        type="button"
        onClick={addSize}
        className="label inline-flex min-h-11 items-center gap-2 border border-line px-4 py-2.5 text-ink hover:bg-paper-2"
      >
        <IconPlus />
        Add another size
      </button>
      <p className="text-xs text-muted">
        Every perfume in the combo ships at the size on its row. A combo carries no stock of its
        own — what can be sold is worked out from the bottles it is made of.
      </p>
    </div>
  );
}

/**
 * The line under a size that says whether it can actually be sold.
 *
 * This is the whole point of building a combo in one screen rather than two:
 * the operator finds out that Hawas Ice has no 6ml bottle while they are still
 * choosing, not after a customer fails to check out.
 */
function SizeReadout({
  picks,
  reading,
  saving,
}: {
  picks: string[];
  reading: SizeReading;
  saving: number | null;
}) {
  if (!picks.length) return null;

  return (
    <div className="mt-4 border-t border-line pt-3">
      {reading.blockers.length ? (
        <div className="space-y-1">
          <p className="label flex items-center gap-2 text-accent">
            <IconAlert />
            Cannot be made up at this size
          </p>
          <ul className="text-xs text-muted">
            {reading.blockers.map((line) => (
              <li key={line}>· {line}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="label flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
          <span className="flex items-center gap-2 text-[var(--color-green)]">
            <IconCheck />
            {reading.sets} {reading.sets === 1 ? "combo" : "combos"} can be made from stock
          </span>
          {saving !== null && saving > 0 ? (
            <span>· saves the customer {money(saving)}</span>
          ) : null}
          {saving !== null && saving < 0 ? (
            <span className="text-accent">
              · priced {money(Math.abs(saving))} above buying them separately
            </span>
          ) : null}
        </p>
      )}
    </div>
  );
}

export function ProblemList({ problems }: { problems: string[] }) {
  if (!problems.length) return null;
  return (
    <Panel title="Not ready to save">
      <ul className="space-y-1 text-sm text-muted">
        {problems.map((line) => (
          <li key={line} className="flex gap-2">
            <IconAlert className="mt-0.5 shrink-0 text-accent" />
            {line}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
