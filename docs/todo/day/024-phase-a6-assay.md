# Day 024 — A6: Assay platform error model

## Summary

Added an assay-platform error model distinguishing immunoassay vs LC-MS/MS
measurement noise.

## Changes

- `logic.ts`: `AssayPlatformParams`, `DEFAULT_ASSAY_PLATFORM_PARAMS`,
  `assayPlatformSigma`, `assayPlatformNoise`.
- `tests/e2_assay.test.ts`: 2 tests.

## Math

$$
y \sim \mathcal{N}(C,\sigma_{\mathrm{platform}}^{2}),\quad
\sigma_{\mathrm{platform}}\in\{\sigma_{\mathrm{immuno}},\sigma_{\mathrm{LCMS}}\}
$$

## References

- [Rosner 2013 — Estradiol Assay Comparison](https://pubmed.ncbi.nlm.nih.gov/23457408/)
