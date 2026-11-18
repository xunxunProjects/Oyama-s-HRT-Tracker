# TypeScript Strict Mode and Route-Level Code Splitting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable TypeScript `strict` without behavior changes, then move every page except `Home`, `Onboarding`, and `PublicShare` behind `React.lazy` so the entry bundle and first paint shrink.

**Architecture:** Phase 1 completes the Worker's `ApiErrorCode` union, types the ester PK tables as partial maps, fixes the remaining nullable/index errors, then flips `strict: true`. Phase 2 adds a single `src/routes/lazyPages.ts` registry, a guarded one-time reload for stale chunks, a shared Suspense fallback, and a CI check that enforces the entry budget and PWA precache completeness.

**Tech Stack:** React 18, TypeScript 5.8, Vite 6, Vitest, Workbox (`vite-plugin-pwa`), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-18-strict-mode-and-route-splitting-design.md`

## Global Constraints

- Baseline to beat: entry gzip **758,416 bytes (740.6 KiB)**; **27** strict errors; **40** static page imports in `src/App.tsx`.
- Do not add `noUncheckedIndexedAccess` or any compiler flag other than `strict`.
- Do not change storage keys, URLs, history behavior, export formats, or API response bodies.
- Keep `Home`, `Onboarding`, and `PublicShare` eager; lazy-load the other 37 pages.
- Keep every existing ester-table fallback (`?? 0`, `?? 0.5`, etc.); the partial typing must not change model output.
- `ApiErrorCode` in `worker.ts` is the only list of Worker error codes. Every `jsonError` literal must be a member.
- Every built `dist/assets/*.js` must appear in `dist/sw.js`; the PWA must stay fully offline-capable.
- Entry budget: **550 KiB gzip**, enforced by `npm run size`.
- No new runtime dependencies.
- Commands: `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run size`, `npm run test:e2e`.

## Review Focus

- **Stale chunk after a deploy:** the first failed page import reloads once; a second failure shows `ErrorBoundary`, not a blank screen. Pinned by `tests/lazyWithRetry.test.ts`.
- **Back/Forward onto a lazy page:** the chunk loads and the page renders after history navigation. Pinned by `e2e/lazy-routes.spec.ts`.
- **Heavy libraries leave the entry:** `jsPDF` and KaTeX move into lazy chunks, and the Export/PK pages still work. Pinned by the build grep step and `e2e/pk-visualization.spec.ts`.
- **Offline completeness:** a page chunk dropped by Workbox's size limit fails `npm run size`. Pinned by `scripts/bundle-size.mjs`.
- **Unknown ester values:** an ester absent from a PK table still receives its documented fallback, not `NaN` or `0` by accident. Pinned by `tests/routes.test.ts`, `tests/params-and-units.test.ts`, and `tests/literature.test.ts`.
- **New Worker error code:** adding a `jsonError('…')` outside `ApiErrorCode` fails typecheck. Pinned by the Task 1 strict run.

---

## File Structure

**Phase 1 — strict**

- Modify `worker.ts` — complete `ApiErrorCode`; narrow `RequestContext.jsonError` and `createRequestContext`'s `jsonErrorFn`.
- Modify `src/domain/constants.ts` — type the three ester PK tables as `Partial<Record<Ester, number>>`.
- Modify `src/domain/transfem/e2-injection.ts` — add the E2 fallback required by the partial table.
- Modify `src/utils/backupBundle.ts` — alias `blockRaw.deletions` before narrowing.
- Modify `src/utils/authError.ts`, `src/pages/ShareSettings.tsx`, `src/pages/TwoFactor.tsx` — `Lang` types and a `?? false`.
- Modify `tests/backupBundle.test.ts` — a `modeOf` helper for the partial merge result.
- Modify `tsconfig.json` — `"strict": true`.

**Phase 2 — route splitting**

- Create `src/utils/lazyWithRetry.ts` — one-time reload helper plus `lazyWithRetry`.
- Create `tests/lazyWithRetry.test.ts` — reload-once semantics.
- Create `src/components/PageLoading.tsx` — shared Suspense fallback.
- Modify `src/i18n/translations.ts`, `src/i18n/ru.ts`, `src/i18n/uk.ts` — `common.loading` in all locales.
- Modify `tests/translations.test.ts` — assert the loading label in every locale.
- Create `src/routes/lazyPages.ts` — the 37 lazy page exports.
- Create `tests/lazyPages.test.ts` — every export is a `React.lazy` component.
- Modify `src/App.tsx` — lazy imports and the Suspense boundary.
- Create `e2e/lazy-routes.spec.ts` — Back/Forward onto a lazy page.
- Create `scripts/bundle-size.mjs` — entry budget and precache coverage.
- Modify `package.json` — `size` script.
- Modify `.github/workflows/ci.yml` — run `npm run size` after the build.
- Modify `vite.config.ts` — drop the 4 MiB override only when no chunk needs it.

---

### Task 1: Complete the Worker error-code union

**Files:**

- Modify: `worker.ts:116`, `worker.ts:129`, `worker.ts:156-176`

**Interfaces:**

- Produces: `ApiErrorCode` additionally contains `'ACCOUNT_MEMORIAL' | 'MIGRATION_REQUIRED' | 'STEP_UP_REQUIRED' | 'UNAVAILABLE' | 'UPSTREAM_ERROR' | 'ADMIN_REAUTH_REQUIRED' | 'NOT_CONFIGURED'`.
- Produces: `RequestContext.jsonError: (code: ApiErrorCode, message: string, status: number, extraHeaders?: Record<string, string>) => Response`.
- Produces: `createRequestContext(..., jsonErrorFn: (code: ApiErrorCode, ...) => Response, ...)`.

- [ ] **Step 1: Record the failing typecheck**

Run:

```bash
npx tsc --noEmit --strict 2>&1 | tee /tmp/strict-before.txt
npx tsc --noEmit --strict 2>&1 | grep -c '^worker.ts'
```

Expected: 27 error lines total; the worker count is `10`.

- [ ] **Step 2: Add the seven missing codes to `ApiErrorCode`**

The union currently ends with `'INTERNAL'`. Add these members next to their related codes:

```ts
    | 'ACCOUNT_LOCKED'
    | 'ACCOUNT_MEMORIAL'
    // ...
    | 'SCHEMA_OUTDATED'
    | 'MIGRATION_REQUIRED'
    | 'SERVICE_UNAVAILABLE'
    | 'UNAVAILABLE'
    | 'UPSTREAM_ERROR'
    | 'NOT_IMPLEMENTED'
    | 'NOT_CONFIGURED'
    | 'STEP_UP_REQUIRED'
    | 'ADMIN_REAUTH_REQUIRED'
    | 'INTERNAL';
```

These are the seven literal codes used by `jsonError` that the union lacked; narrowing the signature also exposes `ADMIN_REAUTH_REQUIRED` and `NOT_CONFIGURED` in `src/server/routes/admin.ts`. `NO_SNAPSHOT` stays even though no current `jsonError` literal uses it.

- [ ] **Step 3: Narrow the two function signatures**

Change `code: string` to `code: ApiErrorCode` in both places:

```ts
jsonError: (code: ApiErrorCode, message: string, status: number, extraHeaders?: Record<string, string>) => Response;
```

```ts
    jsonErrorFn: (code: ApiErrorCode, message: string, status: number, extraHeaders?: Record<string, string>) => Response,
```

- [ ] **Step 4: Verify the worker errors are gone**

Run:

```bash
npx tsc --noEmit --strict 2>&1 | grep '^worker.ts'
npx tsc --noEmit --strict 2>&1 | wc -l
```

Expected: the first command prints nothing; the second prints `17`.

- [ ] **Step 5: Run the unit tests and commit**

Run `npm test`. Expected: all tests pass.

```bash
git add worker.ts
git commit -m "chore(types): complete Worker error-code union"
```

---

### Task 2: Type ester PK tables as partial maps

**Files:**

- Modify: `src/domain/constants.ts:174-215`
- Modify: `src/domain/transfem/e2-injection.ts:15`
- Test: `tests/routes.test.ts`, `tests/params-and-units.test.ts`, `tests/literature.test.ts`

**Interfaces:**

- Produces: `TwoPartDepotPK.Frac_fast`, `.k1_fast`, `.k1_slow`, `InjectionPK.formationFraction`, and `EsterPK.k2` are `Partial<Record<Ester, number>>`.
- Produces: `_getE2InjFF` still returns `1` for `Ester.E2`; every other path is unchanged.

- [ ] **Step 1: Confirm the five failing errors**

Run:

```bash
npx tsc --noEmit --strict 2>&1 | grep -E 'e2-(injection|sublingual)'
```

Expected: 5 TS7053 errors, all about `Ester.CPA` indexing a table without that property.

- [ ] **Step 2: Add the table type and annotate the three constants**

Near the top of `src/domain/constants.ts`, after the imports, add:

```ts
/** Only the esters with a PK entry appear; callers supply their own fallback. */
type EsterRateTable = Partial<Record<Ester, number>>;
```

Annotate the three exports:

```ts
export const TwoPartDepotPK: {
    Frac_fast: EsterRateTable;
    k1_fast: EsterRateTable;
    k1_slow: EsterRateTable;
} = {
```

```ts
export const InjectionPK: { formationFraction: EsterRateTable } = {
```

```ts
export const EsterPK: { k2: EsterRateTable } = {
```

Leave every table value untouched.

- [ ] **Step 3: Supply the E2 fallback in `_getE2InjFF`**

Because the table is now partial, the known-present E2 entry needs an explicit fallback. Change:

```ts
if (ester === Ester.E2) return InjectionPK.formationFraction[Ester.E2];
```

to:

```ts
if (ester === Ester.E2) return InjectionPK.formationFraction[Ester.E2] ?? 1;
```

The table's E2 value is `1.0`; `?? 1` only satisfies the compiler and keeps the result identical.

- [ ] **Step 4: Verify types and model behavior**

Run:

```bash
npx tsc --noEmit --strict 2>&1 | grep -E 'e2-(injection|sublingual)'
npx vitest run tests/routes.test.ts tests/params-and-units.test.ts tests/literature.test.ts
```

Expected: the grep prints nothing; all three test files pass.

- [ ] **Step 5: Commit**

```bash
git add src/domain/constants.ts src/domain/transfem/e2-injection.ts
git commit -m "chore(types): allow partial ester PK tables"
```

---

### Task 3: Fix the remaining strict errors

**Files:**

- Modify: `src/utils/authError.ts:2-16`
- Modify: `src/pages/ShareSettings.tsx:30-54`
- Modify: `src/pages/TwoFactor.tsx:180`
- Modify: `src/utils/backupBundle.ts:1195-1207`
- Test: `tests/backupBundle.test.ts:279-378`

**Interfaces:**

- Produces: `describeAuthError(err: unknown, t: (key: string) => string, lang?: Lang)`.
- Produces: `formatStamp(timestamp: number, lang: Lang)`.
- Produces: `mergeCompleteBackupBundleToStorage(...).modes[key]` is checked through a test-local `modeOf` helper.

- [ ] **Step 1: Confirm the remaining errors**

Run:

```bash
npx tsc --noEmit --strict 2>&1 | grep -vE '^worker.ts|e2-(injection|sublingual)'
```

Expected: 12 errors in `authError.ts`, `ShareSettings.tsx`, `TwoFactor.tsx`, `backupBundle.ts`, and `tests/backupBundle.test.ts`.

- [ ] **Step 2: Use `Lang` in the two locale indexers**

In `src/utils/authError.ts`, add:

```ts
import type { Lang } from '../i18n/translations';
```

and change the signature to:

```ts
export const describeAuthError = (err: unknown, t: (key: string) => string, lang?: Lang): string => {
```

In `src/pages/ShareSettings.tsx`, add the same type import and change:

```ts
const formatStamp = (timestamp: number, lang: Lang): string =>
```

Both call sites already pass the `lang` from `useTranslation()`, which is a `Lang`.

- [ ] **Step 3: Default the 2FA status to `false`**

In `src/pages/TwoFactor.tsx`, change:

```ts
setTotpEnabled(s.totp);
```

to:

```ts
setTotpEnabled(s.totp ?? false);
```

`TwoFAStatus.totp` is optional; `undefined` already followed the `if (!s.totp) initSetup()` path, so this preserves behavior.

- [ ] **Step 4: Alias the deletions value before narrowing**

In `src/utils/backupBundle.ts`, replace the block at lines 1195-1207 with:

```ts
const deletions = blockRaw.deletions;
if (deletions === undefined) {
  missing.push(`${mode}.deletions`);
} else {
  if (isObject(deletions)) {
    const total = ['events', 'labResults', 'doseTemplates'].reduce((sum, kind) => {
      const map = deletions[kind];
      const count = isObject(map) ? Object.keys(map).length : 0;
      categoryCounts[`${mode}.deletions.${kind}`] = count;
      return sum + count;
    }, 0);
    categoryCounts[`${mode}.deletions`] = total;
  }
  const tombstones = validateTombstones(deletions, `${mode}.deletions`, now);
  for (const kind of ['events', 'labResults', 'doseTemplates'] as const) {
    tombstoneDrops[`${mode}.deletions.${kind}`] = tombstones.drops[kind];
  }
  tombstoneNotes.push(...tombstones.notes);
  if (tombstones.errors.length > 0) categoryErrors[`${mode}.deletions`] = tombstones.errors;
  else block.deletions = tombstones.value;
}
```

Keep the tombstone loop and the closing brace exactly as they are; only the alias and the renamed `blockRaw.deletions` references change. The alias keeps the narrowed type inside the `reduce` callback. No runtime value changes.

- [ ] **Step 5: Add the test helper and replace the eight unchecked accesses**

At module scope in `tests/backupBundle.test.ts`, after the fixture constants, add:

```ts
const modeOf = (result: ReturnType<typeof mergeCompleteBackupBundleToStorage>, key: ModeKey) => {
  const mode = result.modes[key];
  if (!mode) throw new Error(`merge result has no ${key} mode`);
  return mode;
};
```

Replace the eight `result.modes.*` / `merged.modes.*` / `invalidMerge.modes.*` accesses with `modeOf(result, 'transfem')`, `modeOf(result, 'transmasc')`, and so on. The affected lines are 279, 280, 318, 341, 349, 350, 377, and 378. For example:

```ts
expect(modeOf(result, 'transfem').events?.[0].id).toBe('tf-e1');
expect(modeOf(result, 'transmasc').events?.[0].id).toBe('tm-e1');
```

- [ ] **Step 6: Verify zero strict errors**

Run:

```bash
npx tsc --noEmit --strict 2>&1 | wc -l
npx vitest run tests/backupBundle.test.ts
```

Expected: `0` and all backup tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/utils/authError.ts src/pages/ShareSettings.tsx src/pages/TwoFactor.tsx src/utils/backupBundle.ts tests/backupBundle.test.ts
git commit -m "chore(types): fix remaining strict errors"
```

---

### Task 4: Turn on strict mode

**Files:**

- Modify: `tsconfig.json`

**Interfaces:**

- Produces: `tsconfig.json` contains `"strict": true`; no other compiler option changes.

- [ ] **Step 1: Add the flag**

In `tsconfig.json`, after `"skipLibCheck": true`, add:

```json
    "strict": true,
```

Do not add `noUncheckedIndexedAccess`.

- [ ] **Step 2: Run the full phase-1 gate**

Run, in order:

```bash
npx tsc --noEmit
npx tsc --noEmit --strict
npm run lint
npm run format:check
npm test
npm run build
```

Expected: every command exits 0. The two typechecks are now equivalent.

- [ ] **Step 3: Commit**

```bash
git add tsconfig.json
git commit -m "chore(types): enable TypeScript strict mode"
```

---

### Task 5: Add the lazy-chunk reload helper

**Files:**

- Create: `src/utils/lazyWithRetry.ts`
- Test: `tests/lazyWithRetry.test.ts`

**Interfaces:**

- Produces: `shouldReloadForChunkFailure(moduleId: string, storage: Pick<Storage, 'getItem' | 'setItem'>, reload: () => void): boolean`.
- Produces: `lazyWithRetry<P>(importer: () => Promise<{ default: ComponentType<P> }>, moduleId: string): LazyExoticComponent<ComponentType<P>>`.

- [ ] **Step 1: Write the failing test**

Create `tests/lazyWithRetry.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { shouldReloadForChunkFailure } from '../src/utils/lazyWithRetry';

const memoryStorage = (): Pick<Storage, 'getItem' | 'setItem'> => {
  const values = new Map<string, string>();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
};

describe('lazy chunk reload', () => {
  it('reloads once for a module whose chunk failed', () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    expect(shouldReloadForChunkFailure('Plan', storage, reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.getItem('hrt-chunk-reload')).toBe('Plan');
  });

  it('does not reload twice for the same module in one session', () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    shouldReloadForChunkFailure('Plan', storage, reload);
    expect(shouldReloadForChunkFailure('Plan', storage, reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads for a different module', () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    shouldReloadForChunkFailure('Plan', storage, reload);
    expect(shouldReloadForChunkFailure('Settings', storage, reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run `npx vitest run tests/lazyWithRetry.test.ts`.

Expected: FAIL because `src/utils/lazyWithRetry.ts` does not exist.

- [ ] **Step 3: Implement the helper**

Create `src/utils/lazyWithRetry.ts`:

```ts
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const RELOAD_FLAG = 'hrt-chunk-reload';

/**
 * A deploy removes the old hashed chunks. If a page's import fails, reload
 * once for that page; the new build serves the current chunk. A second
 * failure means a reload will not help, so let the ErrorBoundary show it.
 */
export function shouldReloadForChunkFailure(
  moduleId: string,
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  reload: () => void,
): boolean {
  if (storage.getItem(RELOAD_FLAG) === moduleId) return false;
  storage.setItem(RELOAD_FLAG, moduleId);
  reload();
  return true;
}

export function lazyWithRetry<P>(
  importer: () => Promise<{ default: ComponentType<P> }>,
  moduleId: string,
): LazyExoticComponent<ComponentType<P>> {
  return lazy(() =>
    importer().catch(error => {
      try {
        if (shouldReloadForChunkFailure(moduleId, sessionStorage, () => window.location.reload())) {
          return new Promise<never>(() => {});
        }
      } catch {
        // Private mode can make storage throw. Fall through to the ErrorBoundary.
      }
      throw error;
    }),
  );
}
```

The never-resolving promise keeps React from rendering an error while the reload navigates away.

- [ ] **Step 4: Run the test to verify it passes**

Run `npx vitest run tests/lazyWithRetry.test.ts`.

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/lazyWithRetry.ts tests/lazyWithRetry.test.ts
git commit -m "feat(build): reload once when a lazy chunk is stale"
```

---

### Task 6: Add the shared page-loading fallback

**Files:**

- Create: `src/components/PageLoading.tsx`
- Modify: `src/i18n/translations.ts`
- Modify: `src/i18n/ru.ts`, `src/i18n/uk.ts`
- Test: `tests/translations.test.ts`

**Interfaces:**

- Produces: `PageLoading` default export; a `role="status"` region with a translated `common.loading` label.
- Produces: `common.loading` in all nine locale packs.

- [ ] **Step 1: Write the failing translation test**

In `tests/translations.test.ts`, after the `language packs` describe block, add:

```ts
describe('loading copy', () => {
  const locales = ['en', 'zh', 'zh-TW', 'yue', 'ja', 'ko', 'tr', 'ru', 'uk'] as const;

  for (const lang of locales) {
    it(`${lang} has a loading label`, () => {
      const pack = TRANSLATIONS[lang] as Record<string, string>;
      expect(pack['common.loading']).toBeTruthy();
    });
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run `npx vitest run tests/translations.test.ts`.

Expected: 9 failures for the missing `common.loading` key (the Russian/Ukrainian key-parity tests may also fail until Step 4).

- [ ] **Step 3: Create the component**

Create `src/components/PageLoading.tsx`:

```tsx
import { Busy } from './icons';
import { useTranslation } from '../contexts/LanguageContext';

const PageLoading = () => {
  const { t } = useTranslation();
  return (
    <div role="status" className="flex-1 flex items-center justify-center p-8 text-[var(--text-muted)]">
      <Busy size={24} className="animate-spin" aria-hidden="true" />
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  );
};

export default PageLoading;
```

- [ ] **Step 4: Add the key to every locale**

Add one line to each pack:

| Pack                   | Value                                |
| ---------------------- | ------------------------------------ |
| `TRANSLATIONS_BASE.zh` | `'common.loading': '加载中…',`       |
| `ZH_TW`                | `'common.loading': '載入中…',`       |
| `en`                   | `'common.loading': 'Loading…',`      |
| `ja`                   | `'common.loading': '読み込み中…',`   |
| `ko`                   | `'common.loading': '불러오는 중…',`  |
| `tr`                   | `'common.loading': 'Yükleniyor…',`   |
| `src/i18n/ru.ts`       | `'common.loading': 'Загрузка…',`     |
| `src/i18n/uk.ts`       | `'common.loading': 'Завантаження…',` |

`yue` spreads `ZH_TW`, so it inherits `載入中…`; do not add a separate line.

- [ ] **Step 5: Verify**

Run:

```bash
npx vitest run tests/translations.test.ts
npx tsc --noEmit
```

Expected: all translation tests pass (including ru/uk key parity), typecheck passes.

- [ ] **Step 6: Commit**

```bash
git add src/components/PageLoading.tsx src/i18n/translations.ts src/i18n/ru.ts src/i18n/uk.ts tests/translations.test.ts
git commit -m "feat(ui): add a translated page-loading fallback"
```

---

### Task 7: Lazy-load every page except Home, Onboarding, and PublicShare

**Files:**

- Create: `src/routes/lazyPages.ts`
- Create: `tests/lazyPages.test.ts`
- Create: `e2e/lazy-routes.spec.ts`
- Modify: `src/App.tsx`

**Interfaces:**

- Produces: 37 named exports from `src/routes/lazyPages.ts`, all `LazyExoticComponent`s: `Plan`, `Forecast`, `Supplies`, `History`, `Lab`, `CalibrationSettings`, `Settings`, `Account`, `Admin`, `SessionsPage`, `HrtSecurityPage`, `F2fPage`, `TwoFactorPage`, `ChangePasswordPage`, `DeleteAccountPage`, `EditProfilePage`, `EditAvatarPage`, `PKParamsPage`, `HRTModeSettings`, `LanguageSettings`, `AppearanceSettings`, `WeightSettings`, `AgeSettings`, `ExportSettings`, `ImportSettings`, `TransparencySettings`, `Credits`, `CommunityVote`, `Disclaimer`, `OpSec`, `PKDemos`, `ModelGuide`, `CalibrationGuide`, `MilkTeaEasterEgg`, `CatStates`, `Simulator`, `ShareSettings`.
- Keeps: `Home`, `Onboarding`, `PublicShare` statically imported in `App.tsx`.

- [ ] **Step 1: Write the failing lazy-registry test**

Create `tests/lazyPages.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import * as pages from '../src/routes/lazyPages';

describe('lazy page routes', () => {
  it('exports only React.lazy components', () => {
    for (const [name, page] of Object.entries(pages)) {
      expect((page as { $$typeof?: symbol }).$$typeof, name).toBe(Symbol.for('react.lazy'));
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run `npx vitest run tests/lazyPages.test.ts`.

Expected: FAIL because `src/routes/lazyPages.ts` does not exist.

- [ ] **Step 3: Create the registry**

Create `src/routes/lazyPages.ts`:

```ts
import { lazyWithRetry } from '../utils/lazyWithRetry';

export const Plan = lazyWithRetry(() => import('../pages/Plan'), 'Plan');
export const Forecast = lazyWithRetry(() => import('../pages/Forecast'), 'Forecast');
export const Supplies = lazyWithRetry(() => import('../pages/Supplies'), 'Supplies');
export const History = lazyWithRetry(() => import('../pages/History'), 'History');
export const Lab = lazyWithRetry(() => import('../pages/Lab'), 'Lab');
export const CalibrationSettings = lazyWithRetry(() => import('../pages/CalibrationSettings'), 'CalibrationSettings');
export const Settings = lazyWithRetry(() => import('../pages/Settings'), 'Settings');
export const Account = lazyWithRetry(() => import('../pages/Account'), 'Account');
export const Admin = lazyWithRetry(() => import('../pages/Admin'), 'Admin');
export const SessionsPage = lazyWithRetry(() => import('../pages/Sessions'), 'Sessions');
export const HrtSecurityPage = lazyWithRetry(() => import('../pages/HrtSecurity'), 'HrtSecurity');
export const F2fPage = lazyWithRetry(() => import('../pages/F2f'), 'F2f');
export const TwoFactorPage = lazyWithRetry(() => import('../pages/TwoFactor'), 'TwoFactor');
export const ChangePasswordPage = lazyWithRetry(() => import('../pages/ChangePassword'), 'ChangePassword');
export const DeleteAccountPage = lazyWithRetry(() => import('../pages/DeleteAccount'), 'DeleteAccount');
export const EditProfilePage = lazyWithRetry(() => import('../pages/EditProfile'), 'EditProfile');
export const EditAvatarPage = lazyWithRetry(() => import('../pages/EditAvatar'), 'EditAvatar');
export const PKParamsPage = lazyWithRetry(() => import('../pages/PKParams'), 'PKParams');
export const HRTModeSettings = lazyWithRetry(() => import('../pages/HRTModeSettings'), 'HRTModeSettings');
export const LanguageSettings = lazyWithRetry(() => import('../pages/LanguageSettings'), 'LanguageSettings');
export const AppearanceSettings = lazyWithRetry(() => import('../pages/AppearanceSettings'), 'AppearanceSettings');
export const WeightSettings = lazyWithRetry(() => import('../pages/WeightSettings'), 'WeightSettings');
export const AgeSettings = lazyWithRetry(() => import('../pages/AgeSettings'), 'AgeSettings');
export const ExportSettings = lazyWithRetry(() => import('../pages/ExportSettings'), 'ExportSettings');
export const ImportSettings = lazyWithRetry(() => import('../pages/ImportSettings'), 'ImportSettings');
export const TransparencySettings = lazyWithRetry(
  () => import('../pages/TransparencySettings'),
  'TransparencySettings',
);
export const Credits = lazyWithRetry(() => import('../pages/Credits'), 'Credits');
export const CommunityVote = lazyWithRetry(() => import('../pages/CommunityVote'), 'CommunityVote');
export const Disclaimer = lazyWithRetry(() => import('../pages/Disclaimer'), 'Disclaimer');
export const OpSec = lazyWithRetry(() => import('../pages/OpSec'), 'OpSec');
export const PKDemos = lazyWithRetry(() => import('../pages/PKDemos'), 'PKDemos');
export const ModelGuide = lazyWithRetry(() => import('../pages/ModelGuide'), 'ModelGuide');
export const CalibrationGuide = lazyWithRetry(() => import('../pages/CalibrationGuide'), 'CalibrationGuide');
export const MilkTeaEasterEgg = lazyWithRetry(() => import('../pages/MilkTeaEasterEgg'), 'MilkTeaEasterEgg');
export const CatStates = lazyWithRetry(() => import('../pages/CatStates'), 'CatStates');
export const Simulator = lazyWithRetry(() => import('../pages/Simulator'), 'Simulator');
export const ShareSettings = lazyWithRetry(() => import('../pages/ShareSettings'), 'ShareSettings');
```

- [ ] **Step 4: Run the registry test**

Run `npx vitest run tests/lazyPages.test.ts`.

Expected: PASS with 37 exports.

- [ ] **Step 5: Replace the static imports in `src/App.tsx`**

Remove:

- `import Plan from './pages/Plan';` (line 9)
- `import Forecast from './pages/Forecast';` and `import Supplies from './pages/Supplies';` (lines 28-29)
- Every static import in the `// Pages` block except `Home`, `Onboarding` (keep its named exports `markOnboardingSeen`, `shouldShowOnboarding`), and `PublicShare`.

Add `Suspense` to the React import and import the fallback:

```tsx
import { Suspense, useState, useEffect, useMemo, useRef } from 'react';
import PageLoading from './components/PageLoading';
```

Add one lazy import block after the three eager page imports:

```tsx
import {
  Plan,
  Forecast,
  Supplies,
  History,
  Lab,
  CalibrationSettings,
  Settings,
  Account,
  Admin,
  SessionsPage,
  HrtSecurityPage,
  F2fPage,
  TwoFactorPage,
  ChangePasswordPage,
  DeleteAccountPage,
  EditProfilePage,
  EditAvatarPage,
  PKParamsPage,
  HRTModeSettings,
  LanguageSettings,
  AppearanceSettings,
  WeightSettings,
  AgeSettings,
  ExportSettings,
  ImportSettings,
  TransparencySettings,
  Credits,
  CommunityVote,
  Disclaimer,
  OpSec,
  PKDemos,
  ModelGuide,
  CalibrationGuide,
  MilkTeaEasterEgg,
  CatStates,
  Simulator,
  ShareSettings,
} from './routes/lazyPages';
```

`Home`, `Onboarding`, and `PublicShare` stay eager.

- [ ] **Step 6: Add the Suspense boundary**

Wrap the page conditionals inside the `mainScrollRef` div, without changing the div itself:

```tsx
                <div
                    ref={mainScrollRef}
                    key={currentView}
                    className={/* unchanged */}
                >
                    <Suspense fallback={<PageLoading />}>
                        {currentView === 'home' && (
                        /* ... all existing conditionals ... */
                        )}
                        {currentView === 'admin' && user?.isAdmin && (
                            <Admin onBack={() => handleViewChange('settings')} />
                        )}
                    </Suspense>
                </div>
```

Let Prettier reindent the block. Do not add a Suspense boundary around `Onboarding` or the `/share` branch; both stay eager.

- [ ] **Step 7: Add the Back/Forward browser test**

Create `e2e/lazy-routes.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { baseStorage, gotoApp, seedStorage } from './helpers';

test('a lazy page survives Back and Forward after its chunk loads', async ({ page, context }) => {
  await seedStorage(context, baseStorage());
  await gotoApp(page);

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Data management' }).click();
  await page.getByRole('button', { name: 'Export data', exact: true }).click();
  await expect(page.getByRole('button', { name: /Complete backup/ })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole('tab', { name: 'Data management' })).toBeVisible();

  await page.goForward();
  await expect(page.getByRole('button', { name: /Complete backup/ })).toBeVisible();
});
```

- [ ] **Step 8: Verify code splitting**

Run:

```bash
npx tsc --noEmit
npx vitest run tests/lazyPages.test.ts
npm run build
ENTRY=$(grep -o 'assets/index-[^"]*\.js' dist/index.html | head -1)
grep -c 'jsPDF' "dist/$ENTRY"
grep -c 'katex' "dist/$ENTRY"
```

Expected: typecheck passes; the registry test passes; the build succeeds; both `grep -c` commands print `0`.

- [ ] **Step 9: Run the focused browser tests**

Run:

```bash
npx playwright test e2e/lazy-routes.spec.ts e2e/pk-visualization.spec.ts e2e/opsec-mermaid.spec.ts e2e/disclosure-inert.spec.ts
```

Expected: all pass. `pk-visualization` exercises the KaTeX chunk; `opsec-mermaid` keeps the existing dynamic-import path working; `disclosure-inert` opens a lazy Settings page.

- [ ] **Step 10: Commit**

```bash
git add src/routes/lazyPages.ts src/App.tsx tests/lazyPages.test.ts e2e/lazy-routes.spec.ts
git commit -m "perf(web): split pages behind React.lazy"
```

---

### Task 8: Enforce the bundle budget and PWA precache coverage

**Files:**

- Create: `scripts/bundle-size.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml:59`
- Modify: `vite.config.ts:49-56`

**Interfaces:**

- Produces: `npm run size`, which exits non-zero when the entry gzip exceeds `BUNDLE_BUDGET_KB` (default `550`) or when a built JS asset is missing from `dist/sw.js`.
- Produces: a CI step that runs after `npm run build`.

- [ ] **Step 1: Write the script**

Create `scripts/bundle-size.mjs`:

```js
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const BUDGET_KB = 550;
const dist = 'dist';

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const match = html.match(/src="(?:\/)?(assets\/index-[^"]+\.js)"/);
if (!match) {
  console.error('bundle-size: could not find the entry script in dist/index.html');
  process.exit(1);
}

const entry = readFileSync(join(dist, match[1]));
const rawKiB = entry.length / 1024;
const gzipKiB = gzipSync(entry).length / 1024;
const budget = Number(process.env.BUNDLE_BUDGET_KB ?? BUDGET_KB);

console.log(`entry ${match[1]}: ${rawKiB.toFixed(1)} KiB raw, ${gzipKiB.toFixed(1)} KiB gzip`);
if (gzipKiB > budget) {
  console.error(`bundle-size: entry is ${gzipKiB.toFixed(1)} KiB gzip, over the ${budget} KiB budget`);
  process.exit(1);
}

const assets = readdirSync(join(dist, 'assets')).filter(file => file.endsWith('.js'));
const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
const missing = assets.filter(file => !sw.includes(file));
if (missing.length > 0) {
  console.error(`bundle-size: ${missing.length} JS asset(s) missing from the precache:`);
  for (const file of missing) console.error(`  ${file}`);
  process.exit(1);
}

console.log(`precache: ${assets.length} JS assets, all listed in sw.js`);
```

- [ ] **Step 2: Run it to verify the baseline fails the budget**

The current `dist` is still the old build. Run:

```bash
node scripts/bundle-size.mjs
```

Expected: exits 1 with the entry over 550 KiB (the baseline is about 740.6 KiB gzip). This is the failing test for the budget.

- [ ] **Step 3: Add the package script and CI step**

In `package.json`, after `"build"`, add:

```json
    "size": "node scripts/bundle-size.mjs",
```

In `.github/workflows/ci.yml`, after the `Build` step, add:

```yaml
- name: Bundle budget and precache coverage
  run: npm run size
```

- [ ] **Step 4: Rebuild and verify the new entry passes**

Run:

```bash
npm run build
npm run size
```

Expected: the entry is at or below 550 KiB gzip, and every built JS asset is listed in `sw.js`.

- [ ] **Step 5: Verify the failure path**

Run:

```bash
BUNDLE_BUDGET_KB=1 npm run size
```

Expected: exits 1 with "over the 1 KiB budget".

- [ ] **Step 6: Remove the 4 MiB Workbox override if it is no longer needed**

Run:

```bash
find dist/assets -name '*.js' -size +2M
```

Expected: no output. If it is empty, remove the comment and `maximumFileSizeToCacheInBytes` from `vite.config.ts`:

```ts
                workbox: {
                    navigateFallbackDenylist: [/^\/share(?:\/|$)/],
                },
```

If any file is larger than 2 MiB, leave the override in place and report the filename; Workbox would otherwise drop it from the precache.

- [ ] **Step 7: Rebuild and rerun the size check after the Workbox change**

Run:

```bash
npm run build
npm run size
```

Expected: both pass; the precache still lists every JS asset.

- [ ] **Step 8: Commit**

```bash
git add scripts/bundle-size.mjs package.json .github/workflows/ci.yml vite.config.ts
git commit -m "build: enforce the entry bundle budget and precache coverage"
```

---

### Task 9: Full verification

**Files:** none.

- [ ] **Step 1: Run the complete local gate**

Run, in order:

```bash
npx tsc --noEmit
npm run lint
npm run format:check
npm test
npm run build
npm run size
npm run test:e2e
```

Expected: every command exits 0; `npm run size` reports the entry gzip and the precache count; the Playwright suite passes.

- [ ] **Step 2: Record the final numbers**

Capture for the PR description:

```bash
npm run size
git diff --stat 6ede362...HEAD
```

Include the entry gzip before/after, the number of page chunks, and the precache count. Do not adjust the 550 KiB budget to hide a regression; if the entry is over, split another heavy dependency or eager page.

- [ ] **Step 3: Stop and hand off**

Do not push, open a PR, or post the coordination issue from this plan. The human partner reviews the diff and the issue draft first.
