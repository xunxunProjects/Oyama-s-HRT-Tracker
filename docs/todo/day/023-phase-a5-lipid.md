# Day 023 — A5: Lipid / hepatic steatosis pluggable module

## Summary

Added a pluggable lipid/hepatic slow variable (LDL) driven by a 180-day
rolling E2 average.

## Changes

- `logic.ts`: `LipidParams`, `DEFAULT_LIPID_PARAMS`, `lipidCurve(sim)`.
- `SimulationResult`: `ldl`, `lipidLDL`.
- `runSimulation` populates LDL arrays.
- `tests/e2_lipid.test.ts`: 3 tests.

## Math

$$
\frac{d\mathrm{LDL}}{dt}=k_{\mathrm{in},\mathrm{LDL}}\left(1+\beta_{\mathrm{LDL}}E(C_{\mathrm{avg},180d})\right)-k_{\mathrm{out},\mathrm{LDL}}\mathrm{LDL}
$$

## References

- [O'Connell 2022 — Cardiometabolic Outcomes in Transgender Youth](https://pubmed.ncbi.nlm.nih.gov/36221797/)
