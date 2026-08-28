"use client";

import { Dropdown } from "@/components/admin/dropdown";
import {
  Field,
  Input,
  Textarea,
  Toggle,
} from "@/components/admin/ui";
import type { Category } from "@/lib/admin/types";

export interface ProductDetails {
  name: string;
  slug: string;
  brand: string;
  short_description: string;
  description: string;
  category_id: string;
  is_active: boolean;
  is_featured: boolean;
}

export const EMPTY_DETAILS: ProductDetails = {
  name: "",
  slug: "",
  brand: "",
  short_description: "",
  description: "",
  category_id: "",
  is_active: true,
  is_featured: false,
};

/** Trims the strings and turns blanks into nulls the API will accept. */
export function detailsPayload(details: ProductDetails) {
  const blankToNull = (value: string) => (value.trim() ? value.trim() : null);
  return {
    name: details.name.trim(),
    short_description: blankToNull(details.short_description),
    description: blankToNull(details.description),
    brand: blankToNull(details.brand),
    category_id: details.category_id || null,
    is_active: details.is_active,
    is_featured: details.is_featured,
  };
}

export function ProductFields({
  value,
  onChange,
  categories,
  showSlug = true,
}: {
  value: ProductDetails;
  onChange: (next: ProductDetails) => void;
  categories: Category[];
  showSlug?: boolean;
}) {
  const set = <K extends keyof ProductDetails>(key: K, next: ProductDetails[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Name">
          <Input
            required
            maxLength={200}
            value={value.name}
            onChange={(event) => set("name", event.target.value)}
          />
        </Field>
        <Field label="Brand">
          <Input
            maxLength={120}
            value={value.brand}
            onChange={(event) => set("brand", event.target.value)}
          />
        </Field>
      </div>

      {showSlug ? (
        <Field label="Slug" hint="Leave blank and one is generated from the name.">
          <Input
            maxLength={220}
            placeholder="amber-woods-decant"
            value={value.slug}
            onChange={(event) => set("slug", event.target.value)}
          />
        </Field>
      ) : null}

      <Field label="Category">
        <Dropdown
          value={value.category_id}
          aria-label="Category"
          searchable
          searchPlaceholder="Search categories…"
          onChange={(next) => set("category_id", next)}
          options={[
            { value: "", label: "No category" },
            ...categories.map((category) => ({
              value: category.id,
              label: category.name,
              hint: category.is_active ? undefined : "Hidden from the storefront",
            })),
          ]}
        />
      </Field>

      <Field label="Short description" hint="One line, shown on the product card.">
        <Input
          maxLength={300}
          value={value.short_description}
          onChange={(event) => set("short_description", event.target.value)}
        />
      </Field>

      <Field label="Description">
        <Textarea
          rows={5}
          value={value.description}
          onChange={(event) => set("description", event.target.value)}
        />
      </Field>

      <div className="flex flex-wrap gap-8 border-t border-line pt-5">
        <Toggle
          label="Live on the storefront"
          hint="Turn off to hide it without deleting."
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
