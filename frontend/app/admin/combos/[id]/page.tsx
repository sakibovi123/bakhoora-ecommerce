"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import {
  ComboContents,
  ComboFields,
  ComboSizes,
  ProblemList,
  comboPayload,
  comboProblems,
  type ComboDetails,
  type SizeDraft,
} from "@/components/admin/combo-builder";
import { useConfirm } from "@/components/admin/dialog";
import { useToast } from "@/components/admin/toast";
import {
  Button,
  ErrorNote,
  PageHeader,
  Panel,
  Pill,
  Spinner,
} from "@/components/admin/ui";
import { Require } from "@/components/admin/require";
import {
  IconChevronLeft,
  IconImage,
  IconSave,
  IconSpinner,
  IconTrash,
} from "@/components/admin/icons";
import { ApiError, adminApi, mediaUrl } from "@/lib/admin/client";
import { money } from "@/lib/admin/format";
import { ACCEPTED_IMAGE_TYPES, type Combo } from "@/lib/admin/types";
import { useAuth } from "@/lib/auth";
import { useCatalogue } from "@/lib/admin/use-catalogue";
import { useResource } from "@/lib/admin/use-resource";

export default function ComboPage() {
  return (
    <Require menu="combos">
      <ComboScreen />
    </Require>
  );
}

/** The saved combo, unpacked into the shapes the builder edits. */
function draftsFrom(combo: Combo): { details: ComboDetails; picks: string[]; sizes: SizeDraft[] } {
  return {
    details: {
      name: combo.name,
      slug: combo.slug,
      tagline: combo.tagline ?? "",
      use_case: combo.use_case ?? "",
      occasion: combo.occasion ?? "",
      description: combo.description ?? "",
      is_active: combo.is_active,
      is_featured: combo.is_featured,
    },
    picks: combo.products.map((entry) => entry.product_id),
    sizes: combo.sizes.map((size) => ({
      size_ml: size.size_ml,
      price: size.price,
      is_active: size.is_active,
    })),
  };
}

function ComboScreen() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { token, can } = useAuth();
  const { notify } = useToast();
  const confirm = useConfirm();

  const load = useCallback((auth: string) => adminApi.combo(auth, id), [id]);
  const { data: combo, error, loading, reload } = useResource(load, [id]);
  const { data: products, loading: loadingCatalogue } = useCatalogue();

  const editable = can("combos", "manage");

  const [details, setDetails] = useState<ComboDetails | null>(null);
  const [picks, setPicks] = useState<string[]>([]);
  const [sizes, setSizes] = useState<SizeDraft[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reload replaces the drafts. Anything half-typed at that moment is lost, so
  // the only reloads here are ones that follow a successful save.
  useEffect(() => {
    if (!combo) return;
    const drafts = draftsFrom(combo);
    setDetails(drafts.details);
    setPicks(drafts.picks);
    setSizes(drafts.sizes);
  }, [combo]);

  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!combo || !details) return <Spinner label="Loading the combo" />;

  const problems = comboProblems(details, picks, sizes);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token || !details || problems.length) return;
    setSaving(true);
    setFailure(null);
    try {
      await adminApi.updateCombo(token, id, {
        ...comboPayload(details, picks, sizes),
        ...(details.slug.trim() ? { slug: details.slug.trim() } : {}),
      });
      notify("Combo saved");
      reload();
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : "Could not save the combo");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!token) return;
    const sure = await confirm({
      title: `Delete ${combo!.name}?`,
      body:
        "The perfumes in it are untouched, and orders that already went out keep their " +
        "lines and their money. Park the combo instead if the campaign might come back.",
      confirmLabel: "Delete combo",
      tone: "danger",
    });
    if (!sure) return;
    try {
      await adminApi.deleteCombo(token, id);
      notify(`${combo!.name} deleted`);
      router.push("/admin/combos");
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : "Could not delete", "error");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <PageHeader
        title={combo.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-xs">{combo.slug}</span>
            {combo.is_available ? (
              <Pill tone="bg-[var(--color-green-soft)] text-ink">On sale</Pill>
            ) : (
              <Pill tone="bg-paper-2 text-muted">Cannot be sold right now</Pill>
            )}
          </span>
        }
        actions={
          <Link
            href="/admin/combos"
            className="label inline-flex items-center gap-1.5 text-muted hover:text-ink"
          >
            <IconChevronLeft />
            Combos
          </Link>
        }
      />

      {failure ? <ErrorNote message={failure} /> : null}

      <SavedOptions combo={combo} />

      <fieldset disabled={!editable} className="space-y-6">
        <Panel tone="amber" title="Campaign">
          <ComboFields value={details} onChange={setDetails} />
        </Panel>

        <Panel tone="amber" title={`What is in it${picks.length ? ` · ${picks.length}` : ""}`}>
          <ComboContents
            picks={picks}
            onChange={setPicks}
            products={products ?? []}
            loading={loadingCatalogue && !products}
          />
        </Panel>

        <Panel tone="amber" title="Sizes and prices">
          <ComboSizes sizes={sizes} onChange={setSizes} picks={picks} products={products ?? []} />
        </Panel>
      </fieldset>

      <ComboImage combo={combo} editable={editable} onDone={reload} />

      <ProblemList problems={problems} />

      {editable ? (
        <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-paper/95 py-4 backdrop-blur">
          <button
            type="button"
            onClick={remove}
            className="label inline-flex items-center gap-1.5 text-accent hover:underline"
          >
            <IconTrash />
            Delete combo
          </button>
          <Button type="submit" disabled={saving || loading || problems.length > 0}>
            {saving ? <IconSpinner /> : <IconSave />}
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      ) : null}
    </form>
  );
}

/**
 * What the API says about the combo as it is saved right now.
 *
 * The size rows above answer the same question live as the operator edits, but
 * off the browser's copy of the catalogue. This is the server's own reading of
 * the saved combo, and it is where the SKUs live — the codes that end up on an
 * invoice, which nothing in the form can change.
 */
function SavedOptions({ combo }: { combo: Combo }) {
  if (!combo.sizes.length) return null;

  return (
    <Panel title="As saved">
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {combo.sizes.map((size) => (
          <li key={size.id} className="border border-line p-3">
            <p className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm text-ink">{size.label}</span>
              <span className="text-sm text-ink">{money(size.price)}</span>
            </p>
            <p className="mt-1 font-mono text-[0.6875rem] text-muted">{size.sku}</p>
            <p className="label mt-2 text-muted">
              {size.is_available
                ? `${size.max_sets} can be made up`
                : size.is_active
                  ? "Out of stock"
                  : "Switched off"}
            </p>
            {size.components_total ? (
              <p className="mt-1 text-xs text-muted">
                Separately {money(size.components_total)}
                {size.savings && Number.parseFloat(size.savings) > 0
                  ? ` · saves ${money(size.savings)}`
                  : ""}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function ComboImage({
  combo,
  editable,
  onDone,
}: {
  combo: Combo;
  editable: boolean;
  onDone: () => void;
}) {
  const { token } = useAuth();
  const { notify } = useToast();
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (!token) return;
    setBusy(true);
    try {
      await adminApi.uploadComboImage(token, combo.id, file);
      notify("Picture updated");
      onDone();
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : "Could not upload", "error");
    } finally {
      setBusy(false);
      if (picker.current) picker.current.value = "";
    }
  }

  return (
    <Panel title="Picture" bodyClassName="p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-5">
        <div className="grid size-28 shrink-0 place-items-center border border-line bg-paper-2">
          {combo.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mediaUrl(combo.image_url)}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <IconImage className="size-6 text-muted/60" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm text-muted">
            One group shot for the whole combo. Without one the storefront falls back to the
            first perfume&rsquo;s own picture.
          </p>
          {editable ? (
            <>
              <input
                ref={picker}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) upload(file);
                }}
              />
              <Button
                tone="ghost"
                disabled={busy}
                onClick={() => picker.current?.click()}
              >
                {busy ? <IconSpinner /> : <IconImage />}
                {busy ? "Uploading…" : combo.image_url ? "Replace picture" : "Upload a picture"}
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
