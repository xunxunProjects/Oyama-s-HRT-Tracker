# Day 005 — Phase 6.1: amenorrhea hazard

- Date: 2026-11-03
- Branch: feat/transmasc-amenorrhea
- PR: #224 (merged)
- Issue: #215

## What was done

- Added `AmenorrheaParams`, `DEFAULT_AMENORRHEA_PARAMS`, `amenorrheaHazard(avgT, e2, params)` implementing h = h0 + hT*sigmoid(avgT-thetaT) + hE*sigmoid(thetaE-e2).
- Added `tests/transmasc_amenorrhea.test.ts` (3 tests).
- Updated `docs/todo/plan.md`.

## Git resolution

- Branch `feat/transmasc-amenorrhea`, PR #224, merged `--admin --squash`.

## Next

Phase 7: body-composition slow variables driven by 90-d rolling average. Or Phase 4 gonadectomy state.