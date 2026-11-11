# Day 025 — A7: Population PK covariate layer

## Summary

Added a population PK covariate layer for weight (allometric scaling) and
optional age/SHBG adjustments.

## Changes

- `logic.ts`: `PopPKCovariateParams`, `DEFAULT_POP_PK_COVARIATE_PARAMS`,
  `popPKCovariateFactors`.
- `tests/e2_covariate.test.ts`: 2 tests.

## Math

$$
CL_i=CL_{\mathrm{pop}}\left(\frac{WT_i}{70}\right)^{0.75}e^{\eta_{CL,i}},\quad
V_i=V_{\mathrm{pop}}\left(\frac{WT_i}{70}\right)^{1.0}e^{\eta_{V,i}}
$$

## References

- [Stanczyk 2022 — population PK model for transdermal steroid delivery](https://pubmed.ncbi.nlm.nih.gov/36574387/)
- [Alotaibi 2026 — Metoprolol PK in Trans Women](https://pubmed.ncbi.nlm.nih.gov/42878231/)
