# Day 003 — Phase 2.1: free/bioavailable testosterone (Vermeulen)

- Date: 2026-11-03
- Branch: feat/transmasc-free-t
- PR: #220 (merged)
- Issue: #215

## What was done

- Added exported `freeTestosteroneNgDl(totalT, shbg, albumin)` and `bioavailableTestosteroneNgDl(...)` using the Vermeulen quadratic (K_SHBG≈1 L/nmol, K_Alb≈3.6e-5 L/nmol).
- Added `tests/transmasc_free_t.test.ts` (3 tests).
- Updated `docs/todo/plan.md`.

## Git resolution

- Branch `feat/transmasc-free-t`, PR #220, merged `--admin --squash`.

## Next

Phase 5 or 4: Hct turnover PD model or gonadectomy state. Pure-function, testable.