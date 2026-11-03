# Transmasculine PK/PD parity plan

Source issue: https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/issues/215
Source design doc: `transmasc_hrt_modeling_document.md` (v1.0)
Target level: transfeminine estradiol stack in `logic.ts` / `Algorithm Explanation.md`.

## Goal

Bring the transmasculine (testosterone) model to the same engineering level as the transfeminine (estradiol) model: multi-formulation PK, free/bioavailable T, dynamic SHBG, gonadectomy/uterus state, hematocrit safety PD, amenorrhea time-to-event, body-composition slow variables, other-drug terms, and the calibration stack.

## Execution rules (this repo)

- One phase = one PR. Merge with `gh pr merge --admin` without waiting for CI.
- Each merged step gets a diary entry in `docs/todo/day/NNN-<slug>.md`.
- TDD: failing test first, then implementation, then `npm test`.
- No version bump.

## Phases

1. **Phase 0 — Literature parameter extraction** (docs only). Extract per-formulation PK parameters (D, AUC, Cmax, Tmax, t1/2, Vd/F, CL/F, ka) from labels/papers into `docs/todo/parameters.md`.
2. **Phase 1 — Multi-formulation T PK** (code), split into sub-phases:
   - 1.1 Oral TU (one-compartment oral, low F) — **done (PR #218)**.
   - 1.2 Nasal gel (pulsed 3×/day) — needs `Route.nasal` + intraday dosing.
   - 1.3 Pellet/implant (zero-order release) — needs depot state.
   - 1.4 SC route flag for existing esters (ka adjustment).
   - 1.5 Transit compartments for TU (replace single depot).
3. **Phase 2 — Free/bioavailable T** (code). Vermeulen-style from total T + SHBG + albumin; reuse `shbg.ts` math.
4. **Phase 3 — Dynamic SHBG wired to T** (code).
5. **Phase 4 — Gonadectomy/uterus state variable G** (code).
6. **Phase 5 — Hematocrit turnover PD** (code).
7. **Phase 6 — Amenorrhea time-to-event** (code).
8. **Phase 7 — Body-composition slow variables** (code).
9. **Phase 8 — Other drugs** (finasteride/dutasteride 5α-reductase term; GnRH agonist depot + desensitisation) (code).
10. **Phase 9 — Calibration stack** (EKF/OU-Kalman/MIPD, assay platform) (code).
11. **Phase 10 — Validation** (VPC, calibration, sensitivity, scenarios) (docs + tests).

## Status

- Phase 0: in progress (this PR).