# Day 021 — A3: HPG axis suppression (E2 → endogenous T) wired

## Summary

Added a dynamic HPG-axis model as the counterpart of the steady-state
`estradiolTestosteroneSuppressionFactor`, plus wiring into `runSimulation`.

## Changes

- `logic.ts`: `HPGParams`, `DEFAULT_HPG_PARAMS`, `hpgAxisCurve` (first-order
  integration of dR/dt = k_in*(1 - Imax*C/(IC50+C)) - k_out*R).
- `SimulationResult`: optional `rHPG` and `endogenousTNgDl`/`endogenousT_ngDl`.
- `runSimulation`: populates `rHPG` (and endogenous T when a baseline is
  supplied) when `hpg`/`endogenous` is requested or a baseline is given.
- Added `interpolateConcentration_rHPG`.
- `tests/e2_hpg.test.ts`: 5 tests.

## Math

$$
\frac{dR_{\mathrm{HPG}}}{dt}=k_{\mathrm{in},R}\left(1-\frac{I_{\max,R}C_F}{IC_{50,R}+C_F}\right)-k_{\mathrm{out},R}R_{\mathrm{HPG}},\quad
T_{\mathrm{endo}}=T_{\mathrm{base}}R_{\mathrm{HPG}}
$$

## References

- [Misakian 2025 — Injectable Estradiol Monotherapy Suppresses Testosterone](https://pubmed.ncbi.nlm.nih.gov/40639470/)
- [Cortez 2023 — TREAT Study Protocol](https://pubmed.ncbi.nlm.nih.gov/38133914/)
