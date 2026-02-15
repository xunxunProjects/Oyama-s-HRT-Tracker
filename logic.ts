// --- Types & Enums ---

export enum Route {
    injection = "injection",
    patchApply = "patchApply",
    patchRemove = "patchRemove",
    gel = "gel",
    oral = "oral",
    sublingual = "sublingual"
}

export enum Ester {
    E2 = "E2",
    EB = "EB",
    EV = "EV",
    EC = "EC",
    EN = "EN"
}

export enum ExtraKey {
    concentrationMGmL = "concentrationMGmL",
    areaCM2 = "areaCM2",
    releaseRateUGPerDay = "releaseRateUGPerDay",
    sublingualTheta = "sublingualTheta",
    sublingualTier = "sublingualTier"
}

export interface DoseEvent {
    id: string;
    route: Route;
    timeH: number; // Hours since 1970
    doseMG: number; // E2 Equivalent
    ester: Ester;
    extras: Partial<Record<ExtraKey, number>>;
}

export interface SimulationResult {
    timeH: number[];
    concPGmL: number[];
    auc: number;
}

// --- Constants & Parameters (PKparameter.swift & PKcore.swift) ---

export const CorePK = {
    vdPerKG: 2.0, // L/kg
    kClear: 0.41,
    kClearInjection: 0.041,
    depotK1Corr: 1.0
};

export const EsterInfo = {
    [Ester.E2]: { name: "Estradiol", mw: 272.38 },
    [Ester.EB]: { name: "Estradiol Benzoate", mw: 376.50 },
    [Ester.EV]: { name: "Estradiol Valerate", mw: 356.50 },
    [Ester.EC]: { name: "Estradiol Cypionate", mw: 396.58 },
    [Ester.EN]: { name: "Estradiol Enanthate", mw: 384.56 }
};

export function getToE2Factor(ester: Ester): number {
    if (ester === Ester.E2) return 1.0;
    return EsterInfo[Ester.E2].mw / EsterInfo[ester].mw;
}

export const TwoPartDepotPK = {
    Frac_fast: { [Ester.EB]: 0.90, [Ester.EV]: 0.40, [Ester.EC]: 0.229164549, [Ester.EN]: 0.05, [Ester.E2]: 1.0 },
    k1_fast: { [Ester.EB]: 0.144, [Ester.EV]: 0.0216, [Ester.EC]: 0.005035046, [Ester.EN]: 0.0010, [Ester.E2]: 0 },
    k1_slow: { [Ester.EB]: 0.114, [Ester.EV]: 0.0138, [Ester.EC]: 0.004510574, [Ester.EN]: 0.0050, [Ester.E2]: 0 }
};

export const InjectionPK = {
    formationFraction: { [Ester.EB]: 0.1092, [Ester.EV]: 0.0623, [Ester.EC]: 0.1173, [Ester.EN]: 0.12, [Ester.E2]: 1.0 }
};

export const EsterPK = {
    k2: { [Ester.EB]: 0.090, [Ester.EV]: 0.070, [Ester.EC]: 0.045, [Ester.EN]: 0.015, [Ester.E2]: 0 }
};

export const OralPK = {
    kAbsE2: 0.32,
    kAbsEV: 0.05,
    bioavailability: 0.03,
    kAbsSL: 1.8
};

// Define deterministic order for mapping integer tiers (0-3) to keys
export const SL_TIER_ORDER = ["quick", "casual", "standard", "strict"] as const;

export const SublingualTierParams = {
    quick: { theta: 0.01, hold: 2 },
    casual: { theta: 0.04, hold: 5 },
    standard: { theta: 0.11, hold: 10 },
    strict: { theta: 0.18, hold: 15 }
};

// --- Math Models ---

interface PKParams {
    Frac_fast: number;
    k1_fast: number;
    k1_slow: number;
    k2: number;
    k3: number;
    F: number;
    rateMGh: number;
    F_fast: number;
    F_slow: number;
}

function resolveParams(event: DoseEvent): PKParams {
    const k3 = event.route === Route.injection ? CorePK.kClearInjection : CorePK.kClear;

    switch (event.route) {
        case Route.injection: {
            const k1corr = CorePK.depotK1Corr;
            const k1_fast = (TwoPartDepotPK.k1_fast[event.ester] || 0) * k1corr;
            const k1_slow = (TwoPartDepotPK.k1_slow[event.ester] || 0) * k1corr;
            const fracFast = TwoPartDepotPK.Frac_fast[event.ester] || 1.0;

            const form = InjectionPK.formationFraction[event.ester] || 0.08;
            const toE2 = getToE2Factor(event.ester);
            const F = form * toE2;

            return { Frac_fast: fracFast, k1_fast, k1_slow, k2: EsterPK.k2[event.ester] || 0, k3, F, rateMGh: 0, F_fast: F, F_slow: F };
        }
        case Route.patchApply: {
            if (event.extras[ExtraKey.releaseRateUGPerDay]) {
                const rateMGh = (event.extras[ExtraKey.releaseRateUGPerDay] || 0) / 24000.0;
                return { Frac_fast: 1.0, k1_fast: 0, k1_slow: 0, k2: 0, k3, F: 1.0, rateMGh, F_fast: 1.0, F_slow: 1.0 };
            } else {
                return { Frac_fast: 1.0, k1_fast: 0.0075, k1_slow: 0, k2: 0, k3, F: 1.0, rateMGh: 0, F_fast: 1.0, F_slow: 1.0 };
            }
        }
        case Route.gel: {
            // Simplified Gel Logic from Swift file
            return { Frac_fast: 1.0, k1_fast: 0.022, k1_slow: 0, k2: 0, k3, F: 0.05, rateMGh: 0, F_fast: 0.05, F_slow: 0.05 };
        }
        case Route.oral: {
            const k1Value = event.ester === Ester.EV ? OralPK.kAbsEV : OralPK.kAbsE2;
            const k2Value = event.ester === Ester.EV ? (EsterPK.k2[Ester.EV] || 0) : 0;
            return { Frac_fast: 1.0, k1_fast: k1Value, k1_slow: 0, k2: k2Value, k3, F: OralPK.bioavailability, rateMGh: 0, F_fast: OralPK.bioavailability, F_slow: OralPK.bioavailability };
        }
        case Route.sublingual: {
            let theta = 0.11;
            if (event.extras[ExtraKey.sublingualTheta] !== undefined) {
                theta = Math.max(0, Math.min(1, event.extras[ExtraKey.sublingualTheta]!));
            } else if (event.extras[ExtraKey.sublingualTier] !== undefined) {
                const tierIdx = Math.round(event.extras[ExtraKey.sublingualTier]!);
                // Use explicit order to avoid object key order ambiguity
                const tierKey = SL_TIER_ORDER[tierIdx] || 'standard';
                theta = SublingualTierParams[tierKey]?.theta || 0.11;
            }

            const k1_fast = OralPK.kAbsSL;
            const k1_slow = event.ester === Ester.EV ? OralPK.kAbsEV : OralPK.kAbsE2;
            const k2Value = event.ester === Ester.EV ? (EsterPK.k2[Ester.EV] || 0) : 0;

            return {
                Frac_fast: theta,
                k1_fast,
                k1_slow,
                k2: k2Value,
                k3,
                F: 1.0,
                rateMGh: 0,
                F_fast: 1.0,
                F_slow: OralPK.bioavailability
            };
        }
        case Route.patchRemove:
            return { Frac_fast: 0, k1_fast: 0, k1_slow: 0, k2: 0, k3, F: 0, rateMGh: 0, F_fast: 0, F_slow: 0 };
    }
}

// 3-Compartment Analytical Solution
function _analytic3C(tau: number, doseMG: number, F: number, k1: number, k2: number, k3: number): number {
    if (k1 <= 0 || doseMG <= 0) return 0;
    const k1_k2 = k1 - k2;
    const k1_k3 = k1 - k3;
    const k2_k3 = k2 - k3;

    if (Math.abs(k1_k2) < 1e-9 || Math.abs(k1_k3) < 1e-9 || Math.abs(k2_k3) < 1e-9) return 0; // Singularity protection

    const term1 = Math.exp(-k1 * tau) / (k1_k2 * k1_k3);
    const term2 = Math.exp(-k2 * tau) / (-k1_k2 * k2_k3);
    const term3 = Math.exp(-k3 * tau) / (k1_k3 * k2_k3);

    return doseMG * F * k1 * k2 * (term1 + term2 + term3);
}

function oneCompAmount(tau: number, doseMG: number, p: PKParams): number {
    const k1 = p.k1_fast;
    if (Math.abs(k1 - p.k3) < 1e-9) {
        return doseMG * p.F * k1 * tau * Math.exp(-p.k3 * tau);
    }
    return doseMG * p.F * k1 / (k1 - p.k3) * (Math.exp(-p.k3 * tau) - Math.exp(-k1 * tau));
}

// Model Solver
class PrecomputedEventModel {
    private model: (t: number) => number;

    constructor(event: DoseEvent, allEvents: DoseEvent[]) {
        const params = resolveParams(event);
        const startTime = event.timeH;
        const dose = event.doseMG;

        switch (event.route) {
            case Route.injection:
                this.model = (timeH: number) => {
                    const tau = timeH - startTime;
                    if (tau < 0) return 0;
                    const doseFast = dose * params.Frac_fast;
                    const doseSlow = dose * (1.0 - params.Frac_fast);
                    return _analytic3C(tau, doseFast, params.F, params.k1_fast, params.k2, params.k3) +
                           _analytic3C(tau, doseSlow, params.F, params.k1_slow, params.k2, params.k3);
                };
                break;
            case Route.gel:
            case Route.oral:
                this.model = (timeH: number) => {
                    const tau = timeH - startTime;
                    if (tau < 0) return 0;
                    return oneCompAmount(tau, dose, params);
                };
                break;
            case Route.sublingual:
                this.model = (timeH: number) => {
                    const tau = timeH - startTime;
                    if (tau < 0) return 0;
                    const doseF = dose * params.Frac_fast;
                    const doseS = dose * (1.0 - params.Frac_fast);

                    // Dual-branch first-order helper (same closed form as oneCompAmount).
                    const branch = (d: number, F: number, ka: number, ke: number, t: number) => {
                        if (Math.abs(ka - ke) < 1e-9) return d * F * ka * t * Math.exp(-ke * t);
                        return d * F * ka / (ka - ke) * (Math.exp(-ke * t) - Math.exp(-ka * t));
                    };

                    const fastAmount = params.k2 > 0
                        ? _analytic3C(tau, doseF, params.F_fast, params.k1_fast, params.k2, params.k3)
                        : branch(doseF, params.F_fast, params.k1_fast, params.k3, tau);

                    // Swallowed (gut) fraction follows oral simplified path, so no extra k2 hydrolysis here.
                    const slowAmount = branch(doseS, params.F_slow, params.k1_slow, params.k3, tau);

                    return fastAmount + slowAmount;
                };
                break;
            case Route.patchApply:
                const remove = allEvents.find(e => e.route === Route.patchRemove && e.timeH > startTime);
                const wearH = (remove?.timeH ?? Number.MAX_VALUE) - startTime;
                
                this.model = (timeH: number) => {
                    const tau = timeH - startTime;
                    if (tau < 0) return 0;
                    
                    // Zero Order
                    if (params.rateMGh > 0) {
                        if (tau <= wearH) {
                            return params.rateMGh / params.k3 * (1 - Math.exp(-params.k3 * tau));
                        } else {
                            const amtRemoval = params.rateMGh / params.k3 * (1 - Math.exp(-params.k3 * wearH));
                            return amtRemoval * Math.exp(-params.k3 * (tau - wearH));
                        }
                    }
                    // First order legacy
                    const amtUnderPatch = oneCompAmount(tau, dose, params);
                    if (tau > wearH) {
                        const amtAtRemoval = oneCompAmount(wearH, dose, params);
                        return amtAtRemoval * Math.exp(-params.k3 * (tau - wearH));
                    }
                    return amtUnderPatch;
                };
                break;
            default:
                this.model = () => 0;
        }
    }

    amount(timeH: number): number {
        return this.model(timeH);
    }
}

// --- Simulation Engine ---

export function runSimulation(events: DoseEvent[], bodyWeightKG: number): SimulationResult | null {
    if (events.length === 0) return null;

    const sortedEvents = [...events].sort((a, b) => a.timeH - b.timeH);
    const precomputed = sortedEvents
        .filter(e => e.route !== Route.patchRemove)
        .map(e => new PrecomputedEventModel(e, sortedEvents));

    const startTime = sortedEvents[0].timeH - 24;
    const endTime = sortedEvents[sortedEvents.length - 1].timeH + (24 * 14);
    const steps = 1000;
    const plasmaVolumeML = CorePK.vdPerKG * bodyWeightKG * 1000;

    const timeH: number[] = [];
    const concPGmL: number[] = [];
    let auc = 0;

    const stepSize = (endTime - startTime) / (steps - 1);

    for (let i = 0; i < steps; i++) {
        const t = startTime + i * stepSize;
        let totalAmountMG = 0;
        for (const model of precomputed) {
            totalAmountMG += model.amount(t);
        }

        const currentConc = (totalAmountMG * 1e9) / plasmaVolumeML;
        timeH.push(t);
        concPGmL.push(currentConc);

        if (i > 0) {
            auc += 0.5 * (currentConc + concPGmL[i - 1]) * stepSize;
        }
    }

    return { timeH, concPGmL, auc };
}

export function interpolateConcentration(sim: SimulationResult, hour: number): number | null {
    if (!sim.timeH.length) return null;
    if (hour <= sim.timeH[0]) return sim.concPGmL[0];
    if (hour >= sim.timeH[sim.timeH.length - 1]) return sim.concPGmL[sim.concPGmL.length - 1];

    // Binary search for efficiency
    let low = 0;
    let high = sim.timeH.length - 1;
    
    while (high - low > 1) {
        const mid = Math.floor((low + high) / 2);
        if (sim.timeH[mid] === hour) return sim.concPGmL[mid];
        if (sim.timeH[mid] < hour) low = mid;
        else high = mid;
    }

    const t0 = sim.timeH[low];
    const t1 = sim.timeH[high];
    const c0 = sim.concPGmL[low];
    const c1 = sim.concPGmL[high];

    if (t1 === t0) return c0;
    const ratio = (hour - t0) / (t1 - t0);
    return c0 + (c1 - c0) * ratio;
}
