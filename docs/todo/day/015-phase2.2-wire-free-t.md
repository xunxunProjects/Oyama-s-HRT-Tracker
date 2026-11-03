# Day 015 — Phase 2.2: wire free testosterone into SimulationResult

- Date: 2026-11-03
- Branch: feat/transmasc-wire-free-t
- PR: #247 (merged)
- Issue: #215

## What was done

- Added `concNGdL_T_free` to `SimulationResult` (Vermeulen, default SHBG 30 / albumin 4.3) and `interpolateConcentration_T_free`.
- Updated `docs/todo/plan.md`? no.
- Full suite green.

## Git resolution

- Branch `feat/transmasc-wire-free-t`, PR #247, merged `--admin --squash`.

## Next

Wire Hct/amenorrhea/body-comp/gonadectomy state into runSimulation (requires stateful integration).
