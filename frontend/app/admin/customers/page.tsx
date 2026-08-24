"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import {
  Cell,
  Empty,
  ErrorNote,
  PageHeader,
  Pagination,
  Panel,
  Pill,
  Row,
  SearchInput,
  Spinner,
  Table,
} from "@/components/admin/ui";
import { Dropdown } from "@/components/admin/dropdown";
import { Require } from "@/components/admin/require";
import {
  IconChevronRight,
  IconFilter,
  IconSearch,
} from "@/components/admin/icons";
import { adminApi } from "@/lib/admin/client";
import { shortDate } from "@/lib/admin/format";
import { useResource } from "@/lib/admin/use-resource";

export default function CustomersPage() {
  return (
    <Require menu="customers">
      <CustomersScreen />
    </Require>
  );
}

function CustomersScreen() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  // Filtering by "staff" rather than by role slug on purpose: this screen must
  // work for someone who can see customers but not the roles list.
  const [staff, setStaff] = useState<"" | "true" | "false">("");

  const load = useCallback(
    (token: string) =>
      adminApi.users(token, {
        page,
        size: 20,
        search: query || null,
        staff: staff === "" ? null : staff === "true",
      }),
    [page, query, staff],
  );
  const { data, error, loading, reload } = useResource(load, [page, query, staff]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        subtitle={data ? `${data.total} account${data.total === 1 ? "" : "s"}` : "Loading…"}
      />

      <Panel tone="plum" bodyClassName="p-0">
        <form
          className="flex flex-wrap items-center gap-3 border-b border-line p-4"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setQuery(search.trim());
          }}
        >
          <div className="w-full min-w-0 sm:min-w-52 sm:flex-1">
            <SearchInput
              placeholder="Search by name or email…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search customers"
            />
          </div>
          <IconFilter className="hidden text-muted sm:block" />
          <Dropdown
            className="w-full sm:w-44"
            aria-label="Filter by access"
            value={staff}
            onChange={(next) => {
              setPage(1);
              setStaff(next as "" | "true" | "false");
            }}
            options={[
              { value: "", label: "Everyone" },
              { value: "false", label: "Customers" },
              { value: "true", label: "Panel access" },
            ]}
          />
          <button
            type="submit"
            className="label flex min-h-11 items-center gap-2 border border-line bg-paper px-4 py-2 text-[0.6875rem] hover:bg-paper-2"
          >
            <IconSearch />
            Search
          </button>
        </form>

        {error ? (
          <div className="p-5">
            <ErrorNote message={error} onRetry={reload} />
          </div>
        ) : loading && !data ? (
          <div className="px-5">
            <Spinner label="Loading customers" />
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="p-5">
            <Empty title="Nobody here" body="No account matches that filter." />
          </div>
        ) : (
          <>
            <Table head={["Name", "Email", "Phone", "Joined", "Role", ""]}>
              {data.items.map((user) => (
                <Row key={user.id}>
                  <Cell>
                    <Link
                      href={`/admin/customers/${user.id}`}
                      className="link-underline font-medium text-ink"
                    >
                      {user.full_name}
                    </Link>
                    {user.is_active ? null : (
                      <span className="ml-2 text-xs text-accent">disabled</span>
                    )}
                  </Cell>
                  <Cell className="text-muted">{user.email}</Cell>
                  <Cell className="text-muted">{user.phone ?? "—"}</Cell>
                  <Cell className="whitespace-nowrap text-muted">{shortDate(user.created_at)}</Cell>
                  <Cell>
                    <Pill
                      tone={
                        user.role.is_staff
                          ? "bg-[var(--color-plum)] text-paper"
                          : "bg-paper-2 text-muted"
                      }
                    >
                      {user.role.name}
                    </Pill>
                  </Cell>
                  <Cell className="text-right">
                    <Link
                      href={`/admin/customers/${user.id}`}
                      className="label inline-flex items-center gap-1.5 text-muted hover:text-ink"
                    >
                      Open
                      <IconChevronRight />
                    </Link>
                  </Cell>
                </Row>
              ))}
            </Table>
            <Pagination
              page={data.page}
              pages={data.pages}
              total={data.total}
              noun="account"
              onPage={setPage}
            />
          </>
        )}
      </Panel>
    </div>
  );
}
