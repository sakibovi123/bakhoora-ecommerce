"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, type FormEvent } from "react";

import {
  EMPTY_DETAILS,
  ProductFields,
  detailsPayload,
  type ProductDetails,
} from "@/components/admin/product-fields";
import { useToast } from "@/components/admin/toast";
import { Button, ErrorNote, PageHeader, Panel } from "@/components/admin/ui";
import { VariantEditor, standardDrafts, type VariantDraft } from "@/components/admin/variant-editor";
import { Require } from "@/components/admin/require";
import { IconChevronLeft, IconPlus, IconSpinner } from "@/components/admin/icons";
import { ApiError, adminApi } from "@/lib/admin/client";
import { useAuth } from "@/lib/auth";
import { useResource } from "@/lib/admin/use-resource";

export default function NewProductPage() {
  return (
    <Require menu="products" action="manage">
      <NewProductScreen />
    </Require>
  );
}

function NewProductScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const { notify } = useToast();

  const loadCategories = useCallback((auth: string) => adminApi.categories(auth), []);
  const { data: categories } = useResource(loadCategories, []);

  const [details, setDetails] = useState<ProductDetails>(EMPTY_DETAILS);
  const [drafts, setDrafts] = useState<VariantDraft[]>(standardDrafts);
  const [priceErrors, setPriceErrors] = useState<Record<number, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    // Catch the empty-price case here so the operator sees it beside the field
    // rather than as a validation blob from the API.
    const errors: Record<number, string> = {};
    for (const draft of drafts) {
      const price = Number.parseFloat(draft.price);
      if (!draft.price.trim() || Number.isNaN(price) || price <= 0) {
        errors[draft.size_ml] = "Needs a price above zero";
      }
    }
    setPriceErrors(errors);
    if (Object.keys(errors).length) return;

    if (!token) return;
    setSaving(true);
    setFailure(null);
    try {
      const product = await adminApi.createProduct(token, {
        ...detailsPayload(details),
        ...(details.slug.trim() ? { slug: details.slug.trim() } : {}),
        variants: drafts.map((draft) => ({
          size_ml: draft.size_ml,
          price: Number.parseFloat(draft.price).toFixed(2),
          stock_quantity: Math.max(0, Number(draft.stock_quantity) || 0),
          is_active: draft.is_active,
          ...(draft.sku.trim() ? { sku: draft.sku.trim() } : {}),
        })),
        images: [],
      });
      notify(`${product.name} created`);
      router.push(`/admin/products/${product.id}`);
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : "Could not create the product");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <PageHeader
        title="New product"
        subtitle="A perfume goes live with all four standard sizes priced."
        actions={
          <Link
            href="/admin/products"
            className="label inline-flex items-center gap-1.5 text-muted hover:text-ink"
          >
            <IconChevronLeft />
            Products
          </Link>
        }
      />

      {failure ? <ErrorNote message={failure} /> : null}

      <Panel title="Details">
        <ProductFields value={details} onChange={setDetails} categories={categories ?? []} />
      </Panel>

      <Panel title="Sizes and prices">
        <VariantEditor drafts={drafts} onChange={setDrafts} errors={priceErrors} />
      </Panel>

      <div className="sticky bottom-0 z-20 flex items-center justify-end gap-3 border-t border-line bg-paper/95 py-4 backdrop-blur">
        <Link href="/admin/products" className="label px-4 py-2.5 text-muted hover:text-ink">
          Cancel
        </Link>
        <Button type="submit" disabled={saving || !details.name.trim()}>
          {saving ? <IconSpinner /> : <IconPlus />}
          {saving ? "Creating…" : "Create product"}
        </Button>
      </div>
    </form>
  );
}
