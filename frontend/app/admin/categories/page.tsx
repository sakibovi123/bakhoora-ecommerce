"use client";

import { useCallback, useState } from "react";

import { useConfirm } from "@/components/admin/dialog";
import { useToast } from "@/components/admin/toast";
import {
  Button,
  Cell,
  Empty,
  ErrorNote,
  Field,
  Input,
  PageHeader,
  Panel,
  Pill,
  Row,
  Spinner,
  Table,
  Textarea,
  Toggle,
} from "@/components/admin/ui";
import { Require } from "@/components/admin/require";
import {
  IconArrowDown,
  IconArrowUp,
  IconPlus,
  IconSave,
  IconSpinner,
  IconTrash,
} from "@/components/admin/icons";
import { ApiError, adminApi } from "@/lib/admin/client";
import { useAuth } from "@/lib/auth";
import type { Category } from "@/lib/admin/types";
import { useResource } from "@/lib/admin/use-resource";

export default function CategoriesPage() {
  return (
    <Require menu="categories">
      <CategoriesScreen />
    </Require>
  );
}

function CategoriesScreen() {
  const load = useCallback((token: string) => adminApi.categories(token), []);
  const { data, error, loading, reload } = useResource(load, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categories"
        subtitle="The order here is the order the storefront shows them in."
      />

      <div className="grid gap-3 xl:grid-cols-[2fr_1fr] xl:items-start">
        <Panel tone="amber" title="All categories" bodyClassName="p-0">
          {error ? (
            <div className="p-5">
              <ErrorNote message={error} onRetry={reload} />
            </div>
          ) : loading && !data ? (
            <div className="px-5">
              <Spinner label="Loading categories" />
            </div>
          ) : !data || data.length === 0 ? (
            <div className="p-5">
              <Empty title="No categories yet" body="Add one on the right to group products." />
            </div>
          ) : (
            <Table head={["Order", "Name", "Slug", "State", ""]}>
              {data.map((category, index) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  all={data}
                  index={index}
                  onDone={reload}
                />
              ))}
            </Table>
          )}
        </Panel>

        <NewCategory onDone={reload} />
      </div>
    </div>
  );
}

function CategoryRow({
  category,
  all,
  index,
  onDone,
}: {
  category: Category;
  all: Category[];
  index: number;
  onDone: () => void;
}) {
  const { token } = useAuth();
  const { notify } = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [busy, setBusy] = useState(false);

  async function move(direction: -1 | 1) {
    if (!token) return;
    const target = index + direction;
    if (target < 0 || target >= all.length) return;
    const reordered = [...all];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    try {
      await adminApi.reorderCategories(
        token,
        reordered.map((entry, position) => ({ id: entry.id, position })),
      );
      onDone();
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : "Could not reorder", "error");
    }
  }

  async function save() {
    if (!token) return;
    setBusy(true);
    try {
      await adminApi.updateCategory(token, category.id, { name: name.trim() });
      notify("Category renamed");
      setEditing(false);
      onDone();
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : "Could not rename", "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    if (!token) return;
    try {
      await adminApi.updateCategory(token, category.id, { is_active: !category.is_active });
      onDone();
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : "Could not update", "error");
    }
  }

  async function remove() {
    if (!token) return;
    const sure = await confirm({
      title: `Delete ${category.name}?`,
      body: "Products in it are kept — they simply lose their category.",
      confirmLabel: "Delete category",
      tone: "danger",
    });
    if (!sure) return;
    try {
      await adminApi.deleteCategory(token, category.id);
      notify(`${category.name} deleted`);
      onDone();
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : "Could not delete", "error");
    }
  }

  return (
    <Row>
      <Cell className="md:w-20">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => move(-1)}
            disabled={index === 0}
            aria-label={`Move ${category.name} up`}
            className="flex size-9 items-center justify-center border border-line text-muted disabled:opacity-30 hover:enabled:bg-paper-2"
          >
            <IconArrowUp className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => move(1)}
            disabled={index === all.length - 1}
            aria-label={`Move ${category.name} down`}
            className="flex size-9 items-center justify-center border border-line text-muted disabled:opacity-30 hover:enabled:bg-paper-2"
          >
            <IconArrowDown className="size-3.5" />
          </button>
        </div>
      </Cell>
      <Cell>
        {editing ? (
          <div className="flex flex-wrap gap-2">
            <Input value={name} onChange={(event) => setName(event.target.value)} />
            <Button onClick={save} disabled={busy || !name.trim()}>
              <IconSave />
              Save
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="link-underline font-medium text-ink"
          >
            {category.name}
          </button>
        )}
      </Cell>
      <Cell className="font-mono text-xs text-muted">{category.slug}</Cell>
      <Cell>
        <button type="button" onClick={toggleActive}>
          {category.is_active ? (
            <Pill tone="bg-ink text-paper">Visible</Pill>
          ) : (
            <Pill tone="bg-paper-2 text-muted">Hidden</Pill>
          )}
        </button>
      </Cell>
      <Cell className="text-right">
        <button
          type="button"
          onClick={remove}
          className="label inline-flex items-center gap-1.5 text-accent hover:underline"
        >
          <IconTrash />
          Delete
        </button>
      </Cell>
    </Row>
  );
}

function NewCategory({ onDone }: { onDone: () => void }) {
  const { token } = useAuth();
  const { notify } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!token || !name.trim()) return;
    setBusy(true);
    try {
      await adminApi.createCategory(token, {
        name: name.trim(),
        description: description.trim() || null,
        is_active: active,
      });
      notify(`${name.trim()} created`);
      setName("");
      setDescription("");
      onDone();
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : "Could not create", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Add a category">
      <div className="space-y-4">
        <Field label="Name" hint="The slug is generated from this.">
          <Input
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Eau de Parfum"
          />
        </Field>
        <Field label="Description">
          <Textarea
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <Toggle label="Visible on the storefront" checked={active} onChange={setActive} />
        <Button onClick={create} disabled={busy || !name.trim()} className="w-full">
          {busy ? <IconSpinner /> : <IconPlus />}
          {busy ? "Creating…" : "Add category"}
        </Button>
      </div>
    </Panel>
  );
}
