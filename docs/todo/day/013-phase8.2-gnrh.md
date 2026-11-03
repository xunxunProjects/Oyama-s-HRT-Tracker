# Day 013 — Phase 8.2: GnRH agonist depot desensitisation

- Date: 2026-11-03
- Branch: feat/transmasc-gnrh
- PR: #243 (merged)
- Issue: #215

## What was done

- Added `GnRHDepotParams`, `DEFAULT_GNRH_DEPOT`, and `gnrhSuppression(tDays, params)` returning suppression fraction after lag.
- Added `tests/transmasc_gnrh.test.ts` (3 tests).
- Updated `docs/todo/plan.md`.

## Git resolution

- Branch `feat/transmasc-gnrh`, PR #243, merged `--admin --squash`.

## Next

Phase 1.5 TU transit compartments (numerical solver).
