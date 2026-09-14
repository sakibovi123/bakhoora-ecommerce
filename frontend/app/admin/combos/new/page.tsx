"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import {
  ComboContents,
  ComboFields,
  ComboSizes,
  EMPTY_COMBO,
  ProblemList,
  comboPayload,
  comboProblems,
  startingSizes,
  type ComboDetails,
  type SizeDraft,
} from "@/components/admin/combo-builder";
import { useToast } from "@/components/admin/toast";
import { Button, ErrorNote, PageHeader, Panel } from "@/components/admin/ui";
import { Require } from "@/components/admin/require";
import { IconChevronLeft, IconPlus, IconSpinner } from "@/components/admin/icons";
import { ApiError, adminApi } from "@/lib/admin/client";
import { useAuth } from "@/lib/auth";
import { useCatalogue } from "@/lib/admin/use-catalogue";

export default function NewComboPage() {
  return (
    <Require menu="combos" action="manage">
      <NewComboScreen />
    </Require>
  );
}

function NewComboScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const { notify } = useToast();
  const { data: products, loading } = useCatalogue();

  const [details, setDetails] = useState<ComboDetails>(EMPTY_COMBO);
  const [picks, setPicks] = useState<string[]>([]);
  const [sizes, setSizes] = useState<SizeDraft[]>(startingSizes);
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const problems = comboProblems(details, picks, sizes);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token || problems.length) return;
    setSaving(true);
    setFailure(null);
    try {
      const combo = await adminApi.createCombo(token, {
        ...comboPayload(details, picks, sizes),
        ...(details.slug.trim() ? { slug: details.slug.trim() } : {}),
      });
      notify(`${combo.name} created`);
      router.push(`/admin/combos/${combo.id}`);
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : "Could not create the combo");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <PageHeader
        title="New combo"
        subtitle="Pick the perfumes, then price the whole bundle at each size you want to sell it in."
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

      <Panel tone="amber" title="Campaign">
        <ComboFields value={details} onChange={setDetails} />
      </Panel>

      <Panel tone="amber" title={`What is in it${picks.length ? ` · ${picks.length}` : ""}`}>
        <ComboContents
          picks={picks}
          onChange={setPicks}
          products={products ?? []}
          loading={loading && !products}
        />
      </Panel>

      <Panel tone="amber" title="Sizes and prices">
        <ComboSizes
          sizes={sizes}
          onChange={setSizes}
          picks={picks}
          products={products ?? []}
        />
      </Panel>

      <ProblemList problems={problems} />

      <div className="sticky bottom-0 z-20 flex items-center justify-end gap-3 border-t border-line bg-paper/95 py-4 backdrop-blur">
        <Link href="/admin/combos" className="label px-4 py-2.5 text-muted hover:text-ink">
          Cancel
        </Link>
        <Button type="submit" disabled={saving || problems.length > 0}>
          {saving ? <IconSpinner /> : <IconPlus />}
          {saving ? "Creating…" : "Create combo"}
        </Button>
      </div>
    </form>
  );
}
