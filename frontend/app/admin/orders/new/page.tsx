"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Dropdown } from "@/components/admin/dropdown";
import {
  IconChevronLeft,
  IconPlus,
  IconSearch,
  IconSpinner,
  IconTrash,
} from "@/components/admin/icons";
import { Require } from "@/components/admin/require";
import { useToast } from "@/components/admin/toast";
import {
  Button,
  Cell,
  ErrorNote,
  Field,
  Input,
  PageHeader,
  Panel,
  Row,
  SearchInput,
  Spinner,
  Table,
  Textarea,
} from "@/components/admin/ui";
import { ApiError, adminApi } from "@/lib/admin/client";
import { money, moneyExact, titleCase } from "@/lib/admin/format";
import { useAuth } from "@/lib/auth";
import type { Product } from "@/lib/admin/types";
import { useResource } from "@/lib/admin/use-resource";

interface Line {
  variant_id: string;
  product: string;
  size: string;
  sku: string;
  price: string;
  stock: number;
  quantity: number;
}

const EMPTY_ADDRESS = {
  recipient_name: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  district: "",
  postal_code: "",
  country: "Bangladesh",
};

export default function NewOrderPage() {
  return (
    <Require menu="orders" action="manage">
      <NewOrderScreen />
    </Require>
  );
}

function NewOrderScreen() {
  const router = useRouter();
  const { token, can } = useAuth();
  const { notify } = useToast();

  const [lines, setLines] = useState<Line[]>([]);
  const [address, setAddress] = useState({ ...EMPTY_ADDRESS });
  const [customerId, setCustomerId] = useState("");
  const [method, setMethod] = useState("cod");
  const [status, setStatus] = useState("pending");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [shippingOverride, setShippingOverride] = useState("");
  const [discount, setDiscount] = useState("");
  const [note, setNote] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadMethods = useCallback(() => adminApi.paymentMethods(), []);
  const { data: methods } = useResource(loadMethods, []);

  // Linking to an account is optional, and reading the customer list needs its
  // own permission — so an orders-only role still gets a walk-in order.
  const canSeeCustomers = can("customers");

  const subtotal = lines.reduce(
    (sum, line) => sum + Number.parseFloat(line.price) * line.quantity,
    0,
  );

  const shipping =
    shippingOverride.trim() !== ""
      ? Number.parseFloat(shippingOverride) || 0
      : subtotal >= 3000 || subtotal === 0
        ? 0
        : 70;
  const off = discount.trim() !== "" ? Number.parseFloat(discount) || 0 : 0;
  const total = Math.max(subtotal + shipping - off, 0);

  function addLine(product: Product, variantId: string) {
    const variant = product.variants.find((v) => v.id === variantId);
    if (!variant) return;
    setLines((current) => {
      if (current.some((line) => line.variant_id === variantId)) {
        notify(`${product.name} ${variant.name} is already on the order`, "error");
        return current;
      }
      return [
        ...current,
        {
          variant_id: variant.id,
          product: product.name,
          size: variant.name,
          sku: variant.sku,
          price: variant.price,
          stock: variant.stock_quantity,
          quantity: 1,
        },
      ];
    });
  }

  async function submit() {
    if (!token) return;
    if (lines.length === 0) {
      setFailure("Add at least one item.");
      return;
    }
    setSaving(true);
    setFailure(null);
    try {
      const order = await adminApi.createOrder(token, {
        items: lines.map((line) => ({ variant_id: line.variant_id, quantity: line.quantity })),
        shipping_address: Object.fromEntries(
          Object.entries(address).map(([key, value]) => [key, value.trim() || null]),
        ),
        user_id: customerId || null,
        payment_method: method,
        status,
        payment_status: paymentStatus || null,
        shipping_fee: shippingOverride.trim() !== "" ? shippingOverride : null,
        discount_total: discount.trim() !== "" ? discount : null,
        admin_note: note.trim() || null,
      });
      notify(`${order.order_number} created`);
      router.push(`/admin/orders/${order.id}`);
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : "Could not create the order");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 pb-4">
      <PageHeader
        title="New order"
        subtitle="For an order taken over the phone or at the counter. Stock is reserved the moment it is created."
        actions={
          <Link
            href="/admin/orders"
            className="label inline-flex items-center gap-1.5 text-muted hover:text-ink"
          >
            <IconChevronLeft />
            Orders
          </Link>
        }
      />

      {failure ? <ErrorNote message={failure} /> : null}

      <div className="grid gap-3 xl:grid-cols-[2fr_1fr] xl:items-start">
        <div className="space-y-3">
          <Panel tone="amber" title="Items" bodyClassName="p-0">
            <div className="border-b border-line p-4">
              <ProductPicker onPick={addLine} />
            </div>

            {lines.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">
                Nothing on the order yet. Search above to add a size.
              </p>
            ) : (
              <>
                <Table head={["Product", "Size", "Unit", "Qty", "Line", ""]}>
                  {lines.map((line) => (
                    <Row key={line.variant_id}>
                      <Cell className="text-ink">
                        {line.product}
                        <span className="block font-mono text-xs text-muted">{line.sku}</span>
                      </Cell>
                      <Cell className="text-muted">{line.size}</Cell>
                      <Cell className="whitespace-nowrap [font-variant-numeric:tabular-nums]">
                        {moneyExact(line.price)}
                      </Cell>
                      <Cell className="md:w-28">
                        <Input
                          type="number"
                          min={1}
                          max={line.stock}
                          value={line.quantity}
                          aria-label={`Quantity of ${line.product} ${line.size}`}
                          onChange={(event) =>
                            setLines((current) =>
                              current.map((entry) =>
                                entry.variant_id === line.variant_id
                                  ? {
                                      ...entry,
                                      quantity: Math.max(1, Number(event.target.value) || 1),
                                    }
                                  : entry,
                              ),
                            )
                          }
                        />
                        {line.quantity > line.stock ? (
                          <span className="mt-1 block text-xs text-accent">
                            only {line.stock} in stock
                          </span>
                        ) : null}
                      </Cell>
                      <Cell className="whitespace-nowrap [font-variant-numeric:tabular-nums]">
                        {moneyExact(
                          (Number.parseFloat(line.price) * line.quantity).toFixed(2),
                        )}
                      </Cell>
                      <Cell className="text-right">
                        <button
                          type="button"
                          aria-label={`Remove ${line.product} ${line.size}`}
                          onClick={() =>
                            setLines((current) =>
                              current.filter((entry) => entry.variant_id !== line.variant_id),
                            )
                          }
                          className="label inline-flex items-center gap-1.5 text-accent hover:underline"
                        >
                          <IconTrash className="size-3.5" />
                        </button>
                      </Cell>
                    </Row>
                  ))}
                </Table>

                <dl className="space-y-2 border-t border-line px-5 py-4 text-sm [font-variant-numeric:tabular-nums]">
                  <div className="flex justify-between text-muted">
                    <dt>Subtotal</dt>
                    <dd className="text-ink">{moneyExact(subtotal.toFixed(2))}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-muted">
                    <dt>Shipping</dt>
                    <dd className="flex items-center gap-2">
                      <Input
                        className="w-28 text-right"
                        inputMode="decimal"
                        placeholder={shipping.toFixed(2)}
                        value={shippingOverride}
                        aria-label="Shipping fee"
                        onChange={(event) => setShippingOverride(event.target.value)}
                      />
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-muted">
                    <dt>Discount</dt>
                    <dd>
                      <Input
                        className="w-28 text-right"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={discount}
                        aria-label="Discount"
                        onChange={(event) => setDiscount(event.target.value)}
                      />
                    </dd>
                  </div>
                  <div className="flex justify-between border-t border-line pt-2 text-base font-semibold text-ink">
                    <dt>Total</dt>
                    <dd>{moneyExact(total.toFixed(2))}</dd>
                  </div>
                </dl>
              </>
            )}
          </Panel>

          <Panel tone="blue" title="Deliver to">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Recipient name">
                <Input
                  required
                  value={address.recipient_name}
                  onChange={(e) => setAddress({ ...address, recipient_name: e.target.value })}
                />
              </Field>
              <Field label="Phone">
                <Input
                  required
                  value={address.phone}
                  onChange={(e) => setAddress({ ...address, phone: e.target.value })}
                />
              </Field>
              <Field label="Address line 1" className="sm:col-span-2">
                <Input
                  required
                  value={address.line1}
                  onChange={(e) => setAddress({ ...address, line1: e.target.value })}
                />
              </Field>
              <Field label="Address line 2" className="sm:col-span-2">
                <Input
                  value={address.line2}
                  onChange={(e) => setAddress({ ...address, line2: e.target.value })}
                />
              </Field>
              <Field label="City">
                <Input
                  required
                  value={address.city}
                  onChange={(e) => setAddress({ ...address, city: e.target.value })}
                />
              </Field>
              <Field label="District">
                <Input
                  value={address.district}
                  onChange={(e) => setAddress({ ...address, district: e.target.value })}
                />
              </Field>
              <Field label="Postal code">
                <Input
                  value={address.postal_code}
                  onChange={(e) => setAddress({ ...address, postal_code: e.target.value })}
                />
              </Field>
              <Field label="Country">
                <Input
                  value={address.country}
                  onChange={(e) => setAddress({ ...address, country: e.target.value })}
                />
              </Field>
            </div>
          </Panel>
        </div>

        <div className="space-y-3">
          <Panel tone="plum" title="Customer">
            {canSeeCustomers ? (
              <CustomerPicker value={customerId} onChange={setCustomerId} />
            ) : (
              <p className="text-sm leading-relaxed text-muted">
                Your role cannot read the customer list, so this will be recorded as a walk-in
                with no account attached.
              </p>
            )}
          </Panel>

          <Panel title="Payment and status">
            <div className="space-y-4">
              <Field label="Payment method">
                <Dropdown
                  value={method}
                  aria-label="Payment method"
                  onChange={setMethod}
                  options={(methods ?? [{ name: "cod", label: "Cash on delivery" }]).map(
                    (entry) => ({ value: entry.name, label: entry.label }),
                  )}
                />
              </Field>
              <Field
                label="Open as"
                hint="A new order can only start as pending, confirmed or processing."
              >
                <Dropdown
                  value={status}
                  aria-label="Order status"
                  onChange={setStatus}
                  options={["pending", "confirmed", "processing"].map((value) => ({
                    value,
                    label: titleCase(value),
                  }))}
                />
              </Field>
              <Field label="Payment" hint="Leave as the method's default unless already paid.">
                <Dropdown
                  value={paymentStatus}
                  aria-label="Payment status"
                  onChange={setPaymentStatus}
                  options={[
                    { value: "", label: "Method's default" },
                    ...["unpaid", "pending", "paid"].map((value) => ({
                      value,
                      label: titleCase(value),
                    })),
                  ]}
                />
              </Field>
              <Field label="Internal note" hint="Only staff see this.">
                <Textarea
                  rows={3}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Phoned in by a regular; collecting Thursday."
                />
              </Field>
            </div>
          </Panel>

          <div className="border border-line bg-paper p-4">
            <div className="flex items-baseline justify-between text-sm">
              <span className="label text-muted">Total</span>
              <span className="text-xl font-semibold text-ink [font-variant-numeric:tabular-nums]">
                {money(total.toFixed(2))}
              </span>
            </div>
            <Button
              className="mt-4 w-full"
              onClick={submit}
              disabled={saving || lines.length === 0 || !address.recipient_name.trim()}
            >
              {saving ? <IconSpinner /> : <IconPlus />}
              {saving ? "Creating…" : "Create order"}
            </Button>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Stock is reserved immediately, and the order appears on the dashboard, in the
              customer&rsquo;s history and in the takings straight away.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductPicker({
  onPick,
}: {
  onPick: (product: Product, variantId: string) => void;
}) {
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(
    (token: string) =>
      query.trim()
        ? adminApi.products(token, { search: query, size: 6, active: true })
        : Promise.resolve(null),
    [query],
  );
  const { data, loading } = useResource(load, [query]);

  return (
    <div>
      <form
        className="flex flex-wrap items-center gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(term.trim());
        }}
      >
        <div className="w-full min-w-0 sm:flex-1">
          <SearchInput
            placeholder="Search the catalogue…"
            value={term}
            aria-label="Search products to add"
            onChange={(event) => setTerm(event.target.value)}
          />
        </div>
        <Button tone="ghost" type="submit">
          <IconSearch />
          Find
        </Button>
      </form>

      {loading && query ? <Spinner label="Searching" /> : null}

      {data && data.items.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Nothing matches “{query}”.</p>
      ) : null}

      {data && data.items.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {data.items.map((product) => (
            <li key={product.id}>
              <p className="text-sm text-ink">{product.name}</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {product.variants.map((variant) => (
                  <button
                    key={variant.id}
                    type="button"
                    disabled={!variant.is_active || variant.stock_quantity < 1}
                    onClick={() => onPick(product, variant.id)}
                    className="border border-line px-2.5 py-1.5 text-xs text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:text-muted/50"
                  >
                    {variant.name} · {money(variant.price)}
                    <span className="ml-1.5 text-muted">
                      {variant.stock_quantity < 1 ? "sold out" : `${variant.stock_quantity} left`}
                    </span>
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CustomerPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");

  // Debounced: the dropdown fires on every keystroke, the API should not.
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(term.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [term]);

  const load = useCallback(
    (token: string) => adminApi.users(token, { search: query || null, size: 8, staff: false }),
    [query],
  );
  const { data, loading } = useResource(load, [query]);

  const options = useMemo(() => {
    const found = (data?.items ?? []).map((user) => ({
      value: user.id,
      label: user.full_name,
      hint: user.email,
    }));
    // Keep the current choice on the list even when a search excludes it,
    // otherwise the trigger would fall back to the placeholder mid-search.
    const chosen = value && !found.some((option) => option.value === value)
      ? [{ value, label: "Selected customer", hint: "Not in the current results" }]
      : [];
    return [
      { value: "", label: "Walk-in (no account)", hint: "Not linked to any customer" },
      ...chosen,
      ...found,
    ];
  }, [data, value]);

  return (
    <div className="space-y-3">
      <Dropdown
        value={value}
        onChange={onChange}
        options={options}
        onSearch={setTerm}
        loading={loading}
        searchPlaceholder="Search by name or email…"
        emptyLabel="No customer matches"
        aria-label="Customer"
      />
      <p className="text-xs leading-relaxed text-muted">
        Linking puts the order in that customer&rsquo;s history and lifetime value. Leave it as
        a walk-in for someone without an account.
      </p>
    </div>
  );
}
