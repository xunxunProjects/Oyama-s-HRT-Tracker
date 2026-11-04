# Day 018 — Debug: CI lint/format fixes

- Date: 2026-11-03
- Branch: debug/ci-fixes
- PR: #253 (merged)
- Issue: #215

## What was done

- Fixed 4 lint errors (unused `dose` imports) in transmasc test files.
- Fixed broken sed in `transmasc_formulations.test.ts` (`ester: Ester.TEMG: 750` -> `ester: Ester.TE, doseMG: 750`).
- Applied prettier formatting to 39 files.
- Verified locally: `npm run lint` (0 errors), `npm run format:check` (pass), `npx tsc --noEmit` (pass), `npm test` (757 passed + 4 expected fail), `npm run build` (pass), `set_version.py --check` (pass).

## Git resolution

- Branch `debug/ci-fixes`, PR #253, merged `--admin --squash`.