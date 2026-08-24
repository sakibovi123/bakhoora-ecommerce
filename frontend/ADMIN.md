# Admin panel

The back office lives at `/admin` inside the storefront app. Same Next build,
same deploy, same design tokens — but none of the storefront's chrome, and no
bundled sample data.

> **The panel requires the API.** The storefront falls back to `lib/catalog.ts`
> when `NEXT_PUBLIC_API_URL` is unset, so the design works with no server. The
> panel cannot do that: every screen reads and writes real records. Without the
> variable it renders a single "not connected" screen telling you what to set.

```bash
# 1. start the API (from the repo root)
ENV_FILE=.env.dev uv run uvicorn app.main:app --reload --port 8090

# 2. start the panel
cp .env.local.example .env.local     # NEXT_PUBLIC_API_URL=http://localhost:8090/api/v1
npm run dev                          # then open /admin
```

**The ports have to agree.** `NEXT_PUBLIC_API_URL` is baked in at build time; if
the API is served on a different port the panel reports *"Could not reach the
API"*, which is a connection refused rather than anything wrong with the API.
`curl localhost:8090/health` settles which of the two is at fault. After
changing it, rebuild — a `next start` bundle still holds the old value.

Which port *the panel itself* runs on does not matter: locally the API accepts
any `http://localhost:<port>` origin, so `next dev` falling through to 3001 or
3002 will not trip CORS.

Sign in with the seeded administrator (`FIRST_ADMIN_EMAIL` / `FIRST_ADMIN_PASSWORD`
from the API's `.env`).

## Screens

| Route | What it does |
|---|---|
| `/admin/login` | Email + password. A customer account is rejected here, not just hidden. |
| `/admin` | Counters, 14-day revenue chart, best sellers, recent orders, low stock. |
| `/admin/orders` | Search by order number, filter by status, paginate. |
| `/admin/orders/new` | Take an order by phone or at the counter: search the catalogue, set quantities, link a customer or leave it a walk-in, override shipping and discount. |
| `/admin/orders/[id]/invoice` | Printable invoice. Print opens the browser dialog, where "Save as PDF" is one click. |
| `/admin/orders/[id]` | Line items, totals, shipping address, payments. Move status, set payment state, leave an internal note. |
| `/admin/products` | Catalogue **including hidden products**, low-stock filter, inline stock editing per row. |
| `/admin/products/new` | Create a product with all four standard sizes priced. |
| `/admin/products/[id]` | Edit details, prices and stock per size, add or remove extra sizes, upload images, delete. |
| `/admin/categories` | Rename, show/hide, reorder with ↑ ↓, create, delete. |
| `/admin/customers` | Search accounts, filter by panel access. |
| `/admin/customers/[id]` | Lifetime value, order history, enable/disable, move between roles. |
| `/admin/roles` | Create roles and tick their menu permissions. |

## How it is wired

```
lib/auth.tsx              THE session — shared with the storefront
lib/admin/types.ts        shapes returned by the API (money stays a string)
lib/admin/client.ts       every call, one place; normalises both error envelopes
lib/admin/use-resource.ts load-for-the-current-token hook; 401 → bounce to login
lib/admin/format.ts       money, dates, status pill tones, legal status moves
components/admin/require   per-screen permission guard
components/admin/dialog    the panel's own confirm box (no window.confirm)
components/admin/dropdown  the panel's own select (no native <select>)
components/admin/icons     the icon set (inline SVG, no dependency)
components/admin/*        shell, tables, fields, pills, toasts, chart, forms
app/admin/*               the screens above
```

**Auth.** There is **one** session for the whole app, provided by `lib/auth.tsx`
in the root layout and shared with the storefront: sign in once and, if your
role allows it, `/admin` is simply open. The access token lives in
`localStorage` under `bakhoora.auth.token.v1`; on mount the provider calls
`/auth/me` and keeps whatever comes back, staff or not.

What the panel gates on is `isStaff`, never the presence of a token:

- no token → redirect to `/admin/login` carrying a `next` parameter
- token, `is_staff: false` → an explanation and a sign-out button, **not** a
  redirect loop and **not** a silent sign-out of the storefront session
- a 401 mid-request → sign out and back to login

None of this is a security boundary. The API checks the role on every admin
route; the panel only decides what the browser bothers to draw.

**Permissions.** `/auth/me` returns a `permissions` map — `{"orders": ["view",
"manage"]}` — and `can(menu, action)` reads from it. Three things use it:

- the sidebar renders only the menus the role holds
- `<Require menu="orders">` wraps each screen, so typing the URL gets an
  explanation rather than a wall of 403s
- individual controls (the role picker on a customer, the edit buttons on the
  roles page) check `manage` before rendering

Moving someone between roles needs `customers.manage` **and** `roles.view` —
it is an access-control change, and the picker needs the roles list to offer.

**Errors.** The API speaks two shapes: `{"error": {...}}` from `AppError`, and
FastAPI's own `{"detail": [...]}` for request-validation failures.
`messageFrom()` in `client.ts` flattens both into one readable string, so the
panel never shows a raw JSON blob. (If the API ever grows a single envelope —
item 3 in the build guide's "Where to go next" — that function gets shorter.)

**Money** arrives as a decimal string (`"2070.00"`) and is kept as a string
until the moment it is formatted, so nothing is lost to float rounding.

**Images** are stored as a path, not an absolute URL, so the database stays
portable between environments — `mediaUrl()` resolves them against the API
origin, and passes through links that are already absolute. Uploads go as
`FormData`; the client deliberately does *not* set `Content-Type` on those, or
the multipart boundary would be missing and the server could not parse them.

## Rules the UI enforces alongside the API

- **The four standard sizes.** A new product always shows 6ml / 10ml / 15ml /
  30ml as fixed rows; the size input is locked and the row cannot be removed.
  Extra sizes are ordinary rows with a Remove button. On the edit screen a
  standard size shows "Standard" instead of a delete link — switch it off to
  take it out of the shop. The API refuses either way; the UI just does not
  offer the dead end.
- **Order status moves.** The dropdown only lists the transitions
  `ALLOWED_TRANSITIONS` permits from the order's current state, mirrored in
  `NEXT_STATUSES` in `lib/admin/format.ts`. **Keep the two in step** — the API
  is the authority, this table only exists so the UI does not offer a move that
  will bounce.
- **Menu keys.** `MenuKey` in `lib/admin/types.ts` mirrors `MENUS` in
  `app/utils/menus.py`. Adding a menu means touching both.
- **Dropdowns are the panel's own**, never a native `<select>`. That control
  renders its list with the operating system's widget: it ignores the panel's
  type and colour, looks different on every platform, and cannot show a second
  line, a tick, or a search box. `Dropdown` keeps the keyboard contract a native
  select has — arrows move, Enter and Space choose, Escape closes, Home/End jump
  — because a dropdown that only works with a mouse is a downgrade however good
  it looks.
- **Search lives inside the dropdown.** It turns itself on past eight rows, or
  when `onSearch` is given. With `onSearch` the list is the server's and is used
  exactly as returned — filtering it again in the browser would hide rows the
  API deliberately sent. Without it, options are filtered here on label *and*
  hint, so an email finds a customer as readily as a name. Below eight rows
  there is no search box, because searching four statuses is noise.
  The customer picker also pins the current choice to the list while a search
  excludes it, so the trigger never falls back to the placeholder mid-search.
- **Confirmations are the panel's own dialog**, never `window.confirm`. That
  box cannot be styled, announces "localhost:3000 says", blocks the thread, and
  on some setups is suppressed entirely — which would silently turn "delete?"
  into "deleted". `useConfirm()` returns a promise; Escape and clicking away
  cancel, Enter confirms, and destructive actions get the danger tone.
- **A background refresh must not eat an edit.** Adding a size, removing one or
  uploading an image reloads the product. The edit form seeds itself once per
  product id and afterwards only reconciles which variants exist, so unsaved
  changes survive. Seeding on every fresh copy is what left the fields reset and
  "Save changes" greyed out.
- **Four images, one primary.** The uploader shows the empty slots so the limit
  is visible rather than merely enforced, disables the picker at four, and
  offers "Make primary" on every image except the current one — the only
  transition the API allows, since a product must always have a primary. Drag
  and drop and multi-select both go up in a single request.
- **Self-lockout.** On your own customer page the disable and role controls
  are replaced with an explanation. The API rejects both regardless, and also
  refuses to demote the last account that can open the panel.
- **The Administrator role.** Its permission grid is shown as locked with a note
  pointing at "create another role"; the API refuses to narrow or un-staff it.
- **Manage implies view.** Ticking Manage ticks View, and clearing View clears
  Manage. The API stores the pair that way regardless, so letting them disagree
  on screen would be a lie about what the role can do.

## Design notes

Dense-dashboard layout in the storefront's palette: dark `--color-ink` sidebar,
warm `--color-paper` content, hairline `--color-line` rules. Page titles use the
Instrument Serif display face; every number uses the sans, with `tabular-nums`
in table columns so digits line up.

**Colour carries meaning, not decoration.** Four hues, assigned by what a thing
*is*: money is green, order flow blue, the catalogue amber, people plum. Each
area of the panel keeps its hue from the sidebar icon through the page's cards,
tables and pills, so the colour also says where you are.

| | | |
|---|---|---|
| `--color-green` | `#2e8b57` | revenue, delivered, live, active |
| `--color-blue` | `#1f5f9c` | orders and their statuses |
| `--color-amber` | `#8f5518` | products, categories, stock |
| `--color-plum` | `#a12f7d` | customers, roles, staff |

Four rather than six on purpose. Six hues could not be told apart on this
surface under simulated colour-blindness — a rose and a green came out at
ΔE 1.1, effectively identical. These four were validated as a categorical set
against `--color-paper` across **all** pairs, worst normal-vision ΔE 17.5.

Each hue has a 14% tint (`-soft`) for surfaces and a 26% one a step above it
(`-tint`). Ink clears 11:1 on both, and each hue clears 3:1 on its own tint, so
a coloured icon stays legible on a coloured card. `--color-green-deep` exists because paper text
on `--color-green` is only 3.8:1, under the 4.5 that small text needs — filled
pills use the deeper step while the identity hue stays as validated.

Status pills are a tinted background with **ink** text plus a coloured dot,
never coloured text: the hues land at 3.2–4.8:1, under 4.5. The dot also means
status is never carried by colour alone.

`components/admin/tone.ts` maps areas to hues and emits the CSS variables that
`.tone-tile` reads.

**Tables have no hover colour**, deliberately. A tint that follows the pointer
down a list is noise when you are reading rows, and because a table sits inside
a panel, tinting the panel on hover floods the whole surface. Only the small
figure tiles on the dashboard light up; panel headers carry their hue
statically, without reacting to the pointer.

> The accent hues live in a plain `:root`, **not** in `@theme`. Tailwind only
> emits theme variables it can see referenced in the source, and these are
> reached through `var(--tone-*)` assigned at runtime — inside `@theme` the
> `-hover` steps were tree-shaken and row hover silently did nothing.

The revenue chart is a single series on a single axis — daily revenue as
columns, with the order count for that day in the hover tooltip rather than a
second y-scale. It has a Table toggle so the same numbers are reachable without
the hover layer. Its fill is `--color-chart` (`#8f5518`) rather than
`--color-accent`: the accent's chroma sits just under the 0.10 floor where a
large fill starts reading grey. That step clears the floor, the OKLCH lightness
band and 3:1 contrast against the paper surface.

The app is light-only throughout, so the panel is too.

**Printing.** The invoice lives inside the panel, so `@media print` strips the
shell. It hides by `visibility` rather than `display`, because `display: none`
on an ancestor would collapse the sheet's layout too; `.invoice-sheet` stays
visible and is pinned to the page origin. Shop details are constants at the top
of the invoice page — edit them there.

**On a phone** the panel is a first-class layout, not a shrunken desktop one.

- **Tables stack.** A seven-column table cannot fit 375px, and side-scrolling a
  table you have to read every row of is miserable. Below `md` each row becomes
  a card and the column header rides along as a label. `<Row>` hands each cell
  its column name via `data-label`, so the labels come from the same array the
  `<thead>` does and cannot drift; the collapse itself is pure CSS
  (`.data-table` in `globals.css`), so it needs no JS and cannot desync. A
  spanning cell — the expandable stock editor — opts out and stays full width.
- **The sidebar is a real drawer**: it slides in over a backdrop, closes on tap,
  on Escape, and on navigation, and locks the page behind it from scrolling. The
  top bar is sticky, because on a phone it is the only route back to the menu.
- **Tap targets** are at least 44px on controls — buttons, nav rows, the
  category reorder arrows, the permission checkboxes.
- **The chart is touch-aware**: tapping a column toggles its figures, since
  there is no hover, and the tooltip anchors left or right on the end columns
  instead of running off the screen.
- Filter rows go full width and stack; the add-size and stock rows become a
  grid instead of a wrapping flex line.

The breakpoint for the table collapse is `767px`, matching Tailwind's `md`. If
you change one, change the other — they are in different files.

**Icons** live in `components/admin/icons.tsx` — about two dozen inline SVGs,
hand-drawn rather than pulled from a library, because the panel needs twenty
glyphs and a dependency would ship hundreds. They are stroked at 1.5 so they sit
with the 1px rules the rest of the panel is built from, and they inherit
`currentColor`, so a glyph never out-weighs the text beside it and never needs
its own colour rule.

Every icon is `aria-hidden` with `focusable="false"`: each one sits next to a
real label, so exposing it would just read the same thing twice. The two
icon-only controls — the category reorder arrows — carry their own `aria-label`
at the call site. Adding a menu means adding an entry to `MENU_ICONS`, which is
keyed the same way the API keys its menus.

On the storefront only the two functional controls in the header (cart, account)
took icons. The rest of that design is deliberately typographic and reads better
without them.

## Storefront auth

The customer-facing pages use the same session. `/account/login` and
`/account/register` post to `/auth/login` and `/auth/register` — registering
signs you straight in rather than bouncing back to the login form — and
`/account` renders the signed-in profile with real order history from
`/orders`. The header swaps "Account" for the person's first name once the
session has been restored (never before, or the server and client markup
disagree on the first paint).

A staff account signed in on the storefront sees an "Open the admin panel" link
on `/account`; a customer does not.
