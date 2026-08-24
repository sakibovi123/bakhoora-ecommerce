"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";

import { Dropdown } from "@/components/admin/dropdown";
import { Require } from "@/components/admin/require";
import { StatTile } from "@/components/admin/stat-tile";
import { useToast } from "@/components/admin/toast";
import {
  Button,
  Cell,
  Empty,
  ErrorNote,
  PageHeader,
  Panel,
  Pill,
  Row,
  Spinner,
  Table,
} from "@/components/admin/ui";
import { IconChevronLeft } from "@/components/admin/icons";
import { ApiError, adminApi } from "@/lib/admin/client";
import {
  ORDER_STATUS_DOT,
  ORDER_STATUS_TONE,
  dateTime,
  money,
  shortDate,
  titleCase,
} from "@/lib/admin/format";
import { useAuth } from "@/lib/auth";
import { useResource } from "@/lib/admin/use-resource";

export default function CustomerDetailPage() {
  return (
    <Require menu="customers">
      <CustomerDetailScreen />
    </Require>
  );
}

function CustomerDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const { token, user: me, can } = useAuth();
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);

  const load = useCallback((auth: string) => adminApi.user(auth, id), [id]);
  const { data, error, loading, reload } = useResource(load, [id]);

  // Moving somebody between roles is an access-control change, so it needs the
  // roles menu as well as customers.manage — and the roles list to pick from.
  const canManage = can("customers", "manage");
  const canSeeRoles = can("roles");
  const loadRoles = useCallback(
    (auth: string) => (canSeeRoles ? adminApi.roles(auth) : Promise.resolve([])),
    [canSeeRoles],
  );
  const { data: roles } = useResource(loadRoles, [canSeeRoles]);

  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (loading && !data) return <Spinner label="Loading customer" />;
  if (!data) return null;

  const { user, orders } = data;
  const isSelf = me?.id === user.id;

  async function patch(input: { is_active?: boolean; role_id?: string }) {
    if (!token) return;
    setBusy(true);
    try {
      await adminApi.updateUser(token, user.id, input);
      notify("Account updated");
      reload();
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : "Could not update", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={user.full_name}
        subtitle={
          <>
            {user.email} · joined {shortDate(user.created_at)}
          </>
        }
        actions={
          <Link
            href="/admin/customers"
            className="label inline-flex items-center gap-1.5 text-muted hover:text-ink"
          >
            <IconChevronLeft />
            Customers
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Pill
          tone={
            user.role.is_staff ? "bg-[var(--color-plum)] text-paper" : "bg-paper-2 text-muted"
          }
        >
          {user.role.name}
        </Pill>
        {user.is_active ? (
          <Pill tone="bg-[var(--color-green-soft)] text-ink" dot="bg-[var(--color-green)]">
            Active
          </Pill>
        ) : (
          <Pill tone="bg-accent/20 text-accent" dot="bg-accent">
            Disabled
          </Pill>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile hero tone="green" label="Lifetime value" value={money(data.lifetime_value)} note={data.currency} />
        <StatTile tone="blue" label="Orders" value={data.order_count} />
        <StatTile
          tone="plum"
          label="Last order"
          value={data.last_order_at ? shortDate(data.last_order_at) : "—"}
          note={data.last_order_at ? undefined : "Never ordered"}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-[2fr_1fr] xl:items-start">
        <Panel title="Order history" bodyClassName="p-0">
          {orders.length === 0 ? (
            <div className="p-5">
              <Empty title="No orders" body="This account has not checked out yet." />
            </div>
          ) : (
            <Table head={["Order", "Placed", "Status", "Total"]}>
              {orders.map((order) => (
                <Row key={order.id}>
                  <Cell>
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="link-underline font-medium text-ink"
                    >
                      {order.order_number}
                    </Link>
                  </Cell>
                  <Cell className="whitespace-nowrap text-muted">
                    {dateTime(order.created_at)}
                  </Cell>
                  <Cell>
                    <Pill tone={ORDER_STATUS_TONE[order.status]} dot={ORDER_STATUS_DOT[order.status]}>{titleCase(order.status)}</Pill>
                  </Cell>
                  <Cell className="text-right [font-variant-numeric:tabular-nums]">
                    {money(order.total)}
                  </Cell>
                </Row>
              ))}
            </Table>
          )}
        </Panel>

        <Panel title="Access">
          {isSelf ? (
            <p className="text-sm leading-relaxed text-muted">
              This is your own account. Disabling it or moving it off a staff role would lock
              you out, so both are blocked here and on the API.
            </p>
          ) : !canManage ? (
            <p className="text-sm leading-relaxed text-muted">
              Your role can view customers but not change them.
            </p>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-ink">
                  {user.is_active ? "Account is active." : "Account is disabled."}
                </p>
                <p className="mt-1 text-xs text-muted">
                  A disabled account cannot sign in, and its existing tokens stop working
                  immediately.
                </p>
                <Button
                  tone={user.is_active ? "danger" : "primary"}
                  className="mt-3 w-full"
                  disabled={busy}
                  onClick={() => patch({ is_active: !user.is_active })}
                >
                  {user.is_active ? "Disable account" : "Re-enable account"}
                </Button>
              </div>

              <div className="border-t border-line pt-4">
                <p className="label text-muted">Role</p>
                {canSeeRoles && roles && roles.length ? (
                  <>
                    <Dropdown
                      className="mt-2"
                      value={user.role.id}
                      disabled={busy}
                      aria-label="Role"
                      searchPlaceholder="Search roles…"
                      onChange={(roleId) => patch({ role_id: roleId })}
                      options={roles.map((role) => ({
                        value: role.id,
                        label: role.name,
                        hint: role.is_staff ? "Can open the admin panel" : "Storefront only",
                      }))}
                    />
                    <p className="mt-2 text-xs text-muted">
                      {user.role.is_staff
                        ? "This account can open the admin panel."
                        : "Storefront only."}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-xs text-muted">
                    Changing someone&rsquo;s role needs access to Roles &amp; access, which your
                    role does not include.
                  </p>
                )}
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
