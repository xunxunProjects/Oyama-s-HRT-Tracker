import { Ester, ExtraKey, Route } from './types';
import type { DoseEvent, PKParams } from './types';
import { getBioavailabilityMultiplier } from './dispatch';
import { resolveParams } from './dispatch';
import { PrecomputedEventModel } from './shared/eventModel';
import { sublingualThetaFromHold } from './transfem/e2-sublingual';
import { isTestosteroneEster } from './constants';

export interface PkSandboxInputs {
    doseMG: number;
    bodyWeightKG: number;
    birthYear: number | null;
    sublingualHoldMin?: number;
    gelSite?: number;
    releaseRateUGPerDay?: number;
    wearH?: number;
}

export type DerivationStepKey = 'dose' | 'vd' | 'f' | 'params' | 'conversion' | 'peak' | 'thresholds';

export interface DerivationStep {
    /** Which step this is, so a page can name it in the reader's language. */
    key: DerivationStepKey;
    title: string;
    formula: string;
    result?: string;
}

export interface PkSandboxModel {
    id: string;
    label: string;
    route: Route;
    ester: Ester;
    defaultInputs: PkSandboxInputs;
    horizonH: number;
    formula: string;
}

export interface PkSandboxResult {
    model: PkSandboxModel;
    inputs: PkSandboxInputs;
    event: DoseEvent;
    params: PKParams;
    bioavailability: number;
    vdMl: number;
    horizonH: number;
    timeH: number[];
    concentration: number[];
    peak: { value: number; timeH: number };
    timeBelow200H: number | null;
    timeBelow100H: number | null;
    derivation: DerivationStep[];
}

const SHORT_HORIZON = 72;
const MEDIUM_HORIZON = 168;
const LONG_HORIZON = 720;
const STEP_H = 0.1;

const E2_ESTERS: Ester[] = [Ester.E2, Ester.EB, Ester.EV, Ester.EC, Ester.EN, Ester.EU];
const T_ESTERS_LIST: Ester[] = [Ester.T, Ester.TC, Ester.TE, Ester.TU];

function vdMlFor(ester: Ester, bodyWeightKG: number): number {
    if (ester === Ester.CPA) return 14.0 * bodyWeightKG * 1000;
    if (ester === Ester.BICA) return 2.295 * bodyWeightKG * 1000;
    if (isTestosteroneEster(ester)) return 1.0 * bodyWeightKG * 1000;
    return 2.0 * bodyWeightKG * 1000;
}

function amountToPgMl(amountMG: number, ester: Ester, bodyWeightKG: number): number {
    // All results are reported in pg/mL. T is converted from ng/dL (×10).
    if (ester === Ester.CPA) return (amountMG * 1e9) / (14.0 * bodyWeightKG * 1000);
    if (ester === Ester.BICA) return (amountMG * 1e9) / (2.295 * bodyWeightKG * 1000);
    if (isTestosteroneEster(ester)) return (amountMG * 1e9) / (1.0 * bodyWeightKG * 1000);
    return (amountMG * 1e9) / (2.0 * bodyWeightKG * 1000);
}

function defaultDose(route: Route, ester: Ester): number {
    const t = isTestosteroneEster(ester);
    switch (route) {
        case Route.injection:
            return t ? 100 : 5;
        case Route.sc:
            return 100;
        case Route.gel:
            return t ? 50 : 1;
        case Route.patchApply:
            return 0;
        case Route.oral:
            if (ester === Ester.CPA) return 50;
            if (ester === Ester.BICA) return 50;
            if (ester === Ester.TU) return 40;
            return t ? 40 : 2;
        case Route.nasal:
            return 5;
        case Route.pellet:
            return 0;
        case Route.sublingual:
            return 2;
        default:
            return 1;
    }
}

function defaultReleaseRate(route: Route, ester: Ester): number {
    const t = isTestosteroneEster(ester);
    if (route === Route.patchApply) return t ? 5000 : 50;
    if (route === Route.pellet) return t ? 1200 : 0;
    return 0;
}

function defaultWearH(route: Route): number | undefined {
    if (route === Route.patchApply) return 84;
    return undefined;
}

function horizonFor(route: Route): number {
    if (route === Route.oral || route === Route.sublingual || route === Route.nasal || route === Route.gel) {
        return SHORT_HORIZON;
    }
    if (route === Route.patchApply) return MEDIUM_HORIZON;
    return LONG_HORIZON;
}

function buildExtras(model: PkSandboxModel, inputs: PkSandboxInputs): Partial<Record<ExtraKey, number>> {
    const extras: Partial<Record<ExtraKey, number>> = {};
    if (model.route === Route.sublingual) {
        extras[ExtraKey.sublingualTheta] = sublingualThetaFromHold(inputs.sublingualHoldMin ?? 10);
    }
    if (model.route === Route.gel) {
        extras[ExtraKey.gelSite] = inputs.gelSite ?? 0;
    }
    if (model.route === Route.patchApply || model.route === Route.pellet) {
        const rate = inputs.releaseRateUGPerDay ?? model.defaultInputs.releaseRateUGPerDay ?? 0;
        if (rate > 0) extras[ExtraKey.releaseRateUGPerDay] = rate;
        const wear = inputs.wearH ?? model.defaultInputs.wearH;
        if (wear !== undefined && Number.isFinite(wear) && wear > 0) extras[ExtraKey.patchWearH] = wear;
    }
    return extras;
}

const MODEL_DEFS: { route: Route; ester: Ester }[] = [
    ...E2_ESTERS.flatMap(ester => [
        { route: Route.injection, ester },
        { route: Route.sublingual, ester },
        { route: Route.gel, ester },
        { route: Route.patchApply, ester },
        { route: Route.oral, ester },
    ]),
    { route: Route.oral, ester: Ester.CPA },
    { route: Route.oral, ester: Ester.BICA },
    ...T_ESTERS_LIST.flatMap(ester => [
        { route: Route.injection, ester },
        { route: Route.sc, ester },
        { route: Route.gel, ester },
        { route: Route.patchApply, ester },
        { route: Route.pellet, ester },
    ]),
    { route: Route.oral, ester: Ester.TU },
    { route: Route.nasal, ester: Ester.T },
];

export const PK_SANDBOX_MODELS: PkSandboxModel[] = MODEL_DEFS.map(({ route, ester }) => {
    const defaultInputs: PkSandboxInputs = {
        doseMG: defaultDose(route, ester),
        bodyWeightKG: 70,
        birthYear: 1990,
        sublingualHoldMin: route === Route.sublingual ? 10 : undefined,
        gelSite: route === Route.gel ? 0 : undefined,
        releaseRateUGPerDay: defaultReleaseRate(route, ester),
        wearH: defaultWearH(route),
    };
    return {
        id: `${route}:${ester}`,
        label: `${ester} · ${route}`,
        route,
        ester,
        defaultInputs,
        horizonH: horizonFor(route),
        formula: 'C(t) = A(t) × 10^9 / V_d  (pg/mL), where A(t) is the amount (mg) from the route module',
    };
});

export function findSandboxModel(id: string): PkSandboxModel {
    const m = PK_SANDBOX_MODELS.find(x => x.id === id);
    if (!m) throw new Error(`Unknown sandbox model: ${id}`);
    return m;
}

export function buildSandboxEvent(model: PkSandboxModel, partial: Partial<PkSandboxInputs> = {}): DoseEvent {
    const inputs: PkSandboxInputs = { ...model.defaultInputs, ...partial };
    const extras = buildExtras(model, inputs);
    return {
        id: 'pk-sandbox',
        route: model.route,
        ester: model.ester,
        doseMG: inputs.doseMG,
        timeH: 0,
        extras,
    };
}

export function computePkSandbox(id: string, partial: Partial<PkSandboxInputs> = {}): PkSandboxResult {
    const model = findSandboxModel(id);
    const inputs: PkSandboxInputs = { ...model.defaultInputs, ...partial };
    const event = buildSandboxEvent(model, inputs);
    const params = resolveParams(event, inputs.birthYear);
    const bioavailability = getBioavailabilityMultiplier(model.route, model.ester, event.extras ?? {});
    const vdMl = vdMlFor(model.ester, inputs.bodyWeightKG);
    const horizonH = model.horizonH;
    const pm = new PrecomputedEventModel(event, [event], params);

    const timeH: number[] = [];
    const concentration: number[] = [];
    const n = Math.floor(horizonH / STEP_H) + 1;
    for (let i = 0; i < n; i++) {
        const tau = i * STEP_H;
        timeH.push(tau);
        concentration.push(amountToPgMl(pm.amount(tau), model.ester, inputs.bodyWeightKG));
    }

    // Peak
    let peakValue = -Infinity;
    let peakTime = 0;
    for (let i = 0; i < concentration.length; i++) {
        if (concentration[i] > peakValue) {
            peakValue = concentration[i];
            peakTime = timeH[i];
        }
    }

    const firstBelow = (threshold: number): number | null => {
        for (let i = 0; i < concentration.length; i++) {
            if (timeH[i] < peakTime) continue;
            if (concentration[i] < threshold) return timeH[i];
        }
        return null;
    };

    const timeBelow200H = firstBelow(200);
    const timeBelow100H = firstBelow(100);

    const fmt = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : String(n));
    const derivation: DerivationStep[] = [
        {
            key: 'dose',
            title: 'Dose',
            formula: `D = ${fmt(inputs.doseMG, 3)} mg`,
            result: `${fmt(inputs.doseMG, 3)} mg`,
        },
        {
            key: 'vd',
            title: 'Body weight / volume of distribution',
            formula: `V_d = ${fmt(vdMl / inputs.bodyWeightKG / 1000, 3)} L/kg × ${inputs.bodyWeightKG} kg = ${fmt(vdMl, 0)} mL`,
            result: `${fmt(vdMl, 0)} mL`,
        },
        {
            key: 'f',
            title: 'Bioavailability',
            formula: `F = ${fmt(bioavailability, 4)}`,
            result: `${fmt(bioavailability, 4)}`,
        },
        {
            key: 'params',
            title: 'Resolved parameters',
            formula: `k_fast = ${fmt(params.k1_fast, 4)}, k_slow = ${fmt(params.k1_slow, 4)}, k2 = ${fmt(params.k2, 4)}, k3 = ${fmt(params.k3, 4)}, Frac_fast = ${fmt(params.Frac_fast, 4)}`,
            result: `F = ${fmt(params.F, 4)}`,
        },
        {
            key: 'conversion',
            title: 'Concentration conversion',
            formula: `C(t) = A(t) × 10⁹ / V_d (pg/mL)`,
            result: `A_max = ${fmt((peakValue * vdMl) / 1e9, 4)} mg`,
        },
        {
            key: 'peak',
            title: 'Peak',
            formula: `C_max = ${fmt(peakValue, 2)} pg/mL, t_max = ${fmt(peakTime, 2)} h`,
            result: `${fmt(peakValue, 2)} pg/mL`,
        },
        {
            key: 'thresholds',
            title: 'Thresholds',
            formula: `t(C < 200 pg/mL) = ${timeBelow200H === null ? '∞' : fmt(timeBelow200H, 2) + ' h'}, t(C < 100 pg/mL) = ${timeBelow100H === null ? '∞' : fmt(timeBelow100H, 2) + ' h'}`,
            result: `${timeBelow200H === null ? '∞' : fmt(timeBelow200H, 2) + ' h'} / ${timeBelow100H === null ? '∞' : fmt(timeBelow100H, 2) + ' h'}`,
        },
    ];

    return {
        model,
        inputs,
        event,
        params,
        bioavailability,
        vdMl,
        horizonH,
        timeH,
        concentration,
        peak: { value: peakValue, timeH: peakTime },
        timeBelow200H,
        timeBelow100H,
        derivation,
    };
}
