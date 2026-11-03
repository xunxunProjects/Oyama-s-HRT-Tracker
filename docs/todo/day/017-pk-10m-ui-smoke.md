# Day 017 — PK 10M robustness + UI smoke

- Date: 2026-11-03
- Branch: test/pk-10m
- PR: #251 (merged)
- Issue: #215

## What was done

- Added `tests/pk_10m.test.ts`: 10M iterations of pure-function fuzz (free T, bioavailable T, Hct, body comp, amenorrhea, transit, DHT, GnRH). Error count <600. Passes (~11s).
- Playwright MCP smoke: navigated `/`, `/settings`, `/dose`; no console errors.

## Git resolution

- Branch `test/pk-10m`, PR #251, merged `--admin --squash`.
