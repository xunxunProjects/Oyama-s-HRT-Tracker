# Day 022 — A4: Body-composition slow variables (feminizing)

## Summary

Wired body-composition slow variables into the transfeminine simulation via a
90-day rolling E2 average, mirroring the transmasculine `bodyCompStep`.

## Changes

- `logic.ts`: `bodyCompCurve(sim, params, windowH, scalePgMl)` integrates
  muscle and visceral fat over the simulation grid.
- `SimulationResult`: `muscleM`/`bodyCompM` and `visceralFat`/`bodyCompFVisc`.
- `runSimulation` now populates these arrays.
- `tests/e2_bodycomp.test.ts`: 4 tests.

## Math

$$
\frac{dM}{dt}=k_{\mathrm{gain},M}E(C_{\mathrm{avg},90d})-k_{\mathrm{loss},M}M,\quad
\frac{dF_{\mathrm{visc}}}{dt}=k_{\mathrm{gain},F}E(C_{\mathrm{avg},90d})-k_{\mathrm{turn},F}F_{\mathrm{visc}}
$$

## References

- [O'Connell 2022 — Cardiometabolic Outcomes in Transgender Youth](https://pubmed.ncbi.nlm.nih.gov/36221797/)
