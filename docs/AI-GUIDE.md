# AI Contributor Guide

> **Audience:** AI coding agents and the people directing them. Read this file
> before changing code.
>
> **Scope:** Oyama's HRT Tracker v1.5.1, commit `05d2fd2`, 2026-10-28. If this
> file disagrees with the code, the code wins. Update this file in the same
> pull request when a change makes part of it wrong.
>
> **Language:** English only, deliberately. `README.md` and `CONTRIBUTING.md`
> stay bilingual for human readers. This page is the shared machine-readable
> entry point.

## 0. Read order

1. This file: repository shape, module boundaries, invariants, and the checks
   CI runs.
2. [`README.md`](../README.md): what the product does and how it is deployed.
3. [`CONTRIBUTING.md`](../CONTRIBUTING.md): human contribution rules, local
   setup, translations, and releases.
4. The document for the area you are touching:

| If you touch                            | Read first                                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Pharmacokinetic model or dosing         | [`Algorithm Explanation.md`](../Algorithm%20Explanation.md)                                                              |
| Security, auth, crypto, privacy         | [`SECURITY.md`](../SECURITY.md), [`PRIVACY.md`](../PRIVACY.md), [`wiki/Security.md`](../wiki/Security.md)                |
| Worker API, D1, R2                      | [`wiki/Architecture.md`](../wiki/Architecture.md), [`docs/tool-interface/TOOL_API.md`](./tool-interface/TOOL_API.md)     |
| Share links and backups                 | [`docs/backup-schema-audit/BACKUP_TEST_VECTORS.md`](./backup-schema-audit/BACKUP_TEST_VECTORS.md)                        |
| F2F cohorts or the raw `hrt/1` protocol | [`docs/hrt-protocol/F2F_SERVICE.md`](./hrt-protocol/F2F_SERVICE.md), [`hrt-server/README.md`](../hrt-server/README.md)   |
| UI, styling, motion                     | [`design/system/README.md`](../design/system/README.md), [`src/styles/oyama-tokens.css`](../src/styles/oyama-tokens.css) |
| Deployment, versions, wiki              | [`wiki/Deployment.md`](../wiki/Deployment.md), [`wiki/Deployment-Docker.md`](../wiki/Deployment-Docker.md)               |
| Security reports                        | [`wiki/Security-Reporting.md`](../wiki/Security-Reporting.md)                                                            |

`CONTRIBUTING.md` and the wiki are useful, but they are summaries. The source
files named below are canonical.

## 1. System in one page

Oyama's HRT Tracker is a local-first hormone replacement therapy log and
pharmacokinetic simulator. It has a feminizing mode (estradiol plus
cyproterone acetate) and a masculinizing mode (testosterone), and it can log
adjunct drugs that have no level model.

```
Browser / PWA ──HTTPS──┐
Desktop (Tauri) ───────┼──> Cloudflare Worker (worker.ts) ──> D1 (metadata + ciphertext)
hrt-tool (HTTPS) ──────┘         │
hrt-tool (raw hrt/1) ──> hrt-server ──> Worker
                                  └──> R2 (avatars)
```

There are two largely independent halves:

- **Browser half** (`src/`, `logic.ts`): React UI, local storage, the
  pharmacokinetic model, calibration, client-side crypto, export/import.
- **Server half** (`worker.ts` and its modules): static assets, `/api/*`,
  authentication, rate limits, D1, R2, scheduled cleanup.

A few pure TypeScript modules are shared by both halves:
`backupPolicy.ts`, `passwordStrength.ts`, `shareExpiry.ts`, and
`shareSnapshotSchema.ts`. Keep them free of React, DOM, and Worker-only APIs so
both bundles can import them.

Important product constraints:

- **Local-first.** Dose, lab, weight, and supply records live in the browser by
  default. Do not add a feature that uploads health data without a clear,
  explicit user choice.
- **End-to-end encryption.** Cloud backups and share snapshots are encrypted in
  the browser. The Worker stores ciphertext and the metadata needed to route
  it; it does not receive the passphrase or plaintext snapshot.
- **Not medical advice.** The model produces estimates. Changes to model
  parameters can change what people believe about their own bodies.
- **No router library.** Navigation is a `currentView` state machine in
  `src/hooks/useAppNavigation.ts`. The only path-based route is `/share`.
- **No server-side rendering.** The Worker serves the built `dist/` assets.

## 2. Repository map

### Source and entry points

| Path                     | Responsibility                                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `index.tsx`              | Browser entry; mounts `src/App.tsx`.                                                                                 |
| `src/App.tsx`            | Providers, `/share` route selection, and the view switch.                                                            |
| `src/pages/`             | One file per screen.                                                                                                 |
| `src/components/`        | Shared UI, charts, forms, icons, and doodles.                                                                        |
| `src/contexts/`          | React context: auth, language, HRT mode, dialogs, pixel cat.                                                         |
| `src/hooks/`             | App data, cloud sync, navigation, live-share sync, and small UI hooks.                                               |
| `src/services/`          | API client and client-side auth, backup, sharing, crypto, export, F2F, HRT, and admin calls.                         |
| `src/utils/`             | Shared helpers: backup import/export/merge, plan/regimen, crypto compatibility, units, formatting, and UI utilities. |
| `src/i18n/`              | `translations.ts` (all UI strings), `share.ts` (share-page copy), `locale.ts` (locale detection).                    |
| `src/data/developers.ts` | Credits data for the developer wall.                                                                                 |
| `src/constants.ts`       | Shared UI constants.                                                                                                 |
| `logic.ts`               | Pharmacokinetic model, dose/lab types, simulation, calibration, and model validation. Shared with tests.             |
| `worker.ts`              | Worker entry: static assets, `/api/*` dispatch, auth, sessions, rate limits, D1/R2, and `scheduled()`.               |
| `toolApi.ts`             | `/api/tool/v1/*` contract: version, login fields, snapshot routes.                                                   |
| `contentStore.ts`        | Content-row SQL shared by the website and tool APIs, including retention pruning.                                    |
| `backupPolicy.ts`        | Cloud-backup size cap, revision count, and retention horizons. Shared by client and Worker.                          |
| `passwordStrength.ts`    | Password length/byte limits and strength estimate. Shared by client and Worker.                                      |
| `shareExpiry.ts`         | Share-link expiry bounds and the security-window check. Shared by client and Worker.                                 |
| `shareSnapshotSchema.ts` | Rebuilds and validates a share snapshot from untrusted input; used before encryption and after decryption.           |
| `f2f.ts`                 | F2F cohort registry: seats, member keys, CLI codes, and escrow envelopes.                                            |
| `hrtPairing.ts`          | `hrt://` pairing, device fingerprints, holds, and trusted IPs.                                                       |
| `requestInput.ts`        | Client-address extraction and bounded JSON body reads for the Worker.                                                |
| `communityVote.ts`       | Community funding vote constants, option ids, window, and tally rules. Shared by the page and the Worker.            |
| `communityVoteServer.ts` | `/api/vote` handlers: public tally, account eligibility, and ballot upsert.                                          |

### Supporting directories

| Path                                                        | Responsibility                                                                                                        |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `migrations/`                                               | D1 schema history. `0000`–`0013` exist at this snapshot. Add the next number; never edit a shipped migration.         |
| `wrangler.toml`                                             | Worker entry, assets binding, D1/R2 bindings, rate-limit bindings, and cron trigger.                                  |
| `src-tauri/`                                                | Tauri 1.8 desktop shell (Rust). It wraps the same web build; it is not a second frontend.                             |
| `hrt-server/`                                               | Optional Node 22 raw TLS adapter for the `hrt/1` protocol. Disabled unless `HRT_RAW_ENABLED=1`.                       |
| `docker/`, `Dockerfile`, `compose.yaml`                     | Self-hosted image and startup/migration reconciliation.                                                               |
| `tests/`                                                    | Vitest tests (`tests/**/*.test.ts`, Node environment).                                                                |
| `e2e/`                                                      | Playwright browser tests.                                                                                             |
| `scripts/`                                                  | `set_version.py` (version synchronization) and `publish-wiki.sh` (GitHub wiki publisher).                             |
| `.github/workflows/`                                        | CI, CodeQL, desktop builds, Docker publishing, and releases.                                                          |
| `docs/`                                                     | Protocol, tool API, backup vectors, and this guide.                                                                   |
| `wiki/`                                                     | Source for the GitHub wiki. Edit here, then publish with `scripts/publish-wiki.sh`; do not edit the wiki UI directly. |
| `design/`                                                   | Screenshot/OG generators and the design-system document.                                                              |
| `dist/`                                                     | Build output. Generated; never edit.                                                                                  |
| `node_modules/`, `src-tauri/target/`, `.wrangler/`, `data/` | Generated or local runtime state. Never commit.                                                                       |

## 3. Frontend

### App shell and navigation

- `src/App.tsx` chooses `PublicShare` when the path is `/share` (the token and
  key live in the URL fragment), otherwise it mounts the providers and
  `AppContent`.
- `src/hooks/useAppNavigation.ts` owns `ViewKey` and `currentView`. Adding a
  page means adding a `ViewKey`, a view entry in `VIEW_ORDER`, a tab mapping in
  `VIEW_TAB`, and the render branch in `App.tsx`.
- `src/hooks/navHistory.ts` integrates with the browser History API so Back
  behaves like a stack, including scroll restoration.
- There is no React Router, no URL for each page, and no server-side route
  table. Do not add one for a normal screen.

### Pages

| Group                 | Files                                                                                                                                                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core tracking         | `Home`, `History`, `Lab`, `Plan`, `Forecast`, `Supplies`                                                                                                                                                                   |
| Settings              | `Settings`, `AppearanceSettings`, `LanguageSettings`, `HRTModeSettings`, `WeightSettings`, `AgeSettings`, `PKParams`, `ExportSettings`, `ImportSettings`, `TransparencySettings`, `Credits`, `CommunityVote`, `Disclaimer` |
| Account and security  | `Account`, `ChangePassword`, `DeleteAccount`, `EditProfile`, `EditAvatar`, `Sessions`, `TwoFactor`, `HrtSecurity`, `F2f`, `Admin`                                                                                          |
| Public and onboarding | `PublicShare`, `Onboarding`                                                                                                                                                                                                |
| Developer/easter egg  | `CatStates`, `MilkTeaEasterEgg` (dev mode only)                                                                                                                                                                            |

### State and data flow

- `src/hooks/useAppData.ts` is the central data hook. It reads and writes
  namespaced `localStorage` keys, runs `logic.ts`, and exposes dose, lab,
  weight, supply, plan, calibration, and import/export operations.
- Storage is namespaced by account and HRT mode. When changing a persisted
  shape, update `src/utils/backupState.ts`, `backupImport.ts`,
  `backupBundle.ts`, and `syncMerge.ts` together; old browser data and old
  backups must still load.
- `src/contexts/AuthContext.tsx` holds the session token and user. `src/services/apiClient.ts`
  attaches the Bearer token and turns non-2xx responses into `ApiError` with a
  stable `code`. A 401 emits `UNAUTHORIZED_EVENT` so the UI can sign out
  cleanly.
- `src/hooks/useCloudSync.ts` synchronizes encrypted revisions. The server-side
  retention policy is in `backupPolicy.ts`; the client must respect the same
  `MAX_CLOUD_BACKUP_BYTES` limit before uploading.
- `src/hooks/useLiveShareSync.ts` handles live share updates.

### Services and crypto

`src/services/` is the boundary between UI and the network:

| File               | Responsibility                                                 |
| ------------------ | -------------------------------------------------------------- |
| `apiClient.ts`     | `apiFetch`, `ApiError`, error-code extraction, API origin.     |
| `auth.ts`          | Login, registration, sessions, 2FA, passkeys, device passes.   |
| `cloud.ts`         | Encrypted cloud-backup CRUD.                                   |
| `sharing.ts`       | Share creation, access, live-share updates, key rotation.      |
| `shareCrypto.ts`   | Share-link key derivation and AES-GCM encryption/decryption.   |
| `shareSnapshot.ts` | Snapshot construction and validation around the shared schema. |
| `export.ts`        | User-facing export data.                                       |
| `hrt.ts`           | `hrt://` pairing and capability calls.                         |
| `f2f.ts`           | F2F cohort, key, and CLI-code calls.                           |
| `notice.ts`        | Site notice.                                                   |
| `admin.ts`         | Admin API calls.                                               |

The share key must never be sent to the server. It belongs in the URL fragment
(`/share#<token>.<key>`), which browsers do not send in the HTTP request.

### UI, design, and translations

- Read [`design/system/README.md`](../design/system/README.md) before visual
  changes. It is the v3 design system; the editor rule
  `.cursor/rules/design-system.mdc` is the older v2 summary. When they differ,
  the v3 document and `src/styles/oyama-tokens.css` win.
- Use the existing tokens and components. Do not hard-code colors, spacing,
  radii, or shadows.
- Every visible string goes through `t()`. Add the key to every language
  object in `src/i18n/translations.ts`; `tests/translations.test.ts` checks
  parity. Share-page copy is in `src/i18n/share.ts`.
- No pop-ups: follow the inline-prompt and inline-choice patterns described in
  the design system.

## 4. Backend

`worker.ts` is the single Worker entry. It serves `dist/` through the `ASSETS`
binding and dispatches `/api/*` in a long, ordered `fetch` handler.

### Route groups

| Group              | Prefix / examples                                                                                               | Main code                |
| ------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Public             | `/api/register`, `/api/login`, `/api/transparency`, `/api/notice`, passkey options/verify, `/api/shares/access` | `worker.ts`              |
| Authenticated user | `/api/user/*` (profile, password, sessions, 2FA, avatar), `/api/content*`, `/api/shares*`                       | `worker.ts`              |
| Admin              | `/api/admin/*` (users, storage, backups, notices, password/username/2FA resets)                                 | `worker.ts`              |
| Community vote     | `GET /api/vote` (public), `GET /api/vote/me`, `POST /api/vote`                                                  | `communityVoteServer.ts` |
| Tool               | `/api/tool/v1/*`                                                                                                | `toolApi.ts`             |
| F2F                | `/api/f2f/*`                                                                                                    | `f2f.ts`                 |
| HRT pairing        | `/api/hrt/*`                                                                                                    | `hrtPairing.ts`          |
| Scheduled          | `scheduled()` every 6 hours: expired sessions, shares, pairing rows, F2F sweep                                  | `worker.ts`              |

### Shared server helpers

- `requestInput.ts`: `getClientIP()` and the bounded JSON reader. Every small
  JSON body should go through `readSmallJsonBody()`; do not buffer an
  unbounded request body.
- `passwordStrength.ts`: password length/byte limits and the strength estimate.
- `shareExpiry.ts`: share expiry bounds.
- `shareSnapshotSchema.ts`: sender-side and viewer-side snapshot validation.
- `backupPolicy.ts`: `MAX_CLOUD_BACKUP_BYTES`, `MAX_CLOUD_BACKUPS`, and
  retention horizons.
- `contentStore.ts`: the single copy of content-row SQL and pruning.

### Worker pitfalls

- **Do not export plain values from `worker.ts`.** Workerd treats every named
  export of the main module as an entrypoint and refuses to start when one is a
  plain value. Put importable helpers in a separate module (this is why
  `requestInput.ts` exists).
- **Route order matters.** Public and unauthenticated routes are handled before
  the JWT check; authenticated routes are grouped after it. Add a route in the
  matching block, not at the top by habit.
- **D1 access is scoped by `user_id`.** Never trust a client-provided user id.
- **Admin is environment-configured.** There is no promote-to-admin route.
- **Rate limits live in `wrangler.toml`.** If you add an endpoint that needs a
  new class, add the binding and use a prefixed key.
- **Preview bindings are separate.** `[[previews.*]]` points at preview D1/R2
  and rate-limit namespaces; do not point previews at production.

## 5. Model, data, and migrations

### The model (`logic.ts`)

`logic.ts` contains the dose/lab types and the simulation. Key concepts:

| Concept             | Meaning                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------- |
| `Route`             | `sublingual`, `injection`, `patchApply`, `patchRemove`, `gel`, `oral`.                  |
| `Ester`             | Estradiol esters, CPA, unmodelled adjunct drugs, and testosterone esters.               |
| `DoseEvent`         | A dose at a time in hours, with route, ester, amount, and route-specific extras.        |
| `SimulationResult`  | Sampled concentration curves for E2, CPA, and T.                                        |
| `LabResult`         | A measured level with unit, assay, and time.                                            |
| `CalibrationMethod` | `off`, `ekf`, `ou_kalman`, `mipd`; calibration adjusts the E2 model to the user's labs. |
| `PKCustomParams`    | User-editable model parameters, validated by `sanitizePKParams`.                        |
| `UNMODELLED_DRUGS`  | Adjunct drugs with no level model; they appear in logs but draw no curve.               |

Rules for model changes:

- Cite the source (paper, label, or the upstream
  [HRT-Recorder-PKcomponent-Test](https://github.com/LaoZhong-Mihari/HRT-Recorder-PKcomponent-Test)
  code) in the pull request and explain how the curve changes.
- Do not tune parameters to make a test pass. Tests are evidence, not a target.
- `tests/literature.test.ts` contains `it.fails` cases for known gaps against
  published data. When a change fixes one, the test starts failing; change
  `it.fails` to `it`.
- The model is shared by the UI and tests. Keep it free of React and DOM code.

### Browser storage and backups

- `useAppData` persists through namespaced `localStorage` keys. Account and mode
  namespaces are deliberate; do not collapse them.
- `src/utils/backupState.ts` owns the stored shapes and migration of old keys.
- `src/utils/backupBundle.ts` builds and inspects the complete bundle.
- `src/utils/backupImport.ts` merges or replaces imported data.
- `src/utils/syncMerge.ts` merges cloud revisions.
- `src/utils/backupWarnings.ts` explains compatibility warnings.
- Cloud revisions are full copies, capped at 2 MiB and at five retained
  revisions. Retention is by generation/horizon, not simply "the newest five".
  See `backupPolicy.ts`.

Compatibility is a contract: an older backup must still import, and a newer
backup should produce a clear warning rather than silent data loss. The
acceptance vectors are in
[`docs/backup-schema-audit/BACKUP_TEST_VECTORS.md`](./backup-schema-audit/BACKUP_TEST_VECTORS.md).

### Share links

- The server stores an encrypted envelope; the key is in the URL fragment and
  never reaches the Worker.
- `shareSnapshotSchema.ts` rebuilds the snapshot from untrusted input. Run it
  before encrypting (sender) and after decrypting (viewer). Never render a
  decrypted payload without this check.
- `shareExpiry.ts` defines the allowed expiry range and the one-year security
  window.
- Share access is rate-limited and can require a password. Do not add a route
  that bypasses those checks.

### D1 migrations

- Add a new numbered file in `migrations/`; never edit a migration that has
  shipped.
- Local: `npm run wrangler:migrate:local`.
- Remote Cloudflare: `npm run wrangler:migrate:remote`.
- Docker: `docker/reconcile.mjs` reconciles an existing volume, then the
  entrypoint applies pending migrations.
- Test both a fresh database and an upgrade from the previous schema.
- The community funding vote uses migration `0013`. Its constants and privacy
  rules are documented in [`community-vote.md`](./community-vote.md).

## 6. Security and privacy invariants

Treat these as hard constraints, not suggestions:

1. **Health data stays local by default.** No telemetry, analytics, or
   third-party call may receive dose, lab, weight, supply, or share plaintext
   without an explicit user action.
2. **The server holds ciphertext for backups and shares.** Do not add a
   server-side decrypt path, key escrow for user backups, or logging of
   plaintext.
3. **Share keys stay in the fragment.** Never put a share key in a query
   string, path, referrer, log, or error message.
4. **Validate untrusted snapshots on both ends.** The sender must not seal
   stray profile/account fields into a link; the viewer must not render an
   unexpected shape.
5. **Passwords:** bcrypt on the server, 8–72 UTF-8 bytes, strength check,
   per-account/per-address backoff. Do not weaken the limits to make a test or
   a client flow easier.
6. **Sessions and 2FA:** JWT with revocation, idle expiry, session listing and
   termination, TOTP, and passkeys. A 401 must clear the client session.
7. **Admin is not a database flag users can set.** The admin account comes from
   `ADMIN_USERNAME`/`ADMIN_PASSWORD`; there is no promote route.
8. **Bound request bodies.** Use `readSmallJsonBody` for small JSON; large
   payloads have their own limits. Do not add `await request.json()` on an
   unbounded public route.
9. **Private responses must not be cached publicly.** Keep the existing cache
   headers for authenticated and share content.
10. **No secrets in the repository.** `.dev.vars`, `.env`, `data/`, and
    `.wrangler/` are ignored. Do not print secrets in logs or error messages.
11. **Dependency floors are tested.** `tests/runtimeVersions.test.ts` and
    `tests/rustDependencies.test.ts` guard known security floors. Do not lower
    them casually, and do not take a Tauri 2 major upgrade without a dedicated
    review.
12. **Medical safety:** estimates are not medical advice. Do not add claims,
    defaults, or UI copy that imply the model is a substitute for blood tests
    or a clinician.

## 7. Change recipes

| Goal                            | Read / edit                                                                                                                                           | Verify                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Change UI copy or add a string  | `src/i18n/translations.ts` (all languages), `src/i18n/share.ts` for share pages                                                                       | `npx vitest run tests/translations.test.ts`, `npm run build`            |
| Add or change a screen          | `src/pages/`, `src/App.tsx`, `src/hooks/useAppNavigation.ts` (`ViewKey`, `VIEW_ORDER`, `VIEW_TAB`), translations                                      | typecheck, unit tests, `npm run build`, Playwright if user-visible      |
| Change visual design            | `design/system/README.md`, `src/styles/oyama-tokens.css`, existing components                                                                         | visual check at phone and desktop widths; no hard-coded tokens          |
| Add an API endpoint             | `worker.ts` (correct route group), `src/services/apiClient.ts`, client service, docs if public                                                        | `npx tsc --noEmit`, `tests/routes.test.ts`, hardening/cache tests       |
| Change the database             | New file in `migrations/`, `worker.ts` queries, tests                                                                                                 | fresh local D1 + upgrade path; `tests/workerHardening.test.ts`          |
| Change backup format            | `src/utils/backupState.ts`, `backupBundle.ts`, `backupImport.ts`, `syncMerge.ts`, `backupWarnings.ts`, `backupPolicy.ts`, `docs/backup-schema-audit/` | `backupBundle`, `backupImport`, `backupState`, `backupWarnings` tests   |
| Change share format or crypto   | `src/services/shareCrypto.ts`, `shareSnapshot.ts`, `sharing.ts`, `shareSnapshotSchema.ts`, `shareExpiry.ts`                                           | `shareCrypto`, `shareExpiry`, `sharePasswordLockout`, `f2f`/share tests |
| Change the PK model             | `logic.ts`, `Algorithm Explanation.md`, `tests/literature.test.ts`, `tests/simulation.test.ts`, `tests/hrtEndToEnd.test.ts`                           | targeted simulation/literature tests, then full `npm test`              |
| Change auth, sessions, or 2FA   | `worker.ts`, `src/services/auth.ts`, `src/contexts/AuthContext.tsx`, `SECURITY.md`                                                                    | `loginLockout`, `securityHardening`, `workerHardening`, `routes` tests  |
| Change deployment or versions   | `Dependency-Detection.sh`, `docker-install.sh`, `Dockerfile`, `compose.yaml`, `scripts/set_version.py`, `README.md`, `wiki/Deployment*`               | `deploymentScripts`, `dockerRuntime`, `set_version.py --check`          |
| Change docs or wiki             | `docs/`, `wiki/` (source), `README.md`, `README.zh-CN.md`                                                                                             | `npx prettier --check` on tracked files; publish wiki if needed         |
| Add or upgrade a dependency     | `package.json`, `package-lock.json` (only with a dependency change), security floors                                                                  | `npm ci`, audit, full test/build; explain why the dependency is needed  |
| Touch the desktop shell         | `src-tauri/`, `tauri.conf.json`, `Cargo.toml`, `Cargo.lock`                                                                                           | `npm run tauri:build` or at least Rust checks, `rustDependencies` test  |
| Touch F2F, tool API, or `hrt/1` | `f2f.ts`, `hrtPairing.ts`, `toolApi.ts`, `hrt-server/`, the matching `docs/` page                                                                     | `f2f`, `hrtPairing`, `hrtServer`, `toolInterface` tests                 |
| Fix a bug                       | Reproduce first, add a regression test, then fix                                                                                                      | targeted test, full `npm test`, typecheck, build                        |

## 8. Build, test, and CI

### Local commands

```bash
npm install
npm run dev                 # Vite on :3000, no backend needed for local data/model work
npm run build               # production build into dist/

# With the Worker API:
echo "JWT_SECRET=$(openssl rand -base64 48)" > .dev.vars
npm run wrangler:migrate:local
npm run wrangler:dev        # build + Worker on :8787
npm run dev                 # second terminal; Vite proxies /api to :8787

npx tsc --noEmit
npm run lint
npm run format:check
npm test
npm run test:e2e            # needs `npx playwright install chromium`
python3 scripts/set_version.py --check
```

### CI gates

The `CI` workflow (`.github/workflows/ci.yml`) runs two jobs:

| Job                 | Gates                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| Typecheck and build | version agreement, lint, Prettier check, `tsc --noEmit`, unit tests, production build          |
| Browser E2E         | build, then Playwright against Vite + `wrangler dev --local` with throwaway D1/R2 under `/tmp` |

Separate workflows cover CodeQL, desktop builds, Docker publishing, and
releases. A change is not done because one test passed: run the gates that the
changed area touches, then the full set before opening a pull request.

### Test map

- `tests/simulation.test.ts`, `tests/hrtEndToEnd.test.ts`, `tests/literature.test.ts`:
  the model and its published-data gaps.
- `tests/backup*.test.ts`, `tests/replaceTransaction.test.ts`: storage, merge,
  and backup compatibility.
- `tests/shareCrypto.test.ts`, `tests/shareExpiry.test.ts`,
  `tests/sharePasswordLockout.test.ts`: share links.
- `tests/workerHardening.test.ts`, `tests/securityHardening.test.ts`,
  `tests/privateCacheHeaders.test.ts`, `tests/smallJsonBody.test.ts`,
  `tests/loginLockout.test.ts`: server hardening.
- `tests/routes.test.ts`, `tests/toolInterface.test.ts`, `tests/f2f.test.ts`,
  `tests/hrtPairing.test.ts`, `tests/hrtServer.test.ts`: API contracts.
- `tests/deploymentScripts.test.ts`, `tests/dockerRuntime.test.ts`,
  `tests/runtimeVersions.test.ts`, `tests/rustDependencies.test.ts`: deployment
  and dependency floors.
- `tests/translations.test.ts`, `tests/developers.test.ts`: UI data and
  translation parity.

`npm test` is Vitest in a Node environment, not jsdom. There are no component
unit tests; UI behavior is covered by Playwright and the production build. A
few tests are marked `it.fails` on purpose. A green run reports them as
expected failures; do not "fix" them by deleting the marker without fixing the
underlying gap.

### Formatting note

`npm run format:check` checks the whole repository. Local-only directories
such as `.planning/` and `.playwright-mcp/` are not covered by `.prettierignore`
and can make a local run fail even when every tracked file is clean. Do not
commit those directories, and do not reformat unrelated files to make the check
pass.

## 9. Working rules for AI agents

1. **Inspect before editing.** Run `git status`, read the relevant files end to
   end, and follow the comments. The codebase explains many decisions in
   comments; do not replace them with a "cleaner" pattern from another project.
2. **Do not revert user work.** Untracked files and local changes may be the
   user's. Never delete or overwrite them unless the task explicitly says so.
3. **Make the smallest correct change.** One pull request should do one thing.
   Avoid drive-by refactors, renames, formatting churn, and dependency bumps.
4. **Do not edit generated or local state.** `dist/`, `node_modules/`,
   `src-tauri/target/`, `.wrangler/`, `data/`, `.dev.vars`, and `.env*` are off
   limits except for the documented build/deploy commands.
5. **Do not bump the version.** Maintainers release; `scripts/set_version.py`
   updates every version field together. A feature PR must not change
   `package.json` version.
6. **Do not edit shipped migrations.** Add a new numbered file.
7. **Do not add a dependency without a reason.** Check whether an existing
   utility or platform API already does the job. If a dependency is necessary,
   update the lockfile and explain the security and bundle-size impact.
8. **Respect the trust boundaries.** Never log secrets, share keys, tokens,
   passwords, backup plaintext, or lab data. Never add a server-side decrypt
   path for user backups or shares.
9. **Cite model sources.** A pharmacokinetic change without a citation is not
   reviewable.
10. **Verify with output.** Do not claim a test, typecheck, build, or CI result
    passed without running it and reading the result. If a check cannot run in
    the environment, say exactly why.
11. **Keep docs in sync.** If you change a public command, route, data shape,
    deployment requirement, or module boundary, update the relevant doc and
    this guide in the same change.
12. **Ask when the task is ambiguous or high-risk.** Security, privacy, medical
    model parameters, destructive migrations, and release/deployment changes
    deserve a question rather than a guess.

### Commit and pull-request style

Recent history uses short, imperative, scoped messages such as
`fix(f2f): ...`, `feat(credits): ...`, and `docs(wiki): ...`. Match the
surrounding style. A pull request should explain what changed, why, which
tests ran, and any privacy/security or model impact. Fill in the repository's
PR template instead of replacing it.

## 10. Documentation map

| Document                                                                                          | Use it for                                                           |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [`README.md`](../README.md)                                                                       | Product features, self-hosting, Cloudflare, Docker.                  |
| [`README.zh-CN.md`](../README.zh-CN.md)                                                           | Chinese product documentation.                                       |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md)                                                           | Local setup, codebase map, translations, releases.                   |
| [`Algorithm Explanation.md`](../Algorithm%20Explanation.md)                                       | Model equations, compartments, parameter sources.                    |
| [`SECURITY.md`](../SECURITY.md)                                                                   | Vulnerability disclosure and supported versions.                     |
| [`PRIVACY.md`](../PRIVACY.md)                                                                     | Data handling, encryption, retention.                                |
| [`wiki/Architecture.md`](../wiki/Architecture.md)                                                 | Components, request flow, trust boundaries.                          |
| [`wiki/Security.md`](../wiki/Security.md)                                                         | Operational security and deployment consequences.                    |
| [`wiki/Security-Reporting.md`](../wiki/Security-Reporting.md)                                     | Report templates for low/medium/high/RCE/info-leak findings.         |
| [`wiki/Deployment.md`](../wiki/Deployment.md)                                                     | Deployment comparison and version/tag checks.                        |
| [`wiki/Deployment-Docker.md`](../wiki/Deployment-Docker.md)                                       | Docker install and operations.                                       |
| [`wiki/Deployment-VPS.md`](../wiki/Deployment-VPS.md)                                             | VPS and reverse-proxy setup.                                         |
| [`wiki/Recent-Updates.md`](../wiki/Recent-Updates.md)                                             | Last 40 merged pull requests and security-relevant changes.          |
| [`docs/tool-interface/TOOL_API.md`](./tool-interface/TOOL_API.md)                                 | `/api/tool/v1` contract.                                             |
| [`docs/hrt-protocol/F2F_SERVICE.md`](./hrt-protocol/F2F_SERVICE.md)                               | F2F cohort service and raw protocol.                                 |
| [`docs/backup-schema-audit/BACKUP_TEST_VECTORS.md`](./backup-schema-audit/BACKUP_TEST_VECTORS.md) | Website/tools backup acceptance vectors.                             |
| [`design/system/README.md`](../design/system/README.md)                                           | Design system v3: tokens, icons, fields, motion, no-pop-up patterns. |
| [`hrt-server/README.md`](../hrt-server/README.md)                                                 | Optional raw TLS adapter.                                            |

## 11. Glossary

- **Dose event** — one administration at a time, with route, ester, amount, and
  route-specific extras.
- **Regimen** — a detected repeating dose pattern; used for "due today" and
  supply projections.
- **Plan** — a future change the user is considering; the what-if view compares
  it with the current regimen.
- **Simulation** — the concentration curves produced by `runSimulation` from
  dose events and PK parameters.
- **Calibration** — adjusting the E2 model to the user's lab results (EKF,
  OU-Kalman, MIPD, or manual parameters).
- **Share snapshot** — the sanitized, encrypted subset of dose data behind a
  read-only share link.
- **Content** — a stored cloud-backup revision row in D1; the payload is
  encrypted.
- **F2F** — a 100-seat cohort with member OpenPGP keys and optional operator
  escrow.
- **`hrt/1`** — the raw TLS protocol used by the CLI through `hrt-server`.
- **Tool API** — `/api/tool/v1`, the HTTP surface for the CLI.
- **Escrow** — an operator-provisioned OpenPGP key pair whose private part is
  stored as an AES-GCM envelope under `HRT_ESCROW_KEY`.

---

If you are an AI agent and something here is missing or wrong, fix this file in
the same pull request as the code change that exposed the gap.
