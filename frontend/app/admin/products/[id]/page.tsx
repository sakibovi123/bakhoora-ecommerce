"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  ProductFields,
  detailsPayload,
  type ProductDetails,
} from "@/components/admin/product-fields";
import { useConfirm } from "@/components/admin/dialog";
import { useToast } from "@/components/admin/toast";
import {
  Button,
  Cell,
  ErrorNote,
  Field,
  Input,
  PageHeader,
  Panel,
  Pill,
  Row,
  Spinner,
  Table,
  Toggle,
} from "@/components/admin/ui";
import { isStandard } from "@/components/admin/variant-editor";
import { ImageManager } from "@/components/admin/image-manager";
import { Require } from "@/components/admin/require";
import {
  IconChevronLeft,
  IconPlus,
  IconSave,
  IconSpinner,
  IconTrash,
} from "@/components/admin/icons";
import { ApiError, adminApi } from "@/lib/admin/client";
import { money } from "@/lib/admin/format";
import { useAuth } from "@/lib/auth";
import { STANDARD_SIZES_ML, type Product, type Variant } from "@/lib/admin/types";
import { useResource } from "@/lib/admin/use-resource";

interface VariantDraft {
  price: string;
  stock_quantity: string;
  sku: string;
  is_active: boolean;
}

const draftOf = (variant: Variant): VariantDraft => ({
  price: variant.price,
  stock_quantity: String(variant.stock_quantity),
  sku: variant.sku,
  is_active: variant.is_active,
});

export default function EditProductPage() {
  return (
    <Require menu="products">
      <EditProductScreen />
    </Require>
  );
}

function EditProductScreen() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { token } = useAuth();
  const { notify } = useToast();
  const confirm = useConfirm();

  const loadProduct = useCallback((auth: string) => adminApi.product(auth, id), [id]);
  const { data: product, error, loading, reload } = useResource(loadProduct, [id]);

  const loadCategories = useCallback((auth: string) => adminApi.categories(auth), []);
  const { data: categories } = useResource(loadCategories, []);

  const [details, setDetails] = useState<ProductDetails | null>(null);
  const [drafts, setDrafts] = useState<Record<string, VariantDraft>>({});
  const [saving, setSaving] = useState(false);

  // Which product the form currently holds. Adding a size, removing one or
  // uploading an image all reload the product, and seeding the form on every
  // fresh copy would throw away edits the operator has not saved yet — leaving
  // the fields reset and "Save changes" greyed out because nothing looks dirty.
  const seededFor = useRef<string | null>(null);

  useEffect(() => {
    if (!product) return;

    if (seededFor.current !== product.id) {
      seededFor.current = product.id;
      setDetails({
        name: product.name,
        slug: product.slug,
        brand: product.brand ?? "",
        short_description: product.short_description ?? "",
        description: product.description ?? "",
        category_id: product.category_id ?? "",
        is_active: product.is_active,
        is_featured: product.is_featured,
      });
      setDrafts(Object.fromEntries(product.variants.map((v) => [v.id, draftOf(v)])));
      return;
    }

    // Same product, refreshed underneath us: keep what has been typed and only
    // reconcile which sizes exist.
    setDrafts((current) =>
      Object.fromEntries(product.variants.map((v) => [v.id, current[v.id] ?? draftOf(v)])),
    );
  }, [product]);

  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if ((loading && !product) || !product || !details) return <Spinner label="Loading product" />;

  const changedVariants = product.variants.filter((variant) => {
    const draft = drafts[variant.id];
    if (!draft) return false;
    return (
      draft.price !== variant.price ||
      Number(draft.stock_quantity) !== variant.stock_quantity ||
      draft.sku !== variant.sku ||
      draft.is_active !== variant.is_active
    );
  });

  const detailsChanged =
    details.name !== product.name ||
    details.slug !== product.slug ||
    details.brand !== (product.brand ?? "") ||
    details.short_description !== (product.short_description ?? "") ||
    details.description !== (product.description ?? "") ||
    details.category_id !== (product.category_id ?? "") ||
    details.is_active !== product.is_active ||
    details.is_featured !== product.is_featured;

  const dirty = detailsChanged || changedVariants.length > 0;

  const saveAll = async () => {
    if (!token || !details) return;
    setSaving(true);
    try {
      if (detailsChanged) {
        await adminApi.updateProduct(token, product.id, {
          ...detailsPayload(details),
          ...(details.slug.trim() && details.slug !== product.slug
            ? { slug: details.slug.trim() }
            : {}),
        });
      }
      for (const variant of changedVariants) {
        const draft = drafts[variant.id];
        await adminApi.updateVariant(token, variant.id, {
          price: Number.parseFloat(draft.price).toFixed(2),
          stock_quantity: Math.max(0, Number(draft.stock_quantity) || 0),
          is_active: draft.is_active,
          ...(draft.sku !== variant.sku ? { sku: draft.sku.trim() } : {}),
        });
      }
      notify("Saved");
      // What was just written is the new baseline.
      seededFor.current = null;
      reload();
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : "Could not save", "error");
    } finally {
      setSaving(false);
    }
  };

  const removeProduct = async () => {
    if (!token) return;
    const sure = await confirm({
      title: `Delete ${product.name}?`,
      body: "This removes the product, every size and its uploaded images. Past orders keep their own copy of the details, so order history is not affected.",
      confirmLabel: "Delete product",
      tone: "danger",
    });
    if (!sure) return;
    try {
      await adminApi.deleteProduct(token, product.id);
      notify(`${product.name} deleted`);
      router.push("/admin/products");
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : "Could not delete", "error");
    }
  };

  return (
    <div className="space-y-6 pb-4">
      <PageHeader
        title={product.name}
        subtitle={
          <>
            <span className="font-mono text-xs">/{product.slug}</span> ·{" "}
            {money(product.price_from)} – {money(product.price_to)}
          </>
        }
        actions={
          <>
            {product.is_active ? (
              <Pill tone="bg-[var(--color-green-deep)] text-paper">Live</Pill>
            ) : (
              <Pill tone="bg-paper-2 text-muted">Hidden</Pill>
            )}
            <Link
              href="/admin/products"
              className="label ml-2 inline-flex items-center gap-1.5 text-muted hover:text-ink"
            >
              <IconChevronLeft />
              Products
            </Link>
          </>
        }
      />

      <Panel title="Details">
        <ProductFields value={details} onChange={setDetails} categories={categories ?? []} />
      </Panel>

      <Panel title="Sizes and prices" bodyClassName="p-0">
        <Table head={["Size", "Price", "Stock", "SKU", "On sale", ""]}>
          {product.variants.map((variant) => {
            const draft = drafts[variant.id] ?? draftOf(variant);
            const locked = isStandard(variant.size_ml);
            const set = (patch: Partial<VariantDraft>) =>
              setDrafts((current) => ({
                ...current,
                [variant.id]: { ...current[variant.id], ...patch },
              }));

            return (
              <Row key={variant.id}>
                <Cell className="whitespace-nowrap font-medium text-ink">
                  {variant.name}
                  {locked ? null : <span className="ml-2 text-xs text-muted">extra</span>}
                </Cell>
                <Cell className="md:w-32">
                  <Input
                    inputMode="decimal"
                    value={draft.price}
                    onChange={(event) => set({ price: event.target.value })}
                    aria-label={`Price for ${variant.name}`}
                  />
                </Cell>
                <Cell className="md:w-28">
                  <Input
                    type="number"
                    min={0}
                    value={draft.stock_quantity}
                    onChange={(event) => set({ stock_quantity: event.target.value })}
                    aria-label={`Stock for ${variant.name}`}
                  />
                </Cell>
                <Cell className="md:w-44">
                  <Input
                    value={draft.sku}
                    maxLength={64}
                    onChange={(event) => set({ sku: event.target.value })}
                    aria-label={`SKU for ${variant.name}`}
                  />
                </Cell>
                <Cell>
                  <Toggle
                    label=""
                    checked={draft.is_active}
                    onChange={(next) => set({ is_active: next })}
                  />
                </Cell>
                <Cell className="text-right">
                  <DeleteVariant
                    variant={variant}
                    locked={locked}
                    onDone={reload}
                  />
                </Cell>
              </Row>
            );
          })}
        </Table>
        <div className="border-t border-line p-4">
          <AddSize product={product} onDone={reload} />
        </div>
      </Panel>

      <Panel tone="amber" title="Images" bodyClassName="p-0">
        <ImageManager product={product} onDone={reload} />
      </Panel>

      <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-paper/95 py-4 backdrop-blur">
        <Button tone="danger" onClick={removeProduct}>
          <IconTrash />
          Delete product
        </Button>
        <div className="flex items-center gap-3">
          {dirty ? <span className="text-xs text-muted">Unsaved changes</span> : null}
          <Button onClick={saveAll} disabled={!dirty || saving}>
            {saving ? <IconSpinner /> : <IconSave />}
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DeleteVariant({
  variant,
  locked,
  onDone,
}: {
  variant: Variant;
  locked: boolean;
  onDone: () => void;
}) {
  const { token } = useAuth();
  const { notify } = useToast();
  const confirm = useConfirm();

  if (locked) {
    return (
      <span
        className="label text-muted/60"
        title={`${STANDARD_SIZES_ML.join("ml, ")}ml are standard on every product. Switch it off instead.`}
      >
        Standard
      </span>
    );
  }

  return (
    <button
      type="button"
      className="label inline-flex items-center gap-1.5 text-accent hover:underline"
      onClick={async () => {
        if (!token) return;
        const sure = await confirm({
          title: `Remove the ${variant.name} size?`,
          body: "It stops being buyable straight away. Past orders are unaffected.",
          confirmLabel: "Remove size",
          tone: "danger",
        });
        if (!sure) return;
        try {
          await adminApi.deleteVariant(token, variant.id);
          notify(`${variant.name} removed`);
          onDone();
        } catch (cause) {
          notify(cause instanceof ApiError ? cause.message : "Could not remove", "error");
        }
      }}
    >
      <IconTrash />
      Remove
    </button>
  );
}

function AddSize({ product, onDone }: { product: Product; onDone: () => void }) {
  const { token } = useAuth();
  const { notify } = useToast();
  const [size, setSize] = useState("50");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("0");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!token) return;
    const sizeMl = Number(size);
    const value = Number.parseFloat(price);
    if (!sizeMl || Number.isNaN(value) || value <= 0) {
      notify("A new size needs a size in ml and a price above zero", "error");
      return;
    }
    setBusy(true);
    try {
      await adminApi.addVariant(token, product.id, {
        size_ml: sizeMl,
        price: value.toFixed(2),
        stock_quantity: Math.max(0, Number(stock) || 0),
      });
      notify(`${sizeMl}ml added`);
      setPrice("");
      onDone();
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : "Could not add the size", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap">
      <Field label="Add a size (ml)" className="sm:w-32">
        <Input type="number" min={1} value={size} onChange={(e) => setSize(e.target.value)} />
      </Field>
      <Field label="Price" className="sm:w-36">
        <Input inputMode="decimal" placeholder="0.00" value={price} onChange={(e) => setPrice(e.target.value)} />
      </Field>
      <Field label="Stock" className="sm:w-28">
        <Input type="number" min={0} value={stock} onChange={(e) => setStock(e.target.value)} />
      </Field>
      <Button tone="ghost" onClick={add} disabled={busy} className="col-span-2 sm:col-auto">
        {busy ? <IconSpinner /> : <IconPlus />}
        {busy ? "Adding…" : "Add size"}
      </Button>
    </div>
  );
}
