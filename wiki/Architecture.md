# Architecture

The tracker is one Cloudflare Worker that serves the web app and every
`/api/*` route. The same Worker sources run in the Docker image under
Wrangler's local runtime. A separate, optional Node process speaks the raw
`hrt/1` protocol for the CLI. The browser and the CLI hold the plaintext;
the server holds encrypted payloads and the metadata needed to route them.

## Diagram

```mermaid
flowchart LR
  U["Browser / PWA"] -->|HTTPS| W["Cloudflare Worker<br/>worker.ts"]
  D["Desktop app<br/>Tauri"] -->|HTTPS| W
  C["hrt-tool CLI"] -->|HTTPS| W
  C -->|"hrt/1 raw TLS 1.3"| R["hrt-server<br/>(optional)"]
  W --> A["Static assets<br/>dist/"]
  W --> DB[("D1<br/>accounts, sessions,<br/>ciphertext")]
  W --> OBJ[("R2<br/>avatars,<br/>content")]
  R --> W
```

Plain-text map, for readers who cannot render Mermaid:

```
Browser / PWA ──HTTPS──┐
Desktop (Tauri) ───────┼──> Worker (worker.ts) ──> D1 (metadata + ciphertext)
hrt-tool (HTTPS) ──────┘         │
hrt-tool (raw hrt/1) ──> hrt-server ──> Worker
                                  └──> R2 (avatars, content)
```

The diagram is conceptual. It shows the pieces and the direction of trust, not
a particular deployment.

## Components

| Component      | Location                                                                                      | Responsibility                                                                           |
| -------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Web app        | `src/` (React 18, Vite 6, TypeScript)                                                         | Dose/lab/weight UI, local storage, client-side encryption                                |
| App shell      | `src/app/`                                                                                    | Providers, data/navigation wiring, view switch, guards, backup actions                   |
| Domain model   | `src/domain/`, façade `logic.ts`                                                              | Dose/lab types, PK modules, calibration, simulation, advisory rules                      |
| Worker         | `worker.ts`, `src/server/routes/`, `toolApi.ts`, `contentStore.ts`, `hrtPairing.ts`, `f2f.ts` | Static assets, `/api/*`, auth, rate limits, D1/R2 access                                 |
| PWA shell      | `src/routes/lazyPages.ts`, `vite.config.ts`                                                   | Lazy route chunks; install precache is the app shell only                                |
| Database       | D1 (`hrt-tracker-prod`)                                                                       | Accounts, sessions, login backoff, encrypted backups, share rows, passkeys, 2FA, notices |
| Object storage | R2 (`AVATAR_BUCKET`)                                                                          | Avatars and retained content objects                                                     |
| Raw transport  | `hrt-server/` (Node 22)                                                                       | Optional TLS 1.3 adapter for `hrt/1`; disabled by default                                |
| Desktop        | `src-tauri/` (Tauri 1.8)                                                                      | Wraps the web app; points at a server with `VITE_API_ORIGIN`                             |
| CLI            | `tools/hrt-tool`, `tools/hrt-cold`, `tools/hrt-f2f`                                           | Terminal client, offline cold backup, F2F keyrings                                       |

## Request flow

1. The browser loads the built app from the Worker's `ASSETS` binding. The
   service worker installs with only the app shell in its precache; lazy page
   chunks enter a runtime cache after the user opens that page.
2. API calls go to `/api/*` with a Bearer token (web session, tool session, or
   an F2F-scoped token). The Worker validates the token, applies rate limits,
   and scopes database access by `user_id`.
3. Dose, lab, and weight records stay in the browser by default. Backups,
   share snapshots, and live-share updates are encrypted in the browser before
   they are sent; the Worker stores the envelope.
4. Admin routes require the admin role from the environment-configured admin
   account. There is no user promote-to-admin route.
5. If `HRT_RAW_ENABLED=1`, the `hrt-server` process accepts the raw `hrt/1`
   protocol, verifies device signatures, and forwards allowlisted
   `/api/tool/v1/*` calls to the Worker over loopback.
6. Offline, the app shell and pages already opened in this browser work. A page
   that has never been visited cannot load its chunk. `/api` is never cached.

## Offline and low-bandwidth behavior

`vite.config.ts` keeps the install precache to the app shell: entry JS/CSS,
HTML, icons, and the web manifest. Lazy route JS/CSS, images, and fonts are
cached on first successful use (`route-chunks-v1`, `route-styles-v1`,
`static-assets-v1`). `/api` is `NetworkOnly`, so account, backup, share, and
health responses never enter Cache Storage. This keeps the first visit small on
Tor and slow links; the trade-off is that an unvisited page is unavailable
offline. `npm run size` enforces the entry (550 KiB gzip) and precache (3 MiB
raw) budgets.

## Trust boundaries

| Boundary                     | What crosses it                                        | What the other side learns                      |
| ---------------------------- | ------------------------------------------------------ | ----------------------------------------------- |
| Browser → Worker             | Encrypted backups/shares, account and session metadata | Ciphertext, sizes, timestamps, account identity |
| Browser → Worker (plaintext) | Login, registration, profile, admin actions            | Credentials in transit (HTTPS), profile fields  |
| CLI → Worker                 | Bearer token, encrypted snapshots, F2F material        | Token identity, request metadata                |
| CLI → `hrt-server`           | `hrt/1` frames signed by a device key                  | Device identity, request metadata               |
| Operator → host              | `.dev.vars`, D1/R2 data, volume backups                | Everything the server stores                    |

The browser and the CLI hold the keys. The server does not receive the
passphrase or the plaintext snapshot. See [Security](Security) for the
operational consequences.

## Chapters

- **UI and model:** `src/pages`, `src/app`, `src/services`, `src/hooks`; the
  model and calibration live in `src/domain/` behind the `logic.ts` façade.
- **API:** `worker.ts` dispatch and `src/server/routes/` route groups: public,
  auth, user, admin, shares, content, sessions, 2FA, passkeys; plus tool, F2F,
  and voting modules.
- **Storage:** D1 migrations `migrations/0000`–`0013`; R2 avatar/content
  objects.
- **Offline:** app-shell precache plus per-route runtime caches in
  `vite.config.ts`; see the section above.
- **Raw transport:** `hrt-server/`, ALPN `hrt/1`, four-byte big-endian length
  plus JSON frames.
- **CLI:** `tools/` (see the Tools wiki).
- **Deployments:** [Deployment](Deployment) compares Cloudflare, Docker, VPS,
  and local development.

## Canonical sources

- `README.md` — user-facing feature and self-hosting overview.
- `worker.ts` — Worker entry, middleware, auth gate, rate limits, and dispatch.
- `src/server/routes/` — concrete `/api/*` route handlers.
- `src/app/` — signed-in shell composition.
- `src/domain/` — pharmacokinetic model and simulation.
- `src/routes/lazyPages.ts` — page-level code splitting.
- `vite.config.ts` — PWA precache/runtime-cache policy and size budgets.
- `toolApi.ts` — tool-scoped snapshot and version endpoints.
- `hrt-server/` — raw TLS adapter and pairing.
- `migrations/` — schema history.
- `src/services/` — client-side crypto, sharing, backup, and API client.
- `docs/superpowers/specs/` — design notes for larger changes.
