# Day 020 — A2: Dynamic SHBG wired into simulation

## Summary

Wired the indirect-effect SHBG turnover model from `shbg.ts` into
`runSimulation` as an opt-in dynamic curve, mirroring the A1 precedent.

## Changes

- `SimulationResult`: added `shbgNM`/`shbgNmolL`/`concNM_SHBG` (nmol/L) and
  `concPGmL_E2_free_dynamic`/`concPGmL_E2_freeDynamic` (pg/mL) arrays.
- `runSimulation`: detects `dynamicShbg` (or `shbgDynamic`/`shbg='dynamic'`)
  option; computes the swallowed share internally when needed, runs
  `shbgCurve` + `freeEstradiol({shbg:'dynamic'})`, and stores the results.
  The swallowed-share return contract is preserved when neither is requested.
- Added `interpolateConcentration_SHBG` and
  `interpolateConcentration_E2_free_dynamic` helpers.
- `tests/e2_dynamic_shbg.test.ts`: 4 tests.

## Math

SHBG turnover (indirect effect):

$$
\frac{dS}{dt}=k_{\mathrm{deg}}\Bigl[S_{\mathrm{base}}(1+E(t))-S\Bigr],\quad
E(t)=\frac{E_{\max,o}u_o+E_{\max,p}u_p}{1+u_o+u_p},\quad
u_r=\left(\frac{C_r}{EC_{50,r}}\right)^{\gamma_r}
$$

## References

- [Narinx 2022 — SHBG and the free hormone hypothesis](https://pubmed.ncbi.nlm.nih.gov/36205798/)
