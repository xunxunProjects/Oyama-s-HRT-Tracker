# Day 001 — Phase 0: plan + parameter extraction

- Date: 2026-11-03
- Branch: docs/transmasc-phase0
- PR: #216 (merged 2026-11-03)
- Issue: #215

## What was done

- Added `docs/todo/plan.md`: 11-phase roadmap to bring transmasculine PK/PD to parity with transfeminine, with execution rules (one phase = one PR, merge without CI, diary per step).
- Added `docs/todo/parameters.md`: Phase 0 literature/label parameter extraction table (esters, gel/patch/nasal/pellet/oral, free T binding, Hct, body comp, uterus/ovaries), with PMIDs and "—" gaps.

## Git resolution

- Created branch `docs/transmasc-phase0`, committed 2 files, pushed to fork.
- Opened PR #216 against main; merged with `--admin --squash` (CI not waited).
- Pulled main to sync.

## Next

Phase 1: multi-formulation T PK (oral TU lymphatic, nasal pulsed, pellet zero-order, SC route flag, TU transit compartments). Need TDD tests in `tests/`.
