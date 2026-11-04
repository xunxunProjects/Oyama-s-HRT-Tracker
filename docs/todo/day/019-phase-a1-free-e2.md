# Day 019 — A1: Free/bioavailable estradiol wired into SimulationResult

## Summary

Wired the Vermeulen mass-action free/bioavailable estradiol into the simulation
output, mirroring the existing `concNGdL_T_free` precedent for testosterone.

## Changes

- `logic.ts`: added `DEFAULT_BINDING`, `DEFAULT_SHBG_MODEL`, `bindEstradiol`
  import from `shbg.ts`.
- `SimulationResult`: added optional `concPGmL_E2_free` and
  `concPGmL_E2_bioavailable` arrays (pg/mL), always populated from
  `concPGmL_E2` at the default SHBG baseline (40 nmol/L).
- Added `interpolateConcentration_E2_free` and
  `interpolateConcentration_E2_bioavailable` helpers.
- `tests/e2_free.test.ts`: 4 tests covering population, mass-action agreement,
  bioavailable relation, and interpolation.

## Math

Free estradiol solves (mass action, Newton iteration):

$$
E2_{\text{total}} = f + \frac{n[\mathrm{SHBG}]K_S f}{1+K_S f} + \frac{[\mathrm{Alb}]K_A f}{1+K_A f}
$$

Bioavailable estradiol:

$$
C_{\mathrm{bio}} = C_{\mathrm{total}}\,(1 - f_{\mathrm{SHBG}})
$$

## References

- [Narinx 2022 — SHBG and the free hormone hypothesis](https://pubmed.ncbi.nlm.nih.gov/36205798/)
