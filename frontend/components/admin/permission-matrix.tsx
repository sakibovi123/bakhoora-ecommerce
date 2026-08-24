"use client";

import type { Menu, MenuKey, Permission } from "@/lib/admin/types";

export type Grid = Record<string, { can_view: boolean; can_manage: boolean }>;

export function emptyGrid(menus: Menu[]): Grid {
  return Object.fromEntries(menus.map((m) => [m.key, { can_view: false, can_manage: false }]));
}

export function gridFrom(menus: Menu[], permissions: Permission[]): Grid {
  const grid = emptyGrid(menus);
  for (const permission of permissions) {
    if (grid[permission.menu]) {
      grid[permission.menu] = {
        can_view: permission.can_view,
        can_manage: permission.can_manage,
      };
    }
  }
  return grid;
}

export function gridToPayload(grid: Grid) {
  return Object.entries(grid)
    .filter(([, value]) => value.can_view || value.can_manage)
    .map(([menu, value]) => ({ menu: menu as MenuKey, ...value }));
}

export function gridSummary(grid: Grid, menus: Menu[]): string {
  const held = menus.filter((m) => grid[m.key]?.can_view || grid[m.key]?.can_manage);
  if (held.length === 0) return "No menus";
  if (held.length === menus.length) return "Every menu";
  return held.map((m) => m.label).join(", ");
}

/**
 * Menus down the side, view/manage across the top.
 *
 * Managing implies viewing, so ticking Manage ticks View and clearing View
 * clears Manage — the API stores the pair that way regardless, and letting the
 * two disagree on screen would be a lie about what the role can do.
 */
export function PermissionMatrix({
  menus,
  grid,
  onChange,
  disabled = false,
}: {
  menus: Menu[];
  grid: Grid;
  onChange: (next: Grid) => void;
  disabled?: boolean;
}) {
  const set = (menu: string, patch: { can_view?: boolean; can_manage?: boolean }) => {
    const current = grid[menu] ?? { can_view: false, can_manage: false };
    const next = { ...current, ...patch };
    if (next.can_manage) next.can_view = true;
    if (!next.can_view) next.can_manage = false;
    onChange({ ...grid, [menu]: next });
  };

  return (
    <div className="overflow-x-auto border border-line">
      <table className="data-table w-full border-collapse text-sm md:min-w-[30rem]">
        <thead>
          <tr className="border-b border-line bg-paper-2/60">
            <th scope="col" className="label px-4 py-2.5 text-left font-medium text-muted">
              Menu
            </th>
            <th scope="col" className="label px-4 py-2.5 font-medium text-muted md:w-24">
              View
            </th>
            <th scope="col" className="label px-4 py-2.5 font-medium text-muted md:w-24">
              Manage
            </th>
          </tr>
        </thead>
        <tbody>
          {menus.map((menu) => {
            const value = grid[menu.key] ?? { can_view: false, can_manage: false };
            return (
              <tr key={menu.key} className="border-b border-line/70 last:border-0">
                <td data-label="" className="px-4 py-3">
                  <span className="text-ink">{menu.label}</span>
                  <span className="block text-xs text-muted">{menu.description}</span>
                </td>
                <td data-label="View" className="px-4 py-3 md:text-center">
                  <input
                    type="checkbox"
                    className="size-5 accent-[var(--color-ink)] md:size-4"
                    checked={value.can_view}
                    disabled={disabled}
                    onChange={(event) => set(menu.key, { can_view: event.target.checked })}
                    aria-label={`View ${menu.label}`}
                  />
                </td>
                <td data-label="Manage" className="px-4 py-3 md:text-center">
                  <input
                    type="checkbox"
                    className="size-5 accent-[var(--color-ink)] md:size-4"
                    checked={value.can_manage}
                    disabled={disabled}
                    onChange={(event) => set(menu.key, { can_manage: event.target.checked })}
                    aria-label={`Manage ${menu.label}`}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
