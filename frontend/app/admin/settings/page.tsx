"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { IconSave, IconSpinner, IconTrash } from "@/components/admin/icons";
import { Require } from "@/components/admin/require";
import { useToast } from "@/components/admin/toast";
import {
  Button,
  ErrorNote,
  Field,
  Input,
  PageHeader,
  Panel,
  Spinner,
  Toggle,
} from "@/components/admin/ui";
import { ApiError, adminApi, mediaUrl } from "@/lib/admin/client";
import { useAuth } from "@/lib/auth";
import type { AdvanceMode, ShopSettings, ShopSettingsInput } from "@/lib/admin/types";
import { useResource } from "@/lib/admin/use-resource";

const ADVANCE_MODES: { value: AdvanceMode; label: string; hint: string }[] = [
  { value: "none", label: "No advance", hint: "The whole total is collected on delivery." },
  { value: "delivery", label: "The delivery charge", hint: "A refused parcel costs you nothing." },
  { value: "flat", label: "A flat amount", hint: "The same figure whatever the basket comes to." },
];

export default function SettingsPage() {
  return (
    <Require menu="settings">
      <SettingsScreen />
    </Require>
  );
}

function SettingsScreen() {
  // The GET is public, so it needs no token — but it still goes through
  // useResource so this page reloads and reports errors like every other one.
  const load = useCallback((_token: string) => adminApi.settings(), []);
  const { data, error, loading, reload } = useResource(load, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="What the shop is called, what it charges to deliver, and what it takes up front."
      />

      {error ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : loading || !data ? (
        <Spinner label="Loading settings" />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2 xl:items-start">
          <div className="space-y-3">
            <IdentityPanel settings={data} onSaved={reload} />
            <BrandingPanel settings={data} onSaved={reload} />
          </div>
          <div className="space-y-3">
            <CurrencyPanel settings={data} onSaved={reload} />
            <DeliveryPanel settings={data} onSaved={reload} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One save button per card rather than one for the page.
 *
 * The panels are independent — changing the currency has nothing to do with
 * the delivery charge — and a single Save would make every card look dirty the
 * moment one field was touched.
 */
function useSave(onSaved: () => void) {
  const { token } = useAuth();
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);

  const save = useCallback(
    async (input: ShopSettingsInput, message: string) => {
      if (!token) return;
      setBusy(true);
      try {
        await adminApi.updateSettings(token, input);
        notify(message);
        onSaved();
      } catch (caught) {
        notify(
          caught instanceof ApiError ? caught.message : "Could not save. Try again.",
          "error",
        );
      } finally {
        setBusy(false);
      }
    },
    [token, notify, onSaved],
  );

  return { save, busy };
}

function SaveButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <Button onClick={onClick} disabled={busy}>
      {busy ? <IconSpinner className="animate-spin" /> : <IconSave />}
      {busy ? "Saving…" : "Save"}
    </Button>
  );
}

/* ------------------------------------------------------------------ identity */

function IdentityPanel({ settings, onSaved }: { settings: ShopSettings; onSaved: () => void }) {
  const { save, busy } = useSave(onSaved);
  const [title, setTitle] = useState(settings.site_title);
  const [tagline, setTagline] = useState(settings.tagline ?? "");

  // Re-sync after a save: the reload hands down what the server actually
  // stored, which is not always the string that was typed.
  useEffect(() => {
    setTitle(settings.site_title);
    setTagline(settings.tagline ?? "");
  }, [settings]);

  return (
    <Panel
      title="Shop identity"
      actions={
        <SaveButton
          busy={busy}
          onClick={() =>
            save(
              { site_title: title.trim(), tagline: tagline.trim() || null },
              "Shop identity saved",
            )
          }
        />
      }
    >
      <div className="space-y-4">
        <Field label="Title" hint="Shows in the browser tab and in search results.">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        </Field>
        <Field label="Tagline" hint="Optional. One line under the name.">
          <Input
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            maxLength={200}
            placeholder="Perfume decants and oils, poured to order"
          />
        </Field>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ branding */

function BrandingPanel({ settings, onSaved }: { settings: ShopSettings; onSaved: () => void }) {
  return (
    <Panel title="Logo & favicon">
      <div className="grid gap-5 sm:grid-cols-2">
        <BrandingSlot
          asset="logo"
          label="Logo"
          hint="Shown in the header. A wide image works best."
          url={settings.logo_url}
          onSaved={onSaved}
          preview="h-14 w-auto max-w-full"
        />
        <BrandingSlot
          asset="favicon"
          label="Favicon"
          hint="The little icon in the browser tab. Square, at least 64×64."
          url={settings.favicon_url}
          onSaved={onSaved}
          preview="size-14"
        />
      </div>
    </Panel>
  );
}

function BrandingSlot({
  asset,
  label,
  hint,
  url,
  onSaved,
  preview,
}: {
  asset: "logo" | "favicon";
  label: string;
  hint: string;
  url: string | null;
  onSaved: () => void;
  preview: string;
}) {
  const { token } = useAuth();
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function run(action: () => Promise<unknown>, message: string) {
    if (!token) return;
    setBusy(true);
    try {
      await action();
      notify(message);
      onSaved();
    } catch (caught) {
      notify(caught instanceof ApiError ? caught.message : "Upload failed.", "error");
    } finally {
      setBusy(false);
      // Clear the picker so choosing the same file twice still fires onChange.
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <p className="label text-muted">{label}</p>

      <div className="mt-3 flex min-h-20 items-center justify-center border border-line bg-paper-2 p-3">
        {url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={mediaUrl(url)} alt={`${label} preview`} className={`${preview} object-contain`} />
        ) : (
          <p className="label text-muted">Using the bundled artwork</p>
        )}
      </div>

      <p className="mt-2 text-xs leading-relaxed text-muted">{hint}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file && token) {
              void run(() => adminApi.uploadBranding(token, asset, file), `${label} updated`);
            }
          }}
        />
        <Button tone="ghost" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <IconSpinner className="animate-spin" /> : null}
          {url ? "Replace" : "Upload"}
        </Button>
        {url ? (
          <Button
            tone="danger"
            disabled={busy}
            onClick={() => {
              if (token) void run(() => adminApi.clearBranding(token, asset), `${label} removed`);
            }}
          >
            <IconTrash />
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ currency */

function CurrencyPanel({ settings, onSaved }: { settings: ShopSettings; onSaved: () => void }) {
  const { save, busy } = useSave(onSaved);
  const [code, setCode] = useState(settings.currency_code);
  const [symbol, setSymbol] = useState(settings.currency_symbol);

  // The API upper-cases the code, so echo back what it stored rather than
  // leaving the field showing the lowercase the operator typed.
  useEffect(() => {
    setCode(settings.currency_code);
    setSymbol(settings.currency_symbol);
  }, [settings]);

  return (
    <Panel
      title="Currency"
      actions={
        <SaveButton
          busy={busy}
          onClick={() =>
            save(
              { currency_code: code.trim().toUpperCase(), currency_symbol: symbol.trim() },
              "Currency saved",
            )
          }
        />
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Code" hint="Three letters, e.g. BDT. Recorded on every order.">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={3}
            className="uppercase"
          />
        </Field>
        <Field label="Symbol" hint="What prices are printed with.">
          <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} maxLength={8} />
        </Field>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted">
        Changing this does not convert existing prices — it relabels them. Orders already placed
        keep the currency they were taken in.
      </p>
    </Panel>
  );
}

/* --------------------------------------------------------- delivery & advance */

function DeliveryPanel({ settings, onSaved }: { settings: ShopSettings; onSaved: () => void }) {
  const { save, busy } = useSave(onSaved);
  const [charge, setCharge] = useState(settings.delivery_charge);
  const [freeOver, setFreeOver] = useState(settings.free_delivery_threshold ?? "");
  const [neverFree, setNeverFree] = useState(settings.free_delivery_threshold === null);
  const [mode, setMode] = useState<AdvanceMode>(settings.advance_mode);
  const [amount, setAmount] = useState(settings.advance_amount);

  // Re-sync after a save: the server may have normalised what was sent.
  useEffect(() => {
    setCharge(settings.delivery_charge);
    setFreeOver(settings.free_delivery_threshold ?? "");
    setNeverFree(settings.free_delivery_threshold === null);
    setMode(settings.advance_mode);
    setAmount(settings.advance_amount);
  }, [settings]);

  function submit() {
    const input: ShopSettingsInput = {
      delivery_charge: charge,
      advance_mode: mode,
      // Only meaningful for the flat mode; sending it otherwise would let a
      // stale number sit in the column and reappear if the mode is switched back.
      advance_amount: mode === "flat" ? amount : "0",
    };
    if (neverFree) {
      input.clear_free_delivery_threshold = true;
    } else if (freeOver.trim()) {
      input.free_delivery_threshold = freeOver.trim();
    }
    void save(input, "Delivery and payment saved");
  }

  return (
    <Panel title="Delivery & payment" actions={<SaveButton busy={busy} onClick={submit} />}>
      <div className="space-y-4">
        <Field label={`Delivery charge (${settings.currency_symbol})`} hint="Charged per order.">
          <Input
            value={charge}
            onChange={(e) => setCharge(e.target.value)}
            inputMode="decimal"
            type="number"
            min="0"
            step="0.01"
          />
        </Field>

        <Toggle
          checked={neverFree}
          onChange={setNeverFree}
          label="Never deliver free"
          hint="Charge for delivery on every order, however large."
        />

        {!neverFree ? (
          <Field
            label={`Free delivery over (${settings.currency_symbol})`}
            hint="Must be above the delivery charge, or almost everything ships free."
          >
            <Input
              value={freeOver}
              onChange={(e) => setFreeOver(e.target.value)}
              inputMode="decimal"
              type="number"
              min="0"
              step="0.01"
              placeholder="3000"
            />
          </Field>
        ) : null}

        <div className="border-t border-line pt-4">
          <p className="label text-muted">Advance payment</p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            What a customer must send before the order is confirmed. The rest is collected on
            delivery.
          </p>

          <div className="mt-3 space-y-2">
            {ADVANCE_MODES.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-3 border p-3 transition-colors ${
                  mode === option.value ? "border-ink bg-paper-2" : "border-line hover:border-ink"
                }`}
              >
                <input
                  type="radio"
                  name="advance-mode"
                  className="mt-1 accent-[#16140f]"
                  checked={mode === option.value}
                  onChange={() => setMode(option.value)}
                />
                <span>
                  <span className="label block">{option.label}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted">
                    {option.hint}
                  </span>
                </span>
              </label>
            ))}
          </div>

          {mode === "flat" ? (
            <Field
              className="mt-4"
              label={`Advance amount (${settings.currency_symbol})`}
              hint="Capped at the order total, so a small basket is never asked to overpay."
            >
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                type="number"
                min="0"
                step="0.01"
              />
            </Field>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
