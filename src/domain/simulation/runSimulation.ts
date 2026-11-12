import { Ester, Route } from '../types';
import type { DoseEvent, PKCustomParams, SimulationResult } from '../types';
import { CorePK, DEFAULT_PK_PARAMS, T_CorePK, T_ESTERS, isPlausibleBirthYear, isUnmodelledDrug } from '../constants';
import { resolveParams } from '../dispatch';
import { PrecomputedEventModel, computeMaxLifetimeH } from '../shared/eventModel';
import { getActivePKParams, setActivePKParams } from '../shared/activeParams';
import {
    bioavailableTestosteroneNgDl,
    combinedTestosteroneSuppressionFactor,
    freeTestosteroneNgDl,
} from '../features/testosterone';
import { DEFAULT_SHBG_MODEL, DEFAULT_BINDING, bindEstradiol, shbgCurve, freeEstradiol } from '../../../shbg';
import { DEFAULT_HPG_PARAMS, hpgAxisCurve } from '../features/hpg';
import { DEFAULT_BODY_COMP_PARAMS, bodyCompCurve } from '../features/bodyComp';
import { DEFAULT_LIPID_PARAMS, lipidCurve } from '../features/lipids';
import { DEFAULT_VTE_PARAMS, vteRiskCurve } from '../features/vte';
import { integrateTransmascState } from './transmascIntegration';
import { endogenousBackground } from '../features/gonadectomy';
import { dhtFromTestosterone } from '../features/fiveAlpha';

export function runSimulationWithParams(
    events: DoseEvent[],
    bodyWeightKG: number,
    params: PKCustomParams,
    birthYear: number | null = null,
): SimulationResult | null {
    const saved = getActivePKParams();
    setActivePKParams({ ...DEFAULT_PK_PARAMS, ...params });
    try {
        return runSimulation(events, bodyWeightKG, birthYear);
    } finally {
        setActivePKParams(saved);
    }
}

// Internal helpers
export function runSimulation(
    events: DoseEvent[],
    bodyWeightKG: number,
    birthYear: number | null = null,
    options: { swallowedE2?: boolean; [key: string]: unknown } = {},
): SimulationResult | null {
    // Whether the optional bicalutamide PK submodel (issue #206 §3) is on.
    // Off by default, like the SHBG submodel in shbg.ts.
    const bicaEnabled = (() => {
        if (!options) return false;
        for (const [k, v] of Object.entries(options)) {
            if (!v) continue;
            const key = k.toLowerCase();
            if (key.includes('bica') || key.includes('bicalutamide')) return true;
        }
        return false;
    })();

    // Optional endogenous testosterone suppression (adjunct to antiandrogens).
    // When a baseline testosterone (ng/dL, e.g. from the user's first blood
    // test) is supplied via options, the T curve is anchored to it and scaled
    // by the estradiol-driven suppression factor instead of being left at 0.
    const ttBaselineNgDl = (() => {
        if (!options) return null;
        for (const [k, v] of Object.entries(options)) {
            const key = k.toLowerCase();
            if (
                key === 'testosteronebaseline' ||
                key === 'testosteronebaselinengdl' ||
                key === 'ttbaseline' ||
                key === 'ttbaselinengdl'
            ) {
                const n = typeof v === 'number' ? v : Number(v);
                if (Number.isFinite(n) && n >= 0) return n;
            }
        }
        return null;
    })();
    const ttAntiandrogenPresent = (() => {
        if (!options) return false;
        for (const [k, v] of Object.entries(options)) {
            if (!v) continue;
            const key = k.toLowerCase();
            if (key.includes('antiandrogen')) return true;
        }
        return false;
    })();

    // Unmodelled drugs, and codes this build doesn't know, have no parameters
    // of their own: let through, they would fall into the estradiol branches
    // below and be counted as estradiol. Bicalutamide is modelled only when
    // explicitly enabled; otherwise it is treated as unmodelled (no curve).
    events = events.filter(e => !isUnmodelledDrug(e.ester) && !(e.ester === Ester.BICA && !bicaEnabled));
    if (events.length === 0 || bodyWeightKG <= 0) return null;
    const born = isPlausibleBirthYear(birthYear) ? birthYear : null;
    const dynamicShbgRequested = (() => {
        if (!options) return false;
        for (const [k, v] of Object.entries(options)) {
            const key = k.toLowerCase();
            if (key.includes('shbg') && (key.includes('dynamic') || v === 'dynamic' || v === true)) {
                // Only treat as "dynamic" when explicitly requested, not plain swallowedE2.
                if (key.includes('dynamic') || v === 'dynamic') return true;
            }
            if (key === 'dynamicshbg' || key === 'shbgdynamic') return true;
        }
        return false;
    })();
    const sortedEvents = [...events].sort((a, b) => a.timeH - b.timeH);
    const precomputed = sortedEvents
        .filter(e => e.route !== Route.patchRemove)
        .map(e => {
            const params = resolveParams(e, born);
            const model = new PrecomputedEventModel(e, sortedEvents, params);
            const maxLifetimeH = computeMaxLifetimeH(params, e, sortedEvents);
            return { model, ester: e.ester, startTimeH: e.timeH, maxLifetimeH };
        });

    const startTime = sortedEvents[0].timeH - 24;
    const nowH = Date.now() / (1000 * 60 * 60);
    const endTime = Math.max(sortedEvents[sortedEvents.length - 1].timeH + 24 * 14, nowH + 24);
    // Adaptive step count: at least 1 point per hour, minimum 2000. The cap only
    // guards against a pathological/malformed event time (e.g. a bad timestamp
    // decades away) blowing up memory — at realistic usage spans (even several
    // years of history) it must stay well above the "1 point per hour" floor,
    // otherwise the grid gets diluted across the whole history-to-now range and
    // the curve visibly facets (straight-line segments, no smoothing) even when
    // zoomed into a recent window. See ResultChart's linePath().
    const totalHours = endTime - startTime;
    const steps = Math.min(100000, Math.max(2000, Math.ceil(totalHours)));

    // Different Vd for E2, CPA and T
    const plasmaVolumeML_E2 = CorePK.vdPerKG * bodyWeightKG * 1000; // E2: ~2.0 L/kg
    const plasmaVolumeML_CPA = CorePK.vdPerKG_CPA * bodyWeightKG * 1000; // CPA: ~14.0 L/kg
    const plasmaVolumeML_BICA = CorePK.vdPerKG_BICA * bodyWeightKG * 1000; // Bicalutamide: ~2.3 L/kg
    const plasmaVolumeML_T = T_CorePK.vdPerKG * bodyWeightKG * 1000; // T: ~1.0 L/kg

    const timeH: number[] = [];
    const concPGmL: number[] = [];
    const concPGmL_E2: number[] = [];
    const concPGmL_CPA: number[] = []; // Will store in ng/mL (not pg/mL)
    const concPGmL_BICA: number[] = []; // Will store in ng/mL (not pg/mL)
    const concNGdL_T: number[] = []; // Total testosterone in ng/dL
    const concPGmL_E2_swallowed: number[] = [];
    let auc = 0;

    const stepSize = (endTime - startTime) / (steps - 1);
    const gridTimes = Array.from({ length: steps }, (_, i) => startTime + i * stepSize);

    // Add dense sampling points after every dose, so peaks and the first hours
    // after a dose are drawn from the model rather than from a straight line
    // across a coarse grid. This used to be limited to doses still contributing
    // at the end of the grid, which always excluded short-acting doses (the
    // grid ends at least 14 days after the last dose): with a long history the
    // base grid is about one point per hour, so a sublingual peak was drawn up
    // to about 7% low and the level read shortly after a dose about half the
    // model's value. Offsets past a dose's own lifetime add nothing and are
    // skipped. 0.75 h is there for the sublingual peak, which comes at about
    // 0.68 h (OralPK.kElimSL): between 0.5 and 1 h alone it was drawn 4% low.
    const periEventOffsets = [0.25, 0.5, 0.75, 1, 2, 4, 6, 8, 12, 24, 48];
    const periEventTimes: number[] = [];
    for (const pc of precomputed) {
        for (const offset of periEventOffsets) {
            if (offset > pc.maxLifetimeH) break;
            const t = pc.startTimeH + offset;
            if (t >= startTime && t <= endTime) {
                periEventTimes.push(t);
            }
        }
    }

    // The current time is a sample point too, so the "current level" read off
    // the result is the model's value rather than an interpolation.
    const nowTimes = nowH >= startTime && nowH <= endTime ? [nowH] : [];

    const eventTimes = sortedEvents.map(e => e.timeH);
    const allTimes = Array.from(new Set([...gridTimes, ...eventTimes, ...periEventTimes, ...nowTimes])).sort(
        (a, b) => a - b,
    );

    // `precomputed` and `allTimes` are both sorted ascending by time, so which
    // events can contribute at a given t forms a sliding window: events
    // activate (once) as t reaches their startTimeH and drop out (once) once
    // their contribution has decayed past maxLifetimeH. Tracking that window
    // instead of rescanning the full event list at every grid point turns the
    // hot loop from O(steps × events) into O(steps × concurrently-active
    // events) — the same result, since a dropped event's amount() is 0 at t
    // anyway, just without visiting every historical event to find that out.
    let activateIdx = 0;
    const active: typeof precomputed = [];

    for (let i = 0; i < allTimes.length; i++) {
        const t = allTimes[i];

        while (activateIdx < precomputed.length && precomputed[activateIdx].startTimeH <= t) {
            active.push(precomputed[activateIdx]);
            activateIdx++;
        }
        for (let j = 0; j < active.length;) {
            if (t - active[j].startTimeH > active[j].maxLifetimeH) {
                active[j] = active[active.length - 1];
                active.pop();
            } else {
                j++;
            }
        }

        let totalAmountMG_E2 = 0;
        let totalAmountMG_CPA = 0;
        let totalAmountMG_BICA = 0;
        let totalAmountMG_T = 0;
        let swallowedAmountMG_E2 = 0;

        for (const { model, ester } of active) {
            const amount = model.amount(t);
            if (ester === Ester.CPA) {
                totalAmountMG_CPA += amount;
            } else if (ester === Ester.BICA) {
                totalAmountMG_BICA += amount;
            } else if (T_ESTERS.has(ester)) {
                totalAmountMG_T += amount;
            } else {
                totalAmountMG_E2 += amount;
                if (options.swallowedE2) swallowedAmountMG_E2 += model.swallowedAmount(t);
            }
        }

        // E2: pg/mL (using E2 Vd)
        const currentConc_E2 = (totalAmountMG_E2 * 1e9) / plasmaVolumeML_E2;

        // CPA: ng/mL (using CPA Vd, convert from mg to ng: 1e6 instead of 1e9)
        const currentConc_CPA = (totalAmountMG_CPA * 1e6) / plasmaVolumeML_CPA;

        // Bicalutamide: ng/mL (issue #206 §3), optional submodel.
        const currentConc_BICA = (totalAmountMG_BICA * 1e6) / plasmaVolumeML_BICA;

        // T: ng/dL (mg → ng: *1e6; mL → dL: /100 → factor 1e8/V_mL).
        // Optional endogenous suppression (adjunct to antiandrogens): when a
        // baseline testosterone is supplied via options, anchor the curve to it
        // and scale by the estradiol-driven suppression factor, so the T line
        // reflects the drug's reduction of an initial measured level rather
        // than being left at 0.
        let currentConc_T = (totalAmountMG_T * 1e8) / plasmaVolumeML_T;
        if (ttBaselineNgDl !== null) {
            currentConc_T +=
                ttBaselineNgDl * combinedTestosteroneSuppressionFactor(currentConc_E2, ttAntiandrogenPresent);
        }

        // Total in pg/mL (convert CPA from ng/mL to pg/mL for compatibility)
        const currentConc = currentConc_E2 + currentConc_CPA * 1000;

        timeH.push(t);
        concPGmL.push(currentConc);
        concPGmL_E2.push(currentConc_E2); // pg/mL
        concPGmL_CPA.push(currentConc_CPA); // ng/mL
        concPGmL_BICA.push(currentConc_BICA); // ng/mL
        concNGdL_T.push(currentConc_T); // ng/dL
        if (options.swallowedE2 || dynamicShbgRequested)
            concPGmL_E2_swallowed.push((swallowedAmountMG_E2 * 1e9) / plasmaVolumeML_E2);

        if (i > 0) {
            const dt = t - allTimes[i - 1];
            auc += 0.5 * (currentConc_E2 + concPGmL_E2[i - 1]) * dt;
        }
    }

    const concNGdL_T_free = concNGdL_T.map(c => freeTestosteroneNgDl(c, 30, 4.3));
    const shbgBaselineNM = DEFAULT_SHBG_MODEL.baselineNM;
    const concPGmL_E2_free = concPGmL_E2.map(c => bindEstradiol(c, shbgBaselineNM, DEFAULT_BINDING).freePgML);
    const concPGmL_E2_bioavailable = concPGmL_E2.map(c => {
        const b = bindEstradiol(c, shbgBaselineNM, DEFAULT_BINDING);
        return c * (1 - b.fractionShbg);
    });
    // Dynamic SHBG is opt-in: it needs the swallowed share of estradiol, which
    // is computed internally when requested even if not otherwise returned.
    const result: SimulationResult = {
        timeH,
        concPGmL,
        concPGmL_E2,
        concPGmL_CPA,
        concPGmL_BICA,
        concNGdL_T,
        concNGdL_T_free,
        concPGmL_E2_free,
        concPGmL_E2_bioavailable,
        auc,
    };
    if (options.swallowedE2 || dynamicShbgRequested) result.concPGmL_E2_swallowed = concPGmL_E2_swallowed;
    if (dynamicShbgRequested) {
        try {
            const shbg = shbgCurve(result, DEFAULT_SHBG_MODEL);
            result.shbgNM = shbg;
            result.shbgNmolL = shbg;
            result.concNM_SHBG = shbg;
            const freeDynamic = freeEstradiol(result, {
                shbg: 'dynamic',
                model: DEFAULT_SHBG_MODEL,
                binding: DEFAULT_BINDING,
            });
            result.concPGmL_E2_free_dynamic = freeDynamic.freePgML;
            result.concPGmL_E2_freeDynamic = freeDynamic.freePgML;
        } catch {
            // shbgCurve throws when swallowed share is missing; leave unset.
        }
    }
    if (!options.swallowedE2 && !dynamicShbgRequested) {
        // Keep the previous contract: swallowed share is only returned when asked.
        delete result.concPGmL_E2_swallowed;
    }

    // HPG axis (A3): opt-in dynamic R_HPG from the estradiol curve. Endogenous
    // testosterone is reported only when a baseline was supplied.
    const hpgRequested = (() => {
        if (!options) return false;
        for (const [k] of Object.entries(options)) {
            const key = k.toLowerCase();
            if (key.includes('hpg') || key.includes('endogenous')) return true;
            if (key === 'rhp' || key === 'rhpG'.toLowerCase()) return true;
        }
        return false;
    })();
    if (hpgRequested || ttBaselineNgDl !== null) {
        const r = hpgAxisCurve(result.concPGmL_E2, result.timeH, DEFAULT_HPG_PARAMS);
        result.rHPG = r;
        if (ttBaselineNgDl !== null) {
            result.endogenousTNgDl = r.map(x => ttBaselineNgDl * x);
            result.endogenousT_ngDl = result.endogenousTNgDl;
        }
    }

    // Body composition (A4): slow variables driven by 90-d rolling E2 average.
    const bc = bodyCompCurve(result, DEFAULT_BODY_COMP_PARAMS);
    result.muscleM = bc.m;
    result.bodyCompM = bc.m;
    result.visceralFat = bc.fVisc;
    result.bodyCompFVisc = bc.fVisc;

    // Lipid / hepatic (A5).
    result.ldl = lipidCurve(result, DEFAULT_LIPID_PARAMS);
    result.lipidLDL = result.ldl;

    // VTE / coagulation risk (A8).
    result.vteRisk = vteRiskCurve(result, DEFAULT_VTE_PARAMS);

    // Plan B transmasculine wiring: only when testosterone is present.
    const hasT = result.concNGdL_T.some(v => v > 0);
    if (hasT) {
        result.concNGdL_T_free = result.concNGdL_T_free ?? result.concNGdL_T.map(c => freeTestosteroneNgDl(c, 30, 4.3));
        result.concNGdL_T_bioavailable = result.concNGdL_T.map(c => bioavailableTestosteroneNgDl(c, 30, 4.3));
        const integ = integrateTransmascState(result, {});
        result.hct = integ.hct;
        result.amenorrheaProb = integ.amenorrheaProb;
        result.tMuscle = integ.muscle;
        result.tVisceralFat = integ.viscFat;
        result.endogenousE2PgMl = result.concNGdL_T.map(c => endogenousBackground('intact', 1, 0.05 * c).e2Endo);
        result.dhtNgDl = result.concNGdL_T.map(c => dhtFromTestosterone(c, 0));
    }

    return result;
}
