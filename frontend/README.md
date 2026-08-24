# Bakhoora — Storefront

Next.js 16 (App Router) + Tailwind v4. Editorial-minimal design: warm paper ground,
ink type, one amber accent, numbered section markers, scroll reveals.

## Run

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # production build
npm run typecheck
```

## Where things live

| Path | What |
|---|---|
| `app/globals.css` | The whole design system — palette, type scale, `.label`, `.display-*`, motion |
| `lib/catalog.ts` | Seed catalogue (11 blends), filtering, sorting, shipping rules |
| `lib/cart-context.tsx` | Client cart, persisted to `localStorage`, drives the drawer |
| `lib/api.ts` | Typed FastAPI client, dormant until `NEXT_PUBLIC_API_URL` is set |
| `components/bottle.tsx` | Product imagery — drawn SVG flacons tinted per blend, no photo assets |

## Routes

`/` · `/shop` (+ `?category=&sort=&stock=1`) · `/shop/[slug]` · `/cart` · `/checkout` ·
`/checkout/success` · `/account` · `/account/login` · `/account/register` · `/about`

## Design tokens

| Token | Value | Use |
|---|---|---|
| `paper` | `#f6f2ea` | Page ground |
| `paper-2` | `#efe8dc` | Alternating sections, product tiles |
| `ink` | `#16140f` | Type, primary buttons |
| `muted` | `#6f695c` | Secondary copy |
| `line` | `#ddd4c4` | Hairlines — the main structural device |
| `accent` | `#8c5a2b` | Section numbers, low-stock warnings, one word per headline |
| `night` | `#14120e` | Inverted sections and footer |

Display type is Instrument Serif, UI is Inter. Headlines use `.display-xl/lg/md`, which
are `clamp()` based, so nothing needs per-breakpoint sizing.

## Connecting the backend

The storefront runs entirely on `lib/catalog.ts`, so the design works with no server.
To switch to the FastAPI app in `../BUILD_GUIDE.md`:

```bash
cp .env.local.example .env.local     # set NEXT_PUBLIC_API_URL=http://localhost:8090/api/v1
```

Then replace the three seams:

1. **Catalogue** — `app/shop/page.tsx` and `app/shop/[slug]/page.tsx` call
   `queryProducts()` / `getProduct()`. Swap for `api.products()` / `api.product()`.
2. **Cart** — `lib/cart-context.tsx` is local-only. Once a user is signed in, mirror
   each mutation to `/cart/items` and hydrate from `GET /cart`.
3. **Checkout** — `app/checkout/page.tsx` mints a local order reference. Replace that
   with `api.checkout(token, payload)` and pass the returned
   `payment_instructions` through to `/checkout/success`.

Auth pages already render; they need a token store (httpOnly cookie via a route handler
is the safer option over `localStorage`).
