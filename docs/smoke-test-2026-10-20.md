# Smoke test and build report — 2026-10-20

Scope: Oyama's HRT Tracker website (browser smoke test with Playwright MCP) plus
the local Worker API, production reachability, and the separate Tools repository.

- Website: tested on `main` @ `e53e723`; fixes applied on
  `fix/smoke-test-findings-2026-10-20`.
- Tools: `xunxunProjects/Oyama-s-HRT-Tracker-Tools` `main` @ `5caaecb`.
- Local stack: Vite on `http://127.0.0.1:3000`, Wrangler Worker on
  `http://127.0.0.1:8787` with a throwaway local D1/R2 store.
- Browser: Playwright MCP, Chromium, desktop viewport.
- Data: synthetic only. Test account ended as `smoke_20261020_renamed`
  (started as `smoke_20261020_2213`), then was deleted through the UI.
- F1–F3 and F5 were fixed and covered by regression tests. F4 turned out to be
  a Playwright accessibility-snapshot artifact, not a product bug. F6 is a
  deployment note documented in `SECURITY.md`. Medical model code was not
  modified.

## Summary

| Area                               | Result                                                   |
| ---------------------------------- | -------------------------------------------------------- |
| Local website smoke test           | Pass, with findings F1–F5                                |
| Fixes                              | F1, F2, F3 and F5 fixed; F4 verified as tooling artifact |
| Production reachability and render | HTTP 200 and renders; CSP finding F6 documented          |
| Website production build           | Pass after fixes                                         |
| Website unit tests                 | 29 files, 554 passed, 4 expected failures                |
| Website browser E2E                | 20 / 20 passed (3.0 min)                                 |
| TypeScript typecheck               | Pass                                                     |
| ESLint                             | 0 errors, 266 warnings                                   |
| Prettier format check              | Pass                                                     |
| Tools native configure/build/ctest | Pass, 2 / 2 tests (with `-Werror`)                       |
| Tools Go build/vet/tests           | Pass                                                     |

## Findings

### F1 — High — Plan and supplies are not adopted into the account namespace on first sign-in

Observed behaviour:

- Before registering, the medication plan was stored in the signed-out key
  `hrt-plan` with two items (estradiol valerate 5 mg injection weekly, oral
  estradiol 2 mg daily). The Overview showed both plan cards.
- After registering and signing in, the account-scoped key
  `hrt-u<account-id>-plan` was `[]`, while `hrt-plan` still held the two items.
  The plan was never moved.
- Consequences while signed in:
  - Overview lost every plan card ("Due today" / "Took it").
  - Supplies reported "Not in the current regimen" because the derived regimens
    list was empty.
  - A complete backup exported while signed in contained
    `modes.transfem.plan.length === 0`, so the plan is silently omitted from the
    backup and from cloud sync.
- After signing out, the plan reappeared, proving it still exists only in the
  signed-out namespace.

Root cause: `src/hooks/useAppData.ts` `adoptSignedOutData()` moves only
`MODE_SUFFIXES` (`events`, `lab-results`, `dose-templates`, `quick-doses`,
`deletions`) and `SHARED_SUFFIXES` (weight, PK parameters, calibration,
birth year). `plan` and `supplies` are persisted under account-scoped keys but
are absent from both adoption lists, so the account scope starts empty for them.

Status: **Fixed.** `plan` and `supplies` are now part of `MODE_SUFFIXES` in
`src/hooks/useAppData.ts`, so first sign-in moves them into the account
namespace like doses and lab results. `e2e/scope-adoption.spec.ts` seeds a
signed-out plan and supply, asserts they move (not copy) into the account
namespace, checks the Overview card, and asserts the complete backup carries
both categories.

### F2 — Medium — "hrt-tool sign-in" is shown when the backend capability is disabled

Observed behaviour: Account → hrt-tool sign-in renders a page whose body reads
"Not found", and four requests return 404:

- `/api/hrt/status`
- `/api/hrt/requests`
- `/api/hrt/devices`
- `/api/hrt/trusted-ips`

`hrtCapability()` in `hrtPairing.ts` requires `HRT_RAW_ENABLED=1` and a
`HRT_SERVICE_TOKEN` of at least 16 characters. Neither is present in the local
`.dev.vars`, so the handler returns `null` and the Worker answers 404. The
Account entry is rendered unconditionally.

Status: **Fixed.** A public `GET /api/hrt/capability` now returns
`{ supported: boolean }` with `Cache-Control: no-store`. The Account page asks
for it and only renders the hrt-tool entry when `supported` is true; the
required variables are documented in `SECURITY.md`. Covered by the API
assertion in `e2e/backend-security.spec.ts` and
`e2e/hrt-capability.spec.ts`.

### F3 — Low — Missing avatars produce repeated 404 console errors

Every Account render requests
`/api/user/avatar/<username>?t=<timestamp>` and logged a 404 when the user had
no avatar. The UI correctly fell back to the username initial, but the session
accumulated more than 20 such console errors.

Status: **Fixed.** The Worker now answers **204 No Content** for an existing
account with no stored avatar; unknown usernames and traversal attempts still
get 404. The client's existing `onError` fallback keeps the initial. Covered by
the avatar test in `e2e/backend-security.spec.ts`.

### F4 — Not a product bug — Collapsed forms in the Playwright snapshot

The smoke test's accessibility snapshot listed inputs for collapsed add forms.
The product already marks those wrappers with the `inert` attribute
(`inertWhen(...)` in the Supplies, Labs, History, Plan, DoseForm and guide-fold
components). A targeted browser check (`e2e/disclosure-inert.spec.ts`) confirms
the attribute is present and the DOM `inert` property is true, so browsers
remove the subtree from focus and the accessibility tree. Playwright's YAML
aria snapshot includes inert content, which is what the smoke run recorded.
No product change was made; the regression check is kept.

### F5 — Low — Validation and console-noise details

- Edit Username accepted a one-character name in the client (Save enabled) and
  only failed on the server with a 400 "Invalid username".
  **Fixed:** `src/utils/username.ts` mirrors the server's 3–30 character
  letter/number/underscore/hyphen rule; the page disables Save, shows a
  translated hint and marks the field `aria-invalid`. Covered by
  `tests/username.test.ts` and `e2e/profile-validation.spec.ts`.
- Pasting invalid JSON into Import logged an uncaught `SyntaxError` stack from
  `importEventsFromJson` even though the user received the friendly "Import
  failed" alert. **Fixed:** the catch now logs one concise warning instead of
  the parse stack. Covered by `e2e/import-error-logging.spec.ts`.
- Expected API failures (wrong password, invalid TOTP code, invalid F2F key,
  deleted-account login) still appear as browser console errors. This is normal
  for HTTP 4xx responses and is informational only.

### F6 — Production CSP blocks Cloudflare-injected scripts

`https://hrt.mahiro.uk/` returns HTTP 200 and the application renders. Two
Content Security Policy violations appear in the console:

1. `https://static.cloudflareinsights.com/beacon.min.js/...` is blocked by
   `script-src 'self'`.
2. An inline script injected by Cloudflare at `index.html` line 40 (the
   `/cdn-cgi/challenge-platform/scripts/jsd/main.js` bootstrap) is blocked
   because the policy has no nonce or hash for it.

The policy header is:
`default-src 'self'; script-src 'self'; worker-src 'self' blob:; ...`.

The app itself still boots. Cloudflare Web Analytics and the injected JS
detection/challenge bootstrap do not run.

Status: **Documented, deployment action required.** `SECURITY.md` now tells
self-hosters to disable those Cloudflare features for the zone or supply a
nonce/hash through their CSP setup, and explicitly not to add
`'unsafe-inline'`. The strict policy in `worker.ts` was intentionally left
unchanged; the fix belongs in the Cloudflare zone configuration.

## Feature checklist

| Feature                                                                                                   | Result                                        |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| First-run onboarding: language, HRT mode, how-it-works cards, weight, add drug, data warning, get started | Pass                                          |
| Language switching (English ↔ 简体中文, all seven languages listed)                                       | Pass                                          |
| Overview: current estimate, info modal, 7d/30d/All timeline, dose heatmap, prediction                     | Pass                                          |
| Log a dose: time, route (injection/oral/sublingual/gel/patch), compound, dose, E2 equivalent, usage notes | Pass                                          |
| Dose history: edit expansion, select/bulk-delete UI, batch-add toggle, templates UI                       | Pass                                          |
| Medication plan: add injection + oral drugs, plan page, delete/save controls                              | Pass, but F1 hides it after sign-in           |
| What-if: Plan A/B, add plan, replace-regimen switch, 4/8/12-week tabs, statistics                         | Pass                                          |
| Supplies: add vial supply, remaining count, warn-ahead tabs                                               | Pass, but F1 reports "not in current regimen" |
| Labs: add estradiol/testosterone results, unit toggles, test method, copy as table                        | Pass                                          |
| Calibration settings: Off / Hybrid-MIPD / EKF / OU-Kalman, retrospective/forward                          | Pass                                          |
| Export: complete backup, JSON, encrypted JSON with generated password, CSV, PDF                           | Pass (files validated)                        |
| Import: encrypted JSON decrypt + replace, invalid JSON handling, complete-backup replace                  | Pass                                          |
| Share: password-protected link, correct/wrong password, revoke; live link; public page                    | Pass                                          |
| Account: sign up, sign in/out, rename (valid/invalid), change password (mismatch/success)                 | Pass                                          |
| Account: TOTP setup and invalid-code handling, passkey tab, active sessions                               | Pass (no physical authenticator/passkey used) |
| Account: F2F CLI login code, invalid public-key validation                                                | Pass                                          |
| Account: hrt-tool sign-in                                                                                 | Hidden when capability is off (F2)            |
| Account: cloud backup save, list, merge preview/merge, delete one backup                                  | Pass                                          |
| Account: avatar upload and crop                                                                           | Pass                                          |
| Account: delete account, signed out, deleted credentials rejected on sign-in                              | Pass                                          |
| Settings: HRT mode, weight, age adjustment, PK parameter view                                             | Pass                                          |
| Settings: appearance Light/Dark/System/Black & White                                                      | Pass                                          |
| Settings: developer mode, cat states, San Bei Hou Mo easter egg                                           | Pass                                          |
| Settings: transparency, credits, disclaimer, show intro again                                             | Pass                                          |
| Settings: clear all dose records (labs kept)                                                              | Pass                                          |

## Build and test results

Website:

- `npm run build` — pass. Warnings: the main bundle is 1.585 MB (500 kB gzip)
  and `@noble/hashes/sha2.js` is both statically and dynamically imported.
- `npm test` — 29 test files passed, 554 tests passed, 4 expected failures.
- `npm run test:e2e` — 20 / 20 tests passed in 3.0 minutes.
- `npx tsc --noEmit` — pass.
- `npm run lint` — 0 errors, 266 warnings (mostly `@typescript-eslint/no-explicit-any`).
- `npm run format:check` — pass after Playwright MCP artifacts were removed
  from the working tree. The initial failure was entirely generated
  `.playwright-mcp` snapshot files, not source files.

Tools (`/home/haiyan/git/Oyama-s-HRT-Tracker-Tools`, `5caaecb`):

- `./configure --build-dir=build --enable-werror` — pass.
- `cmake --build build` — pass.
- `ctest --test-dir build --output-on-failure` — 2 / 2 passed
  (`native.header.c`, `native.header.cpp`).
- `go test -count=1 ./...` — pass (15.1 s).
- `go vet ./...` — pass.
- `go build ./...` — pass.

Note: the native core is Milestone 0 (public header and package contract only);
there is no compiled native library yet by design.

## Fixes applied

- `src/hooks/useAppData.ts` — adopt `plan` and `supplies` into the account
  namespace on first sign-in (F1).
- `worker.ts`, `src/services/hrt.ts`, `src/pages/Account.tsx` — public
  `/api/hrt/capability` plus capability-gated hrt-tool entry (F2).
- `worker.ts` — 204 for an existing account with no avatar, 404 unchanged for
  unknown users (F3).
- `src/utils/username.ts`, `src/pages/EditProfile.tsx`,
  `src/i18n/translations.ts` — client-side username rule and hint (F5).
- `src/App.tsx` — concise malformed-import log instead of a parse stack (F5).
- `SECURITY.md` — Cloudflare CSP and hrt-tool environment notes (F2, F6).
- New regression tests: `e2e/scope-adoption.spec.ts`,
  `e2e/hrt-capability.spec.ts`, `e2e/profile-validation.spec.ts`,
  `e2e/import-error-logging.spec.ts`, `e2e/disclosure-inert.spec.ts`,
  `tests/username.test.ts`.

## Artifacts

Screenshots are in `docs/smoke-test-2026-10-20/`:

- `smoke-01-overview-empty.png`
- `smoke-02-overview-after-dose.png`
- `smoke-03-whatif.png`
- `smoke-04-whatif-bottom.png`
- `smoke-05-share-view.png`
- `smoke-06-supplies.png`
- `smoke-07-dark-theme.png`
- `smoke-08-bw-theme.png`
- `smoke-09-labs-form.png`
- `smoke-10-production.png`

## Reproduction notes

1. Start the API: `bash e2e/start-worker.sh`
2. Start the frontend: `npx vite --host 127.0.0.1 --port 3000`
3. Drive `http://127.0.0.1:3000` with Playwright MCP or
   `npm run test:e2e`.
4. To exercise hrt-tool sign-in locally, set `HRT_RAW_ENABLED=1` and a
   `HRT_SERVICE_TOKEN` of at least 16 characters in `.dev.vars`.
5. The transient account and its local D1 data were deleted when the test
   Worker stopped; no production account or data was created.
