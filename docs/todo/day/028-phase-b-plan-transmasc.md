# Day 028 — Plan B: Transmasculine PK/PD wiring

## Summary

Wired transmasculine (testosterone) PK/PD into SimulationResult for T regimens:
free/bioavailable T, hematocrit, amenorrhea probability, body composition, DHT,
and T-driven endogenous E2.

## Changes

- `logic.ts`: SimulationResult fields `concNGdL_T_bioavailable`, `hct`,
  `amenorrheaProb`, `tMuscle`, `tVisceralFat`, `endogenousE2PgMl`, `dhtNgDl`.
- `runSimulation` wires `integrateTransmascState` when testosterone is present.
- `tests/transmasc_planb.test.ts`: 6 tests.

## References

- [Defreyne 2019 — Transmasculine Hormone Therapy](https://pubmed.ncbi.nlm.nih.gov/31027545/)
- [Madsen 2021 — Erythrocytosis in Trans Men](https://pubmed.ncbi.nlm.nih.gov/33599731/)
- [Turner 2019 — SC Testosterone Undecanoate PK](https://pubmed.ncbi.nlm.nih.gov/31384715/)
- [Figueiredo 2022 — SC Testosterone Injections](https://pubmed.ncbi.nlm.nih.gov/34698352/)
