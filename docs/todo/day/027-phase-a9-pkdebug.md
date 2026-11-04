# Day 027 — A9: E2 PK parameter debugging

## Summary

Added E2 PK debugging helpers: unit conversions (pg/mL <-> pmol/L),
sampling-time offsets, and parameter validation.

## Changes

- `logic.ts`: `E2_PK_UNIT_FACTORS`, `e2PgMlToPmolL`, `e2PmolLToPgMl`,
  `E2_PK_SAMPLING_OFFSETS_H`, `validateE2PKParams`.
- `tests/e2_pkdebug.test.ts`: 3 tests.

## Math

$$
1\ \mathrm{pg/mL}=3.671\ \mathrm{pmol/L},\quad 1\ \mathrm{ng/dL}=0.0347\ \mathrm{nmol/L}
$$

## References

- [Stanczyk 2022 — popPK template](https://pubmed.ncbi.nlm.nih.gov/36574387/)
