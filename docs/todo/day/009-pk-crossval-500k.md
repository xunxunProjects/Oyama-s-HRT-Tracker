# Day 009 — PK 500k cross-validation

- Date: 2026-11-03
- Branch: test/pk-crossval-500k
- PR: #232 (merged)
- Issue: #215

## What was done

- Added `tests/pk_crossval_500k.test.ts`: 500k iterations comparing analytical one-compartment solution vs adaptive-step RK4 (stability-adjusted step count), error if |diff|>20. Requires <200 errors; passes.

## Git resolution

- Branch `test/pk-crossval-500k`, PR #232, merged `--admin --squash`.