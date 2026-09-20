# TokenAPI — Enterprise AI API Console

TokenAPI is an independent enterprise console for AI API management: API keys,
usage, reliability and billing, built on an owned `/api/v1` business contract.
This repository (`TokenConsole`) contains the console application.

## Current status

The console shell, the Overview dashboard and the authentication foundation
are in place:

- Responsive App Shell: fixed collapsible sidebar (240px / 64px), 52px header,
  mobile navigation sheet, skip link, single main landmark
- Overview dashboard at `/overview`: monthly metrics, usage trend chart
  (Cost / Requests / Tokens), model usage, API status, recent requests — all
  from the clearly labelled demo dataset
- Authentication: `/login` (username + password, optional 2FA step),
  `/api/v1/auth/{login,verify,refresh,logout}` and `/api/v1/me` BFF routes,
  and a user menu in the header (Settings / Sign out). Console pages are
  gated server-side in `src/app/(console)/layout.tsx`: the encrypted
  session cookie is verified before any protected HTML is produced.
  The session lives in a single HttpOnly `tc_session` cookie (AES-256-GCM,
  format `v1.<iv>.<ciphertext>.<auth-tag>`); the browser never sees a New
  API token and no readable session cookie exists.
- All other navigation destinations (`/api-keys`, `/playground`, `/models`,
  `/requests`, `/usage`, `/billing`, `/organization`, `/settings`) show an
  honest "Planned" state; unknown routes return 404
- `/design-system` remains as an internal component reference (not linked in
  product navigation)

Authentication talks to a New API fork (Access JWT + HttpOnly refresh cookie
protocol) exclusively through the server-only adapter — the browser only
ever calls `/api/v1/*` and can never reach the upstream directly.

## Environment variables

| Variable | Scope | Purpose |
| --- | --- | --- |
| `AUTH_SESSION_SECRET` | server-only, **required** | Key material for the AES-256-GCM encrypted `tc_session` cookie. Exactly two encodings are accepted: 64 hexadecimal characters (`openssl rand -hex 32`) or canonical Base64 decoding to at least 32 bytes (`openssl rand -base64 32`). Arbitrary text, odd-length hex and non-canonical Base64 are rejected — sign-in and sessions fail closed. Never expose as `NEXT_PUBLIC_*`. |
| `AUTH_PUBLIC_ORIGIN` | server-only, **required in production** | The pure origin the console is served from (e.g. `https://console.example.com` — protocol + host + effective port only; no path/query/fragment/credentials). Origin/Referer checks compare full origins against it, an https value forces the `Secure` cookie attribute behind http proxies, and a missing or invalid value makes cookie-writing endpoints fail closed with 503 in production. Development falls back to the request origin. |
| `NEW_API_INTERNAL_URL` | server-only | Base URL of the internal New API fork (e.g. `http://127.0.0.1:3003`). Required — auth endpoints fail closed with 503 when unset. Never expose as `NEXT_PUBLIC_*`. |
| `AUTH_COOKIE_SECURE` | server-only, optional | Force the `Secure` attribute on the session cookie (`true`/`false`). Unset: derived from the request scheme. |
| `NEW_API_TIMEOUT_MS` | server-only, optional | Upstream request timeout in milliseconds (default 8000, allowed 100–60000). |

No secrets live in the repository; credentials are never logged or stored in
browser storage.

## Requirements

- Node.js 20.9 or newer (developed against Node 24)
- Corepack-enabled pnpm — the package manager is pinned in `package.json`
  (`pnpm@12.5.1`)

## Commands

Run from this repository's root. The environment may not have a global `pnpm`,
so prefer Corepack:

```bash
corepack pnpm install    # install dependencies (writes pnpm-lock.yaml)
corepack pnpm dev        # start the dev server at http://localhost:3000
corepack pnpm lint       # ESLint with --max-warnings=0
corepack pnpm typecheck  # tsc --noEmit
corepack pnpm build      # production build
corepack pnpm start      # serve the production build
```

If a standalone `pnpm` is on your `PATH`, the same scripts work without the
`corepack` prefix.

The automated tests cover the auth foundation: the New API adapter mappings,
session cookie attributes, token-absence guarantees, upstream error
sanitization, returnTo protection and logout cleanup (`corepack pnpm test`,
vitest — the New API upstream is simulated by an in-process mock HTTP
server). Feature tests are added with each new module.

## Project layout

```
src/
  app/
    page.tsx              # redirects to /overview
    (console)/            # console routes inside the App Shell
      overview/           # the dashboard
      [section]/          # planned-state pages (allowlisted sections only)
    design-system/        # internal component reference
  components/
    layout/               # App Shell: sidebar, header, mobile nav, nav list
    ui/                   # shared primitives (shadcn/ui conventions + Radix)
    shared/               # cross-feature presentation components
  features/
    overview/             # dashboard types, service, page and chart
  lib/                    # cn(), brand and navigation metadata
  mocks/                  # centralized demo dataset (service-only import)
../docs/                  # project plan, architecture, contract, task briefs
../new-api/, ../gpt-load/ # adjacent read-only reference repos (outside this repo)
```

## Design tokens

All tokens live in `src/app/globals.css` as semantic CSS variables and are
mapped into Tailwind via `@theme inline`: `background`, `foreground`,
`surface`, `surface-muted`, `border`, `primary`, `primary-foreground`,
`muted-foreground`, `success`, `warning`, `error`, `info`, `focus-ring`.
Controls use a 6px radius, cards and dialogs 8px, spacing follows a 4–32px
scale, fonts are system stacks (no remote font download), and
`prefers-reduced-motion` is respected globally.
