<!--
Submitted as https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/issues/323

Title: chore: enable TypeScript strict mode and split page bundles (tracking)
-->

## 中文摘要

这是一个协调用的 tracking issue。我准备做两个小 PR，避免大家在同一批文件上冲突：

1. **开启 TypeScript strict**：修掉 `strict` 下的 27 个类型错误，只做类型层面的修正，不改 API、PK 公式或数据库。
2. **页面按路由拆分**：目前 40 个页面全部静态 import，首屏 JS gzip 约 741 KiB，jsPDF 和 KaTeX 也进了入口 chunk。改成 `React.lazy` + `Suspense`，并加一个 bundle 预算检查。

两个 PR 分开提交，先 strict、后拆分。不会动数据库迁移、API 契约、版本号或依赖版本。如果你有分支正在改 `tsconfig.json`、`App.tsx` 或 `worker.ts`，请在这里说一声，我会先等或帮你 rebase。

## What and why

Two cleanup PRs that are easier to land while the tree is quiet. Neither is a user-visible bug fix; they reduce first-load cost and make future changes safer.

- **TypeScript is not in strict mode.** `tsconfig.json` has no `strict` flag, and CI only runs `npx tsc --noEmit`. Enabling it surfaces 27 errors (measured on `upstream/main` at `766e3cb`). This codebase contains PK math, crypto-adjacent code, and backup parsing; the missing checks are worth having.
- **Every page is in the entry bundle.** `src/App.tsx` statically imports 40 pages. The entry JS is 2.4 MB raw / 758,416 bytes gzip (≈741 KiB), and it includes `jsPDF` (only used by Export Settings) and KaTeX (only used by the PK visualization). The PWA precaches 78 files / ≈9.5 MB.

## Plan

### PR 1 — TypeScript strict

- Add the five error codes that `jsonError` already uses but `ApiErrorCode` does not declare: `ACCOUNT_MEMORIAL`, `MIGRATION_REQUIRED`, `STEP_UP_REQUIRED`, `UNAVAILABLE`, `UPSTREAM_ERROR`.
- Change `RequestContext.jsonError` and the `jsonErrorFn` parameter of `createRequestContext` from `code: string` to `code: ApiErrorCode`. Existing call sites pass string literals, so this is type-only.
- Type the ester lookup tables in `src/domain/constants.ts` as `Partial<Record<Ester, number>>`; keep all current runtime fallbacks.
- Small nullability fixes in `src/utils/authError.ts`, `src/utils/backupBundle.ts`, `src/pages/ShareSettings.tsx`, `src/pages/TwoFactor.tsx`, and `tests/backupBundle.test.ts`.
- Set `"strict": true` in `tsconfig.json`. `noUncheckedIndexedAccess` is deliberately **not** included.

No response shapes, PK formulas, migrations, or version numbers change. Existing tests must pass unchanged except for type-narrowing helpers in the backup test.

### PR 2 — Route-level code splitting

- Add `src/routes/lazyPages.ts` with 37 lazy page exports. Keep `Home`, `Onboarding`, and `PublicShare` eager.
- Wrap the page switch in `App.tsx` with `<Suspense fallback={<PageLoading />}>`.
- Add `src/utils/lazyWithRetry.ts`: if a chunk fails because a deploy replaced the hashed asset while a tab was open, reload once for that module; if it fails again, surface the error to the existing error boundary.
- Load `jsPDF` and KaTeX only with the pages that use them.
- Add `scripts/bundle-size.mjs` and `npm run size` to CI:
  - entry gzip budget: 550 KiB (overridable with `BUNDLE_BUDGET_KB`);
  - every built `dist/assets/*.js` file must appear in the service-worker precache.
- Remove the 4 MiB Workbox `maximumFileSizeToCacheInBytes` override if no chunk needs it.
- Add an E2E check for Back/Forward after visiting a lazy page, and keep the existing KaTeX and Mermaid coverage.

## What this means if you have work in flight

- **Adding a page?** Put it in `src/routes/lazyPages.ts` and keep the default export. Do not add a new static page import to `App.tsx`.
- **Adding an API error code?** Add it to `ApiErrorCode` in `worker.ts`.
- **Adding an ester rate table?** Use `Partial<Record<Ester, number>>` and add a test for the new ester.
- **Hot files:** `tsconfig.json`, `App.tsx`, and `worker.ts`. Expect a rebase if your branch touches them. PR 1 lands before PR 2, so the strict changes are not mixed into the bundle diff.
- **No action needed** for a page that becomes lazy: default exports and route names stay the same.

## Validation

CI and local checks:

```bash
npx tsc --noEmit
npm run lint
npm run format:check
npm test
npm run build
npm run size        # new
npm run test:e2e
```

Manual checks for PR 2:

- Load the app on a cold cache, open Settings, then navigate to Export data; the lazy chunks load without a flash of the wrong page.
- Navigate to Export Settings and back; jsPDF is fetched only on that page.
- Visit the PK visualization; KaTeX still renders.
- Reload once while offline after a first visit; the precache still covers the app shell.

## Out of scope

These are real improvements, but not in these two PRs. I will file them separately if there is interest:

- `noUncheckedIndexedAccess`.
- Splitting `src/i18n/translations.ts` into per-language files.
- Moving the root server modules into `src/server` / `src/domain`, and simplifying the Dockerfile `COPY` list.
- Mobile/WebKit E2E projects and accessibility assertions.
- Replacing the mutable PK parameter global with explicit options.
- Coverage thresholds.

## Tracking

- [ ] PR 1 — TypeScript strict.
- [ ] PR 2 — Route-level code splitting + bundle budget.
- [ ] Follow-up issues for the out-of-scope items (optional).

I will link the PRs here as they open. If you have a conflicting branch, or would like to own one of these, comment below and I will route around it.
