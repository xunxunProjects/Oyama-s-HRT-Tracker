import { Ester, Route } from '../types';
import type { PkRouteModule } from '../shared/module';
import { _analytic2C } from '../shared/math';

export const CPA_ORAL = (() => {
    const alpha = 0.25;
    const beta = Math.LN2 / 43.9;
    const wFast = 5.2786;
    const exposureH = 14 / (0.0035 * 60);
    return { F: 0.88, ka: 0.5, alpha, beta, wFast, wSlow: (exposureH - wFast / alpha) * beta };
})();
export const CPA_ORAL_F = CPA_ORAL.F;

// Oral cyproterone acetate, from the Androcur 50 mg SmPC, section 5.2
// (https://www.medicines.org.uk/emc/product/15996/smpc/print): bioavailability
// 88%; two 50 mg tablets give "maximum serum levels of about 285 ng/ml at about
// 3 hours"; terminal half-life 43.9 h; total clearance 3.5 ml/min/kg.
//
// Absorbed at ka, it then leaves the blood in two phases, so the response to
// the absorbed amount, read through the 14 L/kg volume the CPA curve uses, is
// (wFast·e^(−αt) + wSlow·e^(−βt)) / V. The integral of the bracket, wFast/α + wSlow/β, is V/CL
// = 14 / (0.0035·60) = 66.7 h, which fixes total exposure at the label's
// clearance. ka = 0.5/h and α = 0.25/h (a 2.8 h first phase) put the peak at 3 h,
// and wFast is the weight that makes it 285 ng/mL; about a third of the exposure
// is in the first phase. The model used to put the whole dose straight into the
// slow phase with F = 0.7, which kept total exposure near (0.7x) but made the
// 100 mg peak about 67 ng/mL.
//
// All of this is single-dose data. Low doses likely read low: the Dianette
// (Diane-35) label gives 15 ng/mL at 1.6 h after 2 mg
// (https://www.medicines.org.uk/emc/product/1122/smpc), where the model peaks
// at about 5.7 ng/mL at 3 h at 70 kg, and a linear model fitted to 100 mg
// cannot follow both.
// Levels on daily dosing have not been checked against multiple-dose studies.
export const cpaOralModule: PkRouteModule = {
    routes: [Route.oral],
    esters: [Ester.CPA],
    bioavailability() {
        return CPA_ORAL_F;
    },
    resolveParams() {
        return {
            Frac_fast: 1.0,
            k1_fast: CPA_ORAL.ka,
            k1_slow: 0,
            k2: 0,
            k3: CPA_ORAL.beta,
            F: CPA_ORAL_F,
            rateMGh: 0,
            F_fast: CPA_ORAL_F,
            F_slow: CPA_ORAL_F,
        };
    },
    buildAmount(event) {
        const startTime = event.timeH;
        const dose = event.doseMG;
        const { F, ka, alpha, beta, wFast, wSlow } = CPA_ORAL;
        const amount = (timeH: number) => {
            const tau = timeH - startTime;
            if (tau < 0) return 0;
            return _analytic2C(tau, dose, F * wFast, ka, alpha) + _analytic2C(tau, dose, F * wSlow, ka, beta);
        };
        return { amount, swallowed: () => 0 };
    },
};
