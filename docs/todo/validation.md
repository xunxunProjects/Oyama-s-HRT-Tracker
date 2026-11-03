# Phase 10 — Validation (transmasculine)

- VPC: simulate N subjects, compute 5/50/95 percentile bands of T concentration over time; compare to observed.
- Calibration: EKF + MIPD dose adjustment (see `ekfStep`, `mipdDoseAdjust`).
- Sensitivity: vary ka, CL, Vd; report AUC and Cmax spread.
- Scenarios: hysterectomy before/after, GnRH agonist, finasteride, oral TU vs injection.

Status: scaffolding complete (EKF/MIPD + integration wrapper). Full VPC pipeline pending.
