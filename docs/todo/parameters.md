# Transmasculine PK parameter extraction (Phase 0)

Companion to `docs/todo/plan.md` and issue #215. Values are from labels/SmPCs and cited papers; cells marked "—" are not yet extracted and must be filled from the primary source before fitting.

## Testosterone esters — injection

| Formulation | Route | t1/2 terminal | Tmax | Cmax (typical) | Vd/F | CL/F | ka | Source |
|---|---|---|---|---|---|---|---|---|
| Testosterone cypionate (TC) | IM | ~8 d (label) | 24–48 h | — | 14 L/kg (repo) | — | 0.025 h⁻¹ (repo) | Depo-Testosterone label [R4]; repo T_DepotPK |
| Testosterone enanthate (TE) | IM | ~4–5 d | 24–48 h | — | 14 L/kg (repo) | — | 0.035 h⁻¹ (repo) | repo T_DepotPK |
| Testosterone undecanoate (TU) | IM/SC | release 50–90 d (Nebido) | ~7 d (1000 mg) | ~37 nmol/L peak SS | — | — | 0.036 h⁻¹ (repo hydrolysis) | Nebido label; repo T_DepotPK/T_EsterPK; [7] |

## Gel / patch / nasal / pellet / oral

| Formulation | Route | Dose | t1/2 / release | Tmax | Steady-state level | Notes | Source |
|---|---|---|---|---|---|---|---|
| Testosterone gel 1% (AndroGel) | TD daily | 50 mg/day | — | 4 h | ~555 ng/dL Cavg (70 kg) | washout 48–72 h | AndroGel 1.62% label [R5]; repo |
| Testosterone patch (Androderm) | TD daily | 5 mg/day | — | — | 500–700 ng/dL | — | repo DOSE_CEILING |
| Testosterone nasal gel (Natesto) | IN 3×/day | 11 mg/nostril | — | ~1–2 h | normal range | no secondary transference | [3] |
| Testosterone pellets | SC implant | 6×100/200 mg | release ~3–6 months | — | — | flip-flop kinetics | [4][5] |
| Oral TU (self-emulsifying) | PO | 220 mg BID | — | — | normal range | meal-fat dependent, lymphatic | [1][2] |
| SC injection of TU | SC | 1000 mg | — | — | non-inferior to IM | acceptable route | [6][7] |

## Free T / binding

| Parameter | Value / method | Source |
|---|---|---|
| Binding model | Vermeulen: total T = free + Alb-bound + SHBG-bound | [14][15] |
| K_SHBG, K_Alb | literature priors + local calibration | transmasc doc §6 |
| SHBG dynamic | estrogen-driven; T may raise or lower | [14] |

## Hematocrit / erythrocytosis

| Item | Value | Source |
|---|---|---|
| Year-1 erythrocytosis incidence | ~11% | [18] |
| Long-term cumulative rise | continues after year 1 | [17] |
| Route effect | injectable > gel > patch | [16] |
| Mitigation tested | 100 mg cypionate | [19] |
| Advisory thresholds | Hct > 0.50 flag; > 0.54 strong flag | Endocrine Society / UCSF |

## Body composition

| Item | Observation | Source |
|---|---|---|
| Lean mass gain + visceral fat gain coexist over years | longitudinal MRI | [20] (transmasc doc [R9]) |
| Early changes within 3–6 months | Thai cohort | [21] |

## Uterus / ovaries / gonadectomy

| Item | Observation | Source |
|---|---|---|
| Histopathology on T: atrophy common, not universal; bleeding can persist | — | [8][9] |
| Post-BSO testosterone management concerns in young adults | case series | [10] |
| Knowledge gaps flagged | — | [11] |
| Pregnancy possible on T; amenorrhea ≠ anovulation | — | [12][13] |

## References

See issue #215 §15 for full citations. Key PMIDs: [1] 32382745, [2] 21474786, [3] 26695758, [4] 2115044, [5] 25999802, [6] 34698352, [7] 31384715, [8] 39049785, [9] 42796076, [10] 35850361, [11] 31503150, [12] 25415163, [13] 37810944, [14] 36205798, [15] 29618085, [16] 34445892, [17] 33599731, [18] 39011565, [19] 41052128, [20] Lundberg 2024, [21] 42170522.