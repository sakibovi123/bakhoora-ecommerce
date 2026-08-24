"use client";

import { useCallback, useState } from "react";

import {
  PermissionMatrix,
  emptyGrid,
  gridFrom,
  gridSummary,
  gridToPayload,
  type Grid,
} from "@/components/admin/permission-matrix";
import { useConfirm } from "@/components/admin/dialog";
import { Require } from "@/components/admin/require";
import { useToast } from "@/components/admin/toast";
import {
  Button,
  Empty,
  ErrorNote,
  Field,
  Input,
  PageHeader,
  Panel,
  Pill,
  Spinner,
  Toggle,
} from "@/components/admin/ui";
import {
  IconClose,
  IconEdit,
  IconPlus,
  IconSave,
  IconSpinner,
  IconTrash,
} from "@/components/admin/icons";
import { ApiError, adminApi } from "@/lib/admin/client";
import { useAuth } from "@/lib/auth";
import type { Menu, RoleDetail } from "@/lib/admin/types";
import { useResource } from "@/lib/admin/use-resource";

export default function RolesPage() {
  return (
    <Require menu="roles">
      <RolesScreen />
    </Require>
  );
}

function RolesScreen() {
  const { can } = useAuth();
  const canManage = can("roles", "manage");

  const loadRoles = useCallback((token: string) => adminApi.roles(token), []);
  const { data: roles, error, loading, reload } = useResource(loadRoles, []);

  const loadMenus = useCallback((token: string) => adminApi.menus(token), []);
  const { data: menus } = useResource(loadMenus, []);

  const [creating, setCreating] = useState(false);

  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if ((loading && !roles) || !roles || !menus) return <Spinner label="Loading roles" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles & access"
        subtitle="A role decides which menus someone sees and what they may change in them."
        actions={
          canManage ? (
            <Button onClick={() => setCreating((open) => !open)}>
              {creating ? <IconClose /> : <IconPlus />}
              {creating ? "Cancel" : "New role"}
            </Button>
          ) : null
        }
      />

      {creating ? (
        <RoleForm
          menus={menus}
          onDone={() => {
            setCreating(false);
            reload();
          }}
        />
      ) : null}

      {roles.length === 0 ? (
        <Empty title="No roles yet" />
      ) : (
        <div className="space-y-3">
          {roles.map((role) => (
            <RoleCard
              key={role.id}
              role={role}
              menus={menus}
              canManage={canManage}
              onDone={reload}
            />
          ))}
        </div>
      )}

      <p className="text-xs leading-relaxed text-muted">
        Hiding a menu is not what protects it — every admin endpoint carries the matching
        permission check, so a role without <em>Manage</em> is refused the write even if the
        request is made by hand.
      </p>
    </div>
  );
}

function RoleCard({
  role,
  menus,
  canManage,
  onDone,
}: {
  role: RoleDetail;
  menus: Menu[];
  canManage: boolean;
  onDone: () => void;
}) {
  const { token } = useAuth();
  const { notify } = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);

  async function remove() {
    if (!token) return;
    const sure = await confirm({
      title: `Delete the ${role.name} role?`,
      body: "Nobody holds it, so no account loses access.",
      confirmLabel: "Delete role",
      tone: "danger",
    });
    if (!sure) return;
    try {
      await adminApi.deleteRole(token, role.id);
      notify(`${role.name} deleted`);
      onDone();
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : "Could not delete", "error");
    }
  }

  return (
    <Panel
      tone={role.is_staff ? "plum" : "neutral"}
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-ink">{role.name}</span>
          {role.is_staff ? (
            <Pill tone="bg-[var(--color-plum)] text-paper">Staff</Pill>
          ) : (
            <Pill tone="bg-paper-2 text-muted">Storefront only</Pill>
          )}
          {role.is_system ? <Pill tone="bg-accent-soft/35 text-ink">Built in</Pill> : null}
        </span>
      }
      actions={
        canManage ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setEditing((open) => !open)}
              className="label flex items-center gap-1.5 text-muted hover:text-ink"
            >
              {editing ? <IconClose /> : <IconEdit />}
              {editing ? "Close" : "Edit"}
            </button>
            {role.is_system ? null : (
              <button
                type="button"
                onClick={remove}
                className="label flex items-center gap-1.5 text-accent hover:underline"
              >
                <IconTrash />
                Delete
              </button>
            )}
          </div>
        ) : null
      }
    >
      {editing ? (
        <RoleForm
          role={role}
          menus={menus}
          onDone={() => {
            setEditing(false);
            onDone();
          }}
        />
      ) : (
        <div className="space-y-2 text-sm">
          {role.description ? <p className="text-muted">{role.description}</p> : null}
          <p className="text-muted">
            <span className="text-ink">
              {role.user_count} account{role.user_count === 1 ? "" : "s"}
            </span>{" "}
            · {role.is_staff ? gridSummary(gridFrom(menus, role.permissions), menus) : "No panel access"}
          </p>
          {role.is_staff && role.permissions.length ? (
            <ul className="flex flex-wrap gap-1.5 pt-1">
              {role.permissions.map((permission) => (
                <li key={permission.menu}>
                  <Pill
                    tone={
                      permission.can_manage
                        ? "bg-[var(--color-plum-soft)] text-ink"
                        : "bg-paper-2 text-muted"
                    }
                    dot={permission.can_manage ? "bg-[var(--color-plum)]" : "bg-muted"}
                  >
                    {menus.find((m) => m.key === permission.menu)?.label ?? permission.menu}
                    {permission.can_manage ? " · manage" : " · view"}
                  </Pill>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

function RoleForm({
  role,
  menus,
  onDone,
}: {
  role?: RoleDetail;
  menus: Menu[];
  onDone: () => void;
}) {
  const { token } = useAuth();
  const { notify } = useToast();

  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [isStaff, setIsStaff] = useState(role?.is_staff ?? true);
  const [grid, setGrid] = useState<Grid>(() =>
    role ? gridFrom(menus, role.permissions) : emptyGrid(menus),
  );
  const [busy, setBusy] = useState(false);

  // The Administrator role always holds everything; the API refuses to narrow it.
  const lockedPermissions = role?.is_system === true && role.slug === "admin";
  const lockedStaff = role?.is_system === true;

  async function save() {
    if (!token || !name.trim()) return;
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        is_staff: isStaff,
        ...(lockedPermissions ? {} : { permissions: gridToPayload(grid) }),
      };
      if (role) {
        await adminApi.updateRole(token, role.id, lockedStaff ? { ...payload, is_staff: undefined } : payload);
        notify(`${name.trim()} updated`);
      } else {
        await adminApi.createRole(token, payload);
        notify(`${name.trim()} created`);
      }
      onDone();
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : "Could not save the role", "error");
    } finally {
      setBusy(false);
    }
  }

  const body = (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Name">
          <Input
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder="Order manager"
          />
        </Field>
        <Field label="Description" hint="What is this role for?">
          <Input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Handles fulfilment, no catalogue access"
          />
        </Field>
      </div>

      <Toggle
        label="Can open the admin panel"
        hint={
          lockedStaff
            ? "Built-in roles keep their access."
            : "Turn this off for a storefront-only role; its menus are cleared."
        }
        checked={isStaff}
        disabled={lockedStaff}
        onChange={setIsStaff}
      />

      {isStaff ? (
        lockedPermissions ? (
          <p className="border border-line bg-paper-2/60 px-4 py-3 text-sm text-muted">
            The Administrator role always holds every permission. To grant a narrower set,
            create another role.
          </p>
        ) : (
          <PermissionMatrix menus={menus} grid={grid} onChange={setGrid} />
        )
      ) : null}

      <div className="flex justify-end gap-3 border-t border-line pt-4">
        <button type="button" onClick={onDone} className="label px-4 py-2.5 text-muted hover:text-ink">
          Cancel
        </button>
        <Button onClick={save} disabled={busy || !name.trim()}>
          {busy ? <IconSpinner /> : role ? <IconSave /> : <IconPlus />}
          {busy ? "Saving…" : role ? "Save role" : "Create role"}
        </Button>
      </div>
    </div>
  );

  if (role) return body;
  return <Panel tone="plum" title="New role">{body}</Panel>;
}
