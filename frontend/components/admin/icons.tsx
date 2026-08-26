import type { ComponentProps, ReactNode } from "react";

/**
 * Inline stroked icons.
 *
 * Hand-drawn rather than pulled from a library: the panel needs about twenty
 * glyphs, and a dependency would ship hundreds. They inherit `currentColor` and
 * use a 1.5 hairline to sit with the 1px rules the rest of the panel is built
 * from, so an icon never out-weighs the text beside it.
 *
 * Every one is `aria-hidden` — each is placed next to a real label, so exposing
 * them to a screen reader would just read everything twice. An icon-only
 * control carries its own `aria-label` at the call site.
 */

export type IconProps = Omit<ComponentProps<"svg">, "children"> & {
  /** Overrides the 1.5 hairline. Rarely needed. */
  weight?: number;
};

// Consumers never pass children — only these definitions do.
function Icon({ weight = 1.5, className = "", ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={`size-4 shrink-0 ${className}`}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------ menus */

export const IconDashboard = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 13a8 8 0 0 1 16 0" />
    <path d="M12 13l3.5-3.5" />
    <path d="M4 13h1M19 13h1M12 5v1" />
    <path d="M4 17h16" />
  </Icon>
);

export const IconOrders = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21z" />
    <path d="M9 8h6M9 12h6" />
  </Icon>
);

/** A perfume bottle — the thing this shop actually sells. */
export const IconProducts = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 2h4v3h-4z" />
    <path d="M9 5h6a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" />
    <path d="M6 12h12" />
  </Icon>
);

export const IconCategories = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 5h7v7H3zM14 5h7v7h-7zM3 14h7v5H3zM14 14h7v5h-7z" />
  </Icon>
);

export const IconCustomers = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20a6 6 0 0 1 12 0" />
    <path d="M16 5.5a3.2 3.2 0 0 1 0 6M18 20a6 6 0 0 0-3-5.2" />
  </Icon>
);

export const IconRoles = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3l7 3v6c0 4.2-2.9 7.7-7 9-4.1-1.3-7-4.8-7-9V6z" />
    <circle cx="12" cy="11" r="1.8" />
    <path d="M12 12.8V16" />
  </Icon>
);

/* ---------------------------------------------------------------- actions */

export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const IconSearch = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Icon>
);

export const IconFilter = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6h16l-6 7v6l-4-2v-4z" />
  </Icon>
);

export const IconEdit = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h4l10-10-4-4L4 16z" />
    <path d="m14 6 4 4" />
  </Icon>
);

export const IconTrash = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
    <path d="M10 11v6M14 11v6" />
  </Icon>
);

export const IconSave = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 4h11l3 3v13H5z" />
    <path d="M8 4v5h7V4M8 20v-6h8v6" />
  </Icon>
);

export const IconClose = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 13 4.5 4.5L19 7" />
  </Icon>
);

export const IconAlert = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4.5 21 20H3z" />
    <path d="M12 10v4.5M12 17.2v.3" />
  </Icon>
);

export const IconImage = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 5h16v14H4z" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m5 18 5-5 3.5 3.5L16 14l3 4" />
  </Icon>
);

export const IconReports = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20V10M10 20V4M16 20v-7M4 20h17" />
  </Icon>
);

export const IconStock = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 8.5 12 4l9 4.5-9 4.5z" />
    <path d="M3 12.5 12 17l9-4.5M3 16.5 12 21l9-4.5" />
  </Icon>
);

export const IconLock = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 11h12v9H6z" />
    <path d="M9 11V8a3 3 0 0 1 6 0v3" />
  </Icon>
);

export const IconSignOut = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 4H5v16h5" />
    <path d="M14 8l4 4-4 4M18 12H9" />
  </Icon>
);

export const IconExternal = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13 5h6v6" />
    <path d="M19 5 10 14" />
    <path d="M18 14v5H5V6h5" />
  </Icon>
);

export const IconMenu = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);

export const IconChevronLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="m14 6-6 6 6 6" />
  </Icon>
);

export const IconChevronRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="m10 6 6 6-6 6" />
  </Icon>
);

export const IconArrowUp = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Icon>
);

export const IconArrowDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Icon>
);

export const IconCart = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 5h2.5l2.2 10.5h9.6L19 8H6" />
    <circle cx="9" cy="19" r="1.4" />
    <circle cx="17" cy="19" r="1.4" />
  </Icon>
);

export const IconUser = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="3.4" />
    <path d="M5 20a7 7 0 0 1 14 0" />
  </Icon>
);

export const IconPrinter = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 9V4h10v5" />
    <path d="M6 9h12a2 2 0 0 1 2 2v5h-4v4H8v-4H4v-5a2 2 0 0 1 2-2z" />
    <path d="M8 16h8" />
  </Icon>
);

export const IconSpinner = ({ className = "", ...p }: IconProps) => (
  <Icon className={`animate-spin ${className}`} {...p}>
    <path d="M12 4a8 8 0 1 0 8 8" />
  </Icon>
);

/** Sidebar lookup, keyed the same way the API keys its menus. */
export const MENU_ICONS = {
  dashboard: IconDashboard,
  reports: IconReports,
  orders: IconOrders,
  products: IconProducts,
  categories: IconCategories,
  customers: IconCustomers,
  roles: IconRoles,
} as const;
