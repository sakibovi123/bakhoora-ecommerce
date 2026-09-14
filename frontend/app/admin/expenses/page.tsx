"use client";

import { useCallback, useMemo, useState } from "react";

import { useConfirm } from "@/components/admin/dialog";
import { Dropdown } from "@/components/admin/dropdown";
import { IconImage, IconPlus, IconSave, IconSpinner, IconTrash } from "@/components/admin/icons";
import { ReceiptUpload } from "@/components/admin/receipt-upload";
import { Require } from "@/components/admin/require";
import { useToast } from "@/components/admin/toast";
import {
  Button,
  Cell,
  Empty,
  ErrorNote,
  Field,
  Input,
  PageHeader,
  Pagination,
  Panel,
  Row,
  Spinner,
  Table,
  Textarea,
  Toggle,
} from "@/components/admin/ui";
import { ApiError, adminApi, mediaUrl } from "@/lib/admin/client";
import { money, plainDate } from "@/lib/admin/format";
import type { Expense, ExpenseCategory } from "@/lib/admin/types";
import { useResource } from "@/lib/admin/use-resource";
import { useAuth } from "@/lib/auth";

export default function ExpensesPage() {
  return (
    <Require menu="expenses">
      <ExpensesScreen />
    </Require>
  );
}

/** The first and last day of a `YYYY-MM` string, as the API wants them. */
function monthRange(month: string): { start: string; end: string } | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [year, index] = month.split("-").map(Number);
  // Day 0 of the next month is the last day of this one, and building it from
  // parts rather than toISOString() keeps it off the UTC shift.
  const last = new Date(year, index, 0).getDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
}

function ExpensesScreen() {
  const [month, setMonth] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);

  const range = useMemo(() => (month ? monthRange(month) : null), [month]);

  const loadExpenses = useCallback(
    (token: string) =>
      adminApi.expenses(token, {
        page,
        size: 20,
        category_id: categoryId || null,
        start: range?.start ?? null,
        end: range?.end ?? null,
      }),
    [page, categoryId, range],
  );
  const loadCategories = useCallback(
    (token: string) => adminApi.expenseCategories(token),
    [],
  );

  const expenses = useResource(loadExpenses, [page, categoryId, range?.start, range?.end]);
  const categories = useResource(loadCategories, []);

  const reloadAll = useCallback(() => {
    expenses.reload();
    categories.reload();
  }, [expenses, categories]);

  const active = (categories.data ?? []).filter((item) => item.is_active);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        subtitle="What the shop spends. Photograph a bill and it is read for you, or type one in. Every entry lands in the month the bill is dated and shows up in the sales report."
      />

      <div className="grid gap-3 xl:grid-cols-[2fr_1fr] xl:items-start">
        <div className="space-y-3">
          <ReceiptUpload categories={active} onSaved={reloadAll} />

          <Panel bodyClassName="p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Field label="Month">
                <Input
                  type="month"
                  value={month}
                  onChange={(event) => {
                    setMonth(event.target.value);
                    setPage(1);
                  }}
                />
              </Field>
              <Field label="Category">
                <Dropdown
                  value={categoryId}
                  onChange={(value) => {
                    setCategoryId(value);
                    setPage(1);
                  }}
                  placeholder="Every category"
                  aria-label="Filter by category"
                  options={[
                    { value: "", label: "Every category" },
                    ...(categories.data ?? []).map((item) => ({
                      value: item.id,
                      label: item.name,
                    })),
                  ]}
                />
              </Field>
              {month || categoryId ? (
                <Button
                  tone="ghost"
                  className="mb-px"
                  onClick={() => {
                    setMonth("");
                    setCategoryId("");
                    setPage(1);
                  }}
                >
                  Clear
                </Button>
              ) : null}
            </div>

            {expenses.data ? (
              <div className="label mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-4 text-muted">
                {/* Both totals are for the whole filter, not this page —
                    otherwise they would change as you clicked through. */}
                <span>
                  {money(expenses.data.total_spent)} across {expenses.data.total} entr
                  {expenses.data.total === 1 ? "y" : "ies"}
                  {month ? " this month" : ""}
                </span>
                {Number.parseFloat(expenses.data.total_outstanding) > 0 ? (
                  <span className="text-[var(--color-amber)]">
                    {money(expenses.data.total_outstanding)} still owed
                  </span>
                ) : null}
              </div>
            ) : null}
          </Panel>

          <Panel tone="green" title="Spending" bodyClassName="p-0">
            {expenses.error ? (
              <div className="p-5">
                <ErrorNote message={expenses.error} onRetry={expenses.reload} />
              </div>
            ) : expenses.loading && !expenses.data ? (
              <div className="p-5">
                <Spinner label="Loading expenses" />
              </div>
            ) : !expenses.data || expenses.data.items.length === 0 ? (
              <div className="p-5">
                <Empty
                  title="Nothing recorded here."
                  body={
                    month || categoryId
                      ? "No expenses match that filter."
                      : "Add the first one on the right — a bottle order, a roll of stickers, the chair."
                  }
                />
              </div>
            ) : (
              <>
                <Table head={["Date", "Description", "Category", "Amount", "Due", ""]}>
                  {expenses.data.items.map((expense) => (
                    <ExpenseRow
                      key={expense.id}
                      expense={expense}
                      categories={active}
                      onDone={reloadAll}
                    />
                  ))}
                </Table>
                <Pagination
                  page={expenses.data.page}
                  pages={expenses.data.pages}
                  total={expenses.data.total}
                  noun="expense"
                  onPage={setPage}
                />
              </>
            )}
          </Panel>
        </div>

        <div className="space-y-3">
          <AddExpense categories={active} onDone={reloadAll} />
          <CategoryManager
            categories={categories.data ?? []}
            loading={categories.loading}
            onDone={reloadAll}
          />
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- rows */

function ExpenseRow({
  expense,
  categories,
  onDone,
}: {
  expense: Expense;
  categories: ExpenseCategory[];
  onDone: () => void;
}) {
  const { token } = useAuth();
  const { notify } = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const [spentOn, setSpentOn] = useState(expense.spent_on);
  const [amount, setAmount] = useState(expense.amount);
  const [paid, setPaid] = useState(expense.amount_paid);
  const [description, setDescription] = useState(expense.description);
  const [categoryId, setCategoryId] = useState(expense.category.id);

  async function save() {
    if (!token) return;
    setBusy(true);
    try {
      await adminApi.updateExpense(token, expense.id, {
        spent_on: spentOn,
        amount,
        amount_paid: paid,
        description: description.trim(),
        category_id: categoryId,
      });
      notify("Expense updated");
      setEditing(false);
      onDone();
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : "Could not save", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const sure = await confirm({
      title: `Delete "${expense.description}"?`,
      body: "It will stop counting towards the sales report. This cannot be undone.",
      confirmLabel: "Delete expense",
      tone: "danger",
    });
    if (!sure || !token) return;
    setBusy(true);
    try {
      await adminApi.deleteExpense(token, expense.id);
      notify("Expense deleted");
      onDone();
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : "Could not delete", "error");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <Row>
        <Cell>
          <Input type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />
        </Cell>
        <Cell>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Cell>
        <Cell>
          <Dropdown
            value={categoryId}
            onChange={setCategoryId}
            aria-label="Category"
            options={categories.map((item) => ({ value: item.id, label: item.name }))}
          />
        </Cell>
        <Cell>
          <Input
            type="number"
            min="0"
            step="0.01"
            aria-label="Bill total"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Cell>
        <Cell>
          {/* Paid, not due: the due is derived, and offering it as an input
              would let the two be edited into disagreeing. */}
          <Input
            type="number"
            min="0"
            step="0.01"
            aria-label="Paid so far"
            value={paid}
            onChange={(e) => setPaid(e.target.value)}
          />
        </Cell>
        <Cell>
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy || !description.trim()}>
              {busy ? <IconSpinner className="animate-spin" /> : <IconSave />}
              Save
            </Button>
            <Button tone="ghost" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </Cell>
      </Row>
    );
  }

  return (
    <Row>
      <Cell className="whitespace-nowrap">{plainDate(expense.spent_on)}</Cell>
      <Cell>
        {expense.description}
        {expense.supplier || expense.reference ? (
          <span className="block text-xs text-muted">
            {[expense.supplier, expense.reference ? `#${expense.reference}` : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
        ) : null}
        {expense.note ? <span className="block text-xs text-muted">{expense.note}</span> : null}
      </Cell>
      <Cell className="text-muted">{expense.category.name}</Cell>
      <Cell className="[font-variant-numeric:tabular-nums]">{money(expense.amount)}</Cell>
      <Cell className="[font-variant-numeric:tabular-nums]">
        {/* A dash, not ৳0, when nothing is owed — a column of zeroes reads as
            data to check, and the whole point is to spot the few that are not. */}
        {Number.parseFloat(expense.amount_due) > 0 ? (
          <span className="text-[var(--color-amber)]">{money(expense.amount_due)}</span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </Cell>
      <Cell>
        <div className="flex gap-2">
          {expense.receipt_url ? (
            <a
              href={mediaUrl(expense.receipt_url)}
              target="_blank"
              rel="noreferrer"
              title="View the bill this was read off"
              className="inline-flex items-center border border-line px-2 py-1 text-muted hover:text-ink"
            >
              <IconImage />
            </a>
          ) : null}
          <Button tone="ghost" onClick={() => setEditing(true)} disabled={busy}>
            Edit
          </Button>
          <Button tone="danger" onClick={remove} disabled={busy}>
            <IconTrash />
          </Button>
        </div>
      </Cell>
    </Row>
  );
}

/* --------------------------------------------------------------------- form */

function AddExpense({
  categories,
  onDone,
}: {
  categories: ExpenseCategory[];
  onDone: () => void;
}) {
  const { token } = useAuth();
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);

  // Built from local parts rather than toISOString(), which would hand back
  // yesterday for anyone sitting behind the shop's timezone.
  const today = useMemo(() => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${String(now.getDate()).padStart(2, "0")}`;
  }, []);

  const [spentOn, setSpentOn] = useState(today);
  const [amount, setAmount] = useState("");
  const [paid, setPaid] = useState("");
  const [supplier, setSupplier] = useState("");
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const total = Number.parseFloat(amount);
  const handed = paid.trim() === "" ? total : Number.parseFloat(paid);
  const overpaid =
    Number.isFinite(total) && Number.isFinite(handed) && handed > total;

  const ready =
    Boolean(description.trim() && amount && categoryId && spentOn) && !overpaid;

  async function create() {
    if (!token || !ready) return;
    setBusy(true);
    try {
      await adminApi.createExpense(token, {
        spent_on: spentOn,
        amount,
        // Blank is the common case — bought and paid for in one go — and the
        // API reads an absent value as settled in full.
        amount_paid: paid.trim() === "" ? null : paid,
        description: description.trim(),
        note: note.trim() || null,
        supplier: supplier.trim() || null,
        category_id: categoryId,
      });
      notify("Expense recorded");
      setAmount("");
      setPaid("");
      setSupplier("");
      setDescription("");
      setNote("");
      onDone();
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : "Could not save", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Record an expense">
      <div className="space-y-4">
        <Field label="Date paid" hint="The day the money left, not today's date.">
          <Input type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />
        </Field>
        <Field label="Amount" hint="The whole cost, paid or not.">
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field
          label="Paid now"
          hint="Leave blank if paid in full."
          error={overpaid ? "More than the amount above." : null}
        >
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder={Number.isFinite(total) ? total.toFixed(2) : "0.00"}
            value={paid}
            onChange={(e) => setPaid(e.target.value)}
          />
        </Field>
        <Field label="Supplier" hint="Optional.">
          <Input
            maxLength={120}
            placeholder="Who was paid"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
          />
        </Field>
        <Field label="What it was">
          <Input
            placeholder="Bottles, stickers, a chair…"
            maxLength={200}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field label="Category">
          {categories.length ? (
            <Dropdown
              value={categoryId}
              onChange={setCategoryId}
              placeholder="Pick one"
              aria-label="Category"
              options={categories.map((item) => ({ value: item.id, label: item.name }))}
            />
          ) : (
            <p className="text-xs text-muted">Add a category below first.</p>
          )}
        </Field>
        <Field label="Note" hint="Optional.">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Button onClick={create} disabled={busy || !ready} className="w-full">
          {busy ? <IconSpinner className="animate-spin" /> : <IconPlus />}
          {busy ? "Saving…" : "Add expense"}
        </Button>
      </div>
    </Panel>
  );
}

/* --------------------------------------------------------------- categories */

function CategoryManager({
  categories,
  loading,
  onDone,
}: {
  categories: ExpenseCategory[];
  loading: boolean;
  onDone: () => void;
}) {
  const { token } = useAuth();
  const { notify } = useToast();
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>, message: string) {
    if (!token) return;
    setBusy(true);
    try {
      await action();
      notify(message);
      onDone();
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : "Could not save", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(category: ExpenseCategory) {
    const sure = await confirm({
      title: `Delete ${category.name}?`,
      body: "Only possible while nothing is filed under it. Otherwise turn it off instead — that hides it from the picker and keeps the history.",
      confirmLabel: "Delete category",
      tone: "danger",
    });
    if (!sure || !token) return;
    void run(() => adminApi.deleteExpenseCategory(token, category.id), "Category deleted");
  }

  return (
    <Panel title="Categories" bodyClassName="p-4 sm:p-5">
      {loading && !categories.length ? (
        <Spinner label="Loading categories" />
      ) : (
        <ul className="space-y-3">
          {categories.map((category) => (
            <li key={category.id} className="flex items-center justify-between gap-3">
              <Toggle
                checked={category.is_active}
                label={category.name}
                onChange={(value) => {
                  if (!token) return;
                  void run(
                    () =>
                      adminApi.updateExpenseCategory(token, category.id, {
                        is_active: value,
                      }),
                    value ? `${category.name} is on` : `${category.name} is off`,
                  );
                }}
              />
              <Button tone="danger" onClick={() => remove(category)} disabled={busy}>
                <IconTrash />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 flex gap-2 border-t border-line pt-4">
        <Input
          placeholder="New category"
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button
          disabled={busy || !name.trim()}
          onClick={async () => {
            if (!token) return;
            await run(
              () => adminApi.createExpenseCategory(token, { name: name.trim() }),
              "Category added",
            );
            setName("");
          }}
        >
          <IconPlus />
        </Button>
      </div>
    </Panel>
  );
}
