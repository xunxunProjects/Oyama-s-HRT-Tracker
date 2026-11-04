import { Ester } from '../types';
import { DEFAULT_PK_PARAMS } from '../constants';
import { _activePKParams } from '../shared/activeParams';

export function _getTInjFF(ester: Ester): number {
    const p = _activePKParams;
    if (ester === Ester.TC) return p.t_ff_TC;
    if (ester === Ester.TE) return p.t_ff_TE;
    if (ester === Ester.TU) return p.t_ff_TU;
    return DEFAULT_PK_PARAMS.t_ff_TE;
}

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
