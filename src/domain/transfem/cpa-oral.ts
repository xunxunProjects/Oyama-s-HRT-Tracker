export const CPA_ORAL = (() => {
    const alpha = 0.25;
    const beta = Math.LN2 / 43.9;
    const wFast = 5.2786;
    const exposureH = 14 / (0.0035 * 60);
    return { F: 0.88, ka: 0.5, alpha, beta, wFast, wSlow: (exposureH - wFast / alpha) * beta };
})();
export const CPA_ORAL_F = CPA_ORAL.F;

// Optional bicalutamide PK submodel (issue #206 §3): one compartment, first-order
// absorption and elimination, linear. Off by default; switched on through
// runSimulation's options. Parameters from the Casodex label (active R-enantiomer):
// t1/2 ≈ 5.8 d, apparent oral CL/F ≈ 0.8 L/h (label, steady state),
// Tmax ≈ 31 h. Vd/F and ka are back-calculated per §3:
//   ke = ln2 / t1/2,  Vd/F = (CL/F)/ke,  Tmax = ln(ka/ke)/(ka-ke).
// Absolute bioavailability is unknown ("high"); F cancels into Vd/F, so F = 1.
// Not user-overridable.
