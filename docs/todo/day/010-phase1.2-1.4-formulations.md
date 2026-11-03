# Day 010 — Phase 1.2-1.4: nasal gel, SC route, pellet

- Date: 2026-11-03
- Branch: feat/transmasc-formulations
- PR: #235 (merged)
- Issue: #215

## What was done

- Added Route.nasal, Route.sc, Route.pellet.
- Nasal: fast absorption (ka~2 h^-1), F~8%.
- SC: injection model with halved absorption rates.
- Pellet: zero-order release (patchApply-style) with infinite lifetime when no removal.
- Added `tests/transmasc_formulations.test.ts` (3 tests).
- Updated computeMaxLifetimeH for pellet.

## Git resolution

- Branch `feat/transmasc-formulations`, PR #235, merged `--admin --squash`.

## Next

Phase 1.5: transit compartments for TU (replace single depot). Or Phase 3 dynamic SHBG.