# Day 008 — PK model 100k robustness test

- Date: 2026-11-03
- Branch: test/pk-robustness
- PR: #230 (merged)
- Issue: #215

## What was done

- Added `tests/pk_robustness.test.ts`: 100k pure-function fuzz (free T, bioavailable T, Hct step, body comp, amenorrhea hazard), 100k interpolation fuzz on a precomputed TC regimen, and 500 runSimulation fuzz regimens. All finite/non-negative, no throws.
- Playwright MCP smoke test: navigated home/settings/dose/labs/supply pages; no console errors.

## Git resolution

- Branch `test/pk-robustness`, PR #230, merged `--admin --squash`.
