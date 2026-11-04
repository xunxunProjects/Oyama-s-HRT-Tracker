# Day 026 — A8: VTE / coagulation risk flag

## Summary

Added a pluggable VTE/coagulation risk flag computed as a logistic function
of the 90-day rolling E2 average and covariates.

## Changes

- `logic.ts`: `VTEParams`, `DEFAULT_VTE_PARAMS`, `logistic`,
  `vteRiskCurve`.
- `SimulationResult`: `vteRisk`.
- `runSimulation` populates `vteRisk`.
- `tests/e2_vte.test.ts`: 3 tests.

## Math

$$
\mathrm{Risk}_{\mathrm{VTE}}(t)=\mathrm{logistic}\left(\beta_0+\beta_1 C_{\mathrm{avg}}+\beta_2\,\mathrm{covariates}\right)
$$

## References

- [Hamidi 2019 — Transfeminine Hormone Therapy](https://pubmed.ncbi.nlm.nih.gov/31027544/)
