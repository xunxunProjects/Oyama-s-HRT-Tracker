# Day 002 — Phase 1.1: oral testosterone undecanoate PK

- Date: 2026-11-03
- Branch: feat/transmasc-oral-tu
- PR: #218 (merged)
- Issue: #215

## What was done

- Added `Route.oral` handling for `Ester.TU` in `getBioavailabilityMultiplier` (F ≈ 5%).
- Added `Route.oral` case in `resolveParams` transmasculine path: one-compartment oral model (ka ≈ 0.4 h⁻¹, fast native clearance).
- Added `tests/transmasc_oral_tu.test.ts`: finite/positive concentration and loose steady-state range check.
- Updated `docs/todo/plan.md` to split Phase 1 into sub-phases.

## Git resolution

- Branch `feat/transmasc-oral-tu`, commit, push, PR #218, merged `--admin --squash`.
- `npm test` passed (716 tests) before merge.

## Next

Phase 1.2: nasal gel (needs `Route.nasal` and intraday 3× dosing model).
