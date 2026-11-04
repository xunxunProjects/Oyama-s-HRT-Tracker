import { Ester, Route } from '../types';
import type { PkRouteModule } from '../shared/module';
import { _analytic2C } from '../shared/math';

// Optional bicalutamide PK submodel (issue #206 §3): one compartment, first-order
// absorption and elimination, linear. Off by default; switched on through
// runSimulation's options. Parameters from the Casodex label (active R-enantiomer):
// t1/2 ≈ 5.8 d, apparent oral CL/F ≈ 0.8 L/h (label, steady state),
// Tmax ≈ 31 h. Vd/F and ka are back-calculated per §3:
//   ke = ln2 / t1/2,  Vd/F = (CL/F)/ke,  Tmax = ln(ka/ke)/(ka-ke).
// Absolute bioavailability is unknown ("high"); F cancels into Vd/F, so F = 1.
// Not user-overridable.
export const BICALUTAMIDE_ORAL = (() => {
    const tHalfH = 5.8 * 24;
    const ke = Math.LN2 / tHalfH;
    const clfLh = 0.8; // L/h, apparent oral clearance / F
    const vdPerKG = clfLh / ke / 70; // L/kg at the 70 kg reference
    // Back-calculate ka from Tmax ≈ 31 h.
    const targetTmax = 31;
    let lo = ke + 1e-12;
    let hi = 10;
    for (let i = 0; i < 200; i++) {
        const mid = (lo + hi) / 2;
        const tm = Math.log(mid / ke) / (mid - ke);
        if (tm > targetTmax) lo = mid;
        else hi = mid;
    }
    const ka = (lo + hi) / 2;
    return { F: 1, ka, ke, beta: ke, tHalfH, clfLh, vdPerKG, tmaxH: targetTmax };
})();
export const BICALUTAMIDE_ORAL_F = BICALUTAMIDE_ORAL.F;

export const bicaOralModule: PkRouteModule = {
    routes: [Route.oral],
    esters: [Ester.BICA],
    bioavailability() {
        return BICALUTAMIDE_ORAL_F;
    },
    resolveParams() {
        return {
            Frac_fast: 1.0,
            k1_fast: BICALUTAMIDE_ORAL.ka,
            k1_slow: 0,
            k2: 0,
            k3: BICALUTAMIDE_ORAL.ke,
            F: BICALUTAMIDE_ORAL_F,
            rateMGh: 0,
            F_fast: BICALUTAMIDE_ORAL_F,
            F_slow: BICALUTAMIDE_ORAL_F,
        };
    },
    buildAmount(event) {
        const startTime = event.timeH;
        const dose = event.doseMG;
        const { F, ka, ke } = BICALUTAMIDE_ORAL;
        const amount = (timeH: number) => {
            const tau = timeH - startTime;
            if (tau < 0) return 0;
            return _analytic2C(tau, dose, F, ka, ke);
        };
        // Bicalutamide is not part of the swallowed estradiol share that drives
        // the SHBG model; keep swallowed at zero.
        return { amount, swallowed: () => 0 };
    },
};
