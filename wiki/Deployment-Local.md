# Local development

> This is not a production deployment. For production, pin the `v1.5.0`
> release tag. For a loopback-only personal instance, see [Local-Tool](Local-Tool).

The app has two servers in development:

| Process                 | Address                 | What it serves                       |
| ----------------------- | ----------------------- | ------------------------------------ |
| Vite                    | `http://localhost:3000` | The React app, with hot reload       |
| Worker (`wrangler dev`) | `http://127.0.0.1:8787` | `/api/*`, D1, R2, scheduled handlers |

Vite proxies `/api` to the Worker. Open `:3000` while developing the
interface; open `:8787` to use the built app served by the Worker itself.

## Requirements

- Node.js 22 and npm.
- For the desktop app: a Rust toolchain and the Tauri 1 system dependencies for
  your platform.
- Optional: Docker, if you want to run the container locally.

## Frontend only

```bash
npm install
npm run dev
```

This is enough to work on pages that do not call the API. Anything that signs
in, syncs, or saves server-side will fail until the Worker is running.

## Frontend plus Worker

1. Create a local secret file:

   ```bash
   echo "JWT_SECRET=$(openssl rand -base64 48)" > .dev.vars
   ```

   Wrangler reads `.dev.vars` automatically. Do not commit it.

2. Create the local tables:

   ```bash
   npm run wrangler:migrate:local
   ```

3. Start the Worker:

   ```bash
   npm run wrangler:dev
   ```

   This builds the app and starts Wrangler on `:8787` with local D1 and R2
   storage. The scheduled handler does not run on a timer in development; call
   the code path directly if you are working on housekeeping.

4. In another terminal, start Vite:

   ```bash
   npm run dev
   ```

   Open `http://localhost:3000`.

`npm run wrangler:dev` rebuilds once. For repeated frontend edits, keep Vite
running; the Worker only serves the API in that setup.

### Where the local data lives

Wrangler keeps local D1 and R2 state in its own persistence directory. Treat it
as throwaway development data: it is not encrypted at rest like a production
deployment, and it is not a backup. To start clean, stop the Worker and remove
that state directory; the next `wrangler:migrate:local` recreates the schema.

## Desktop app

```bash
npm run tauri:dev
```

The desktop shell loads the built app. Point it at a server with
`VITE_API_ORIGIN`, for example:

```bash
VITE_API_ORIGIN=https://hrt.example.com npm run tauri:dev
```

For a release build, use `npm run tauri:build`. Tauri 1 is pinned on purpose;
the 2.x migration is a separate change.

## Tests and checks

```bash
npx tsc --noEmit          # TypeScript
npm run lint              # ESLint
npm run format:check      # Prettier
npm test                  # Vitest
npm run build             # production bundle
python3 scripts/set_version.py --check
```

End-to-end tests use Playwright against a throwaway Worker:

```bash
npm run test:e2e:install   # once per machine, or after a Playwright upgrade
npm run test:e2e
```

`playwright.config.ts` starts its own Worker on `:8787` and Vite on `:3000`,
with a temporary D1/R2 directory and a random `JWT_SECRET` for each run. It
reuses an existing server only outside CI, so stop your own `:8787` and `:3000`
processes first if the ports are taken. If Playwright cannot find a browser
that matches the package version, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to a
Chromium binary.

## Docker while developing

```bash
docker compose up -d --build
```

The image runs the built app and the Worker together on
`http://127.0.0.1:8787` with `./data` as its persistent volume. It is a
production-shaped run, not a hot-reload environment; use the Vite setup above
for interface work. See [Docker](Deployment-Docker) for settings.

## Exposing the development server

The Worker trusts its local environment and rate limits are not a security
boundary in development. Keep `:8787` on loopback. For a phone or another
machine on the LAN, put a TLS proxy in front rather than binding the Worker to
`0.0.0.0`; passkeys and installation also require HTTPS or `localhost`.

Vite is started with `host: '0.0.0.0'` by the repository config, so the
interface is reachable from the LAN. The API proxy still points at loopback.

## CI

The repository runs:

- `.github/workflows/ci.yml` — type check, lint, unit tests, build, and the
  end-to-end suite.
- `.github/workflows/codeql.yml` — CodeQL analysis.
- `.github/workflows/desktop.yml` — desktop build checks.
- `.github/workflows/docker-publish.yml` — image validation and GHCR publish.
- `.github/workflows/release.yml` — release packaging.

Run the same commands locally before opening a pull request; the
[contributing guide](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/blob/main/CONTRIBUTING.md)
lists them in one place.

## Troubleshooting

- **`JWT_SECRET` errors.** The Worker refuses to start without a valid secret;
  recreate `.dev.vars`.
- **`no such table`.** Run `npm run wrangler:migrate:local`.
- **Vite returns 500 for `/api`.** The Worker is not running on `:8787`, or it
  failed to start; check its terminal.
- **Port already in use.** Another dev server is running. Stop it rather than
  changing the ports: the Playwright config and Vite proxy expect `3000` and
  `8787`.
