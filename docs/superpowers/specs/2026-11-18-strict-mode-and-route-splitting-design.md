# TypeScript Strict Mode and Route-Level Code Splitting

Date: 2026-11-18
Status: Proposed
Scope: Two sequential quality changes to the web client and the Worker's shared types.

## 1. Why

Two findings from the 2026-11-18 codebase review are cheap to fix and have a large payoff.

### 1.1 TypeScript strict mode is off

`tsconfig.json` sets neither `strict` nor `noUncheckedIndexedAccess`. CI runs `npx tsc --noEmit`, so the compiler currently accepts nullable values in code that handles PK math, backup parsing, and authentication.

`npx tsc --noEmit --strict` reports exactly 27 errors:

| Area                                   | Errors | Cause                                                                                             |
| -------------------------------------- | -----: | ------------------------------------------------------------------------------------------------- |
| `worker.ts`                            |     10 | `RequestContext.jsonError` is typed `code: string`, but the real `jsonError` takes `ApiErrorCode` |
| `tests/backupBundle.test.ts`           |      8 | `mergeCompleteBackupBundleToStorage(...).modes` is a `Partial<Record<ModeKey, ...>>`              |
| `src/domain/transfem/e2-injection.ts`  |      4 | an `Ester` index into tables that only list E2/EB/EV/EC/EN/EU                                     |
| `src/domain/transfem/e2-sublingual.ts` |      1 | the same `EsterPK.k2` table                                                                       |
| `src/utils/backupBundle.ts`            |      1 | `blockRaw.deletions` stays `unknown` inside a closure                                             |
| `src/utils/authError.ts`               |      1 | `lang?: string` indexes `Record<Lang, string>`                                                    |
| `src/pages/ShareSettings.tsx`          |      1 | `formatStamp(..., lang: string)` indexes `LOCALE_MAP`                                             |
| `src/pages/TwoFactor.tsx`              |      1 | `setTotpEnabled(s.totp)` receives `boolean \| undefined`                                          |

The Worker union is also incomplete: `jsonError` is called with `ACCOUNT_MEMORIAL`, `MIGRATION_REQUIRED`, `STEP_UP_REQUIRED`, `UNAVAILABLE`, `UPSTREAM_ERROR`, `ADMIN_REAUTH_REQUIRED`, and `NOT_CONFIGURED`, none of which are in `ApiErrorCode`. The `string` annotation is what hides that.

### 1.2 The first screen downloads every page

`src/App.tsx` statically imports 40 page modules. The built entry is 2.4 MB raw, 758,416 bytes gzip (740.6 KiB). It contains `jsPDF` (used only by `ExportSettings` → `ExportSection`) and KaTeX (used only by `PKVisualization` → `ExplainMath`). The PWA precaches 78 files, about 9.5 MB.

`OpSec.tsx` already shows the intended pattern: `mermaidPromise ??= import('mermaid')`.

## 2. Goals

1. Turn on `strict: true` without changing runtime behavior, after fixing the 27 errors.
2. Load every page except `Home`, `Onboarding`, and `PublicShare` through `React.lazy`.
3. Keep the PWA fully offline-capable: every built JS asset must stay in the Workbox precache.
4. Make a stale-chunk failure recover once, then fall through to the existing `ErrorBoundary` instead of a blank page.
5. Enforce the improvement with a CI bundle budget and a precache-coverage check.

## 3. Non-goals

- `noUncheckedIndexedAccess` or any other new strictness flag.
- Mobile Playwright projects, coverage thresholds, Dockerfile changes, root-module moves, PK global-parameter refactoring, i18n file splitting.
- Any change to URLs, history entries, storage keys, export formats, or API responses.
- Lazy-loading `Home`, `Onboarding`, or `PublicShare`.
- New runtime dependencies.

## 4. Constraints

- `ApiErrorCode` in `worker.ts` is the single list of Worker error codes. Every `jsonError` literal must be a member.
- `RequestContext.jsonError` and `createRequestContext`'s `jsonErrorFn` must use `ApiErrorCode`, not `string`.
- The three ester PK tables become `Partial<Record<Ester, number>>`; every lookup keeps its existing `?? fallback`, so unmodelled esters still produce the same values as today.
- Lazy imports use one shared helper. The first chunk failure for a module reloads the page once per tab; a second failure throws to `ErrorBoundary`.
- `Home`, `Onboarding`, and `PublicShare` stay eager. `Onboarding` is a first-run screen; `PublicShare` is a separate `/share` entry.
- The entry chunk must be at most 550 KiB gzip, at least 25% below the 740.6 KiB baseline.
- `scripts/bundle-size.mjs` must fail when the entry exceeds the budget, and when any `dist/assets/*.js` is absent from `dist/sw.js`.
- Do not lower `maximumFileSizeToCacheInBytes` unless no built chunk exceeds the default 2 MiB. The precache check is the guard.
- Commands used by the plan: `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run size`, `npm run test:e2e`.

## 5. Acceptance criteria

- `npx tsc --noEmit` passes with `"strict": true` in `tsconfig.json`.
- `npx tsc --noEmit --strict` also passes (the flag is now redundant, not contradictory).
- Existing unit tests, lint, formatting, build, and the Playwright suite pass.
- `npm run size` reports an entry gzip at or below 550 KiB and confirms every built JS asset is precached.
- `src/App.tsx` has no static page imports except `Home`, `Onboarding`, and `PublicShare`.
- Opening `Settings → Data management → Export data` still works; `PKVisualization` and `OpSec` still work.
- No change to user-visible copy except the new transient "Loading…" label.

## 6. Coordination

The heads-up issue draft is at
`docs/superpowers/issues/2026-11-18-strict-mode-and-route-splitting.md`.
It lists the hot files and the rules for new pages, error codes, and ester tables.
