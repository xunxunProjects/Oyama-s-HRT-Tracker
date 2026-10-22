# Developers

This page is the fast path for working on the code. It assumes you have read
`CONTRIBUTING.md` and `SECURITY.md` in the repository.

## Local setup

Requirements: Node.js 22, npm, and a C toolchain only if you build the desktop
app.

```bash
git clone https://github.com/xunxunProjects/Oyama-s-HRT-Tracker.git
cd Oyama-s-HRT-Tracker
npm install

# Worker secrets for local development
printf 'JWT_SECRET=%s\n' "$(openssl rand -base64 48)" > .dev.vars

# Local D1 schema
npm run wrangler:migrate:local

# Terminal 1: Worker on http://127.0.0.1:8787
npm run wrangler:dev

# Terminal 2: Vite on http://127.0.0.1:3000 (proxies /api to :8787)
npm run dev
```

`npm run wrangler:dev` builds the app and then starts Wrangler's local runtime.
`npm run dev` alone expects a Worker on port 8787. Do not commit `.dev.vars`.

Checks:

```bash
npx tsc --noEmit
npm run lint
npm run format:check
npm test              # vitest
npm run build
npm run test:e2e      # Playwright; starts its own Worker on :8787 by default
```

The repository's Playwright config hard-codes port 8787 and starts a Worker
itself. For a custom local setup, use a separate config with `baseURL` pointed
at your port and no `webServer`, as described in `CONTRIBUTING.md`.

## Repository layout

| Path          | Contents                                                     |
| ------------- | ------------------------------------------------------------ |
| `src/`        | React app, pages, hooks, services, i18n, model               |
| `worker.ts`   | Worker entry: assets, `/api/*`, auth, rate limits, D1/R2     |
| `toolApi.ts`  | Tool-scoped snapshot, version, and login endpoints           |
| `hrt-server/` | Optional raw `hrt/1` TLS adapter (Node 22)                   |
| `src-tauri/`  | Tauri 1.8 desktop wrapper                                    |
| `migrations/` | D1 schema, `0000`–`0012`                                     |
| `tests/`      | Vitest and Worker unit tests                                 |
| `e2e/`        | Playwright specs and the local Worker launcher               |
| `docker/`     | Entrypoint, reconcile script, container image support        |
| `wiki/`       | Source for this wiki; published by `scripts/publish-wiki.sh` |

See [Architecture](Architecture) for the component and request-flow view.

## API conventions

- JSON request and response bodies; UTF-8.
- Authenticated requests use `Authorization: Bearer <token>`.
- Errors are `{ "code": "...", "message": "..." }` with a meaningful HTTP
  status: `400` invalid input, `401` missing/invalid session, `403` forbidden,
  `404` not found, `409` conflict, `410` expired share, `413` too large,
  `429` rate limited (with `Retry-After`), `500` internal, `503` misconfigured.
- Sensitive state-changing requests are rate-limited. Rate-limit bindings fail
  open by design on a misconfigured self-hosted instance; do not rely on them
  as the only control.
- Private responses set `Cache-Control: no-store`; public assets and avatars
  are cacheable.

Route groups:

| Group   | Examples                                                                                                  | Auth                                          |
| ------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Public  | `/api/notice`, `/api/transparency`, `/api/hrt/capability`, `/api/tool/v1/version`, `/api/shares/access`   | None                                          |
| Account | `/api/register`, `/api/login`, `/api/tool/v1/login`                                                       | None, rate-limited                            |
| User    | `/api/user/profile`, `/api/user/password`, `/api/user/sessions`, `/api/user/2fa/*`, `/api/user/passkeys*` | Bearer session                                |
| Shares  | `/api/shares`, `/api/shares/live`, `/api/shares/keys`                                                     | Owner session; `/api/shares/access` is public |
| Content | `/api/content`, `/api/content/:id`                                                                        | Owner session                                 |
| Admin   | `/api/admin/users`, `/api/admin/storage`, `/api/admin/users/:id/*`                                        | Admin role                                    |
| Tool    | `/api/tool/v1/hrt/*`, `/api/tool/v1/f2f/*`                                                                | Tool session or F2F-scoped token              |

The full route inventory is in `worker.ts`; the tool subset is in `toolApi.ts`.

## Calling the API locally

```bash
# Public
curl -s http://127.0.0.1:8787/api/notice

# Create a throwaway account (local only)
curl -s -X POST http://127.0.0.1:8787/api/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"dev-user","password":"CorrectHorse-Dev-2026!7"}'

# Use the returned token
curl -s http://127.0.0.1:8787/api/user/sessions \
  -H "Authorization: Bearer $TOKEN"

# List your shares
curl -s http://127.0.0.1:8787/api/shares \
  -H "Authorization: Bearer $TOKEN"
```

Use synthetic data. The local Worker writes to a local D1 database, but a
mistake should never be able to touch a real account.

## The raw `hrt/1` transport

`hrt-server/` is an optional Node process that accepts TLS 1.3 connections with
ALPN `hrt/1`. Each frame is a four-byte big-endian length followed by JSON,
capped at 24 MiB. The adapter verifies device ECDSA signatures, checks the
device certificate fingerprint, and only forwards an allowlist of
`/api/tool/v1/*` routes to the Worker over loopback. It supports the `pair.*`
flow and `ping`; everything else is rejected.

It is disabled by default. To run it, provide a certificate, key, and service
token (all mode 600), set `HRT_RAW_ENABLED=1`, and keep the raw port away from
the public internet unless you have reviewed the exposure. The Docker image
starts it only when enabled and exits if it dies. Cloudflare Workers cannot
accept a raw TLS connection; use the HTTPS API there.

The CLI's side of the protocol is documented in the Tools wiki:
[Architecture and Protocols](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker-Tools/wiki/Architecture-and-Protocols).

## Tests and CI

- `npm test` runs Vitest, including the Worker unit tests.
- `npm run test:e2e` runs Playwright; the default config starts a Worker on
  port 8787 and Vite on port 3000.
- CI also runs TypeScript, ESLint, Prettier, the production build, CodeQL,
  Docker, and a Workers build. All checks must be green before merge.
- For a security-sensitive change (auth, crypto, tokens, raw transport), ask a
  maintainer before pushing a design; see [Security](Security).

## Release and deployment

The latest release is `v1.5.0` (2026-10-14). Production deployments use that
tag, not `main`. A release is built from a tag, checked by CI, and published;
unreleased commits may contain incomplete features. See
[Deployment](Deployment) for the three supported deployment paths and
[AI-Contributors](AI-Contributors) for the commit checklist.
