import { afterEach, describe, expect, it } from 'vitest';
import {
    AGE_REF_YEARS,
    DEFAULT_PK_PARAMS,
    Ester,
    Route,
    ageAtH,
    ageClearanceMultiplier,
    applyPKOverrides,
    computeCalibration,
    interpolateConcentration_CPA,
    interpolateConcentration_E2,
    interpolateConcentration_T,
    isPlausibleBirthYear,
    runSimulation,
    runSimulationWithParams,
} from '../logic';
import { emptySyncState, fingerprintState, mergeSyncStates, normalizeSyncState } from '../src/utils/syncMerge';
import { BW, NOW_H, dose, lab, regimen, trapz } from './helpers';

// The frozen "now" is mid-October 2024, so born 1970 is 54 at NOW_H, the reference age.
const AT_REF = 1970;
/** Year of birth that puts someone at about `age` at NOW_H. */
const bornAt = (age: number) => Math.round(1970 + NOW_H / (365.2425 * 24) - age - 0.5);

describe('age at a moment', () => {
    it('counts from the middle of the year of birth', () => {
        expect(ageAtH(AT_REF, NOW_H)).toBeCloseTo(54.26, 2);
        expect(ageAtH(1990, NOW_H)).toBeCloseTo(34.26, 2);
    });

    it('accepts 1900 to the current year, whole years only', () => {
        expect(isPlausibleBirthYear(1990)).toBe(true);
        expect(isPlausibleBirthYear(1900)).toBe(true);
        expect(isPlausibleBirthYear(2024)).toBe(true);
        for (const bad of [1899, 2025, 1990.5, NaN, Infinity, '1990', null, undefined]) {
            expect(isPlausibleBirthYear(bad)).toBe(false);
        }
    });
});

describe('ageClearanceMultiplier', () => {
    /** The multiplier for someone born in AT_REF, at the moment they are exactly `age`. */
    const at = (hormone: 'e2' | 't', age: number) =>
        ageClearanceMultiplier(hormone, AT_REF, (AT_REF + 0.5 + age - 1970) * 365.2425 * 24);

    it('is 1 with no year of birth, and at the reference age', () => {
        expect(ageClearanceMultiplier('e2', null, NOW_H)).toBe(1);
        expect(ageClearanceMultiplier('t', null, NOW_H)).toBe(1);
        expect(at('e2', AGE_REF_YEARS)).toBeCloseTo(1, 12);
        expect(at('t', AGE_REF_YEARS)).toBeCloseTo(1, 12);
    });

    it('testosterone: Coviello 2006, 1821 L/day at 19–35 against 1390 at 59–75', () => {
        expect(at('t', 27) / at('t', 67)).toBeCloseTo(1821 / 1390, 10);
    });

    it('estradiol: Longcope 1971, about 25% lower at 70–88 than in young women', () => {
        // The old group's midpoint, 79, is past the cap, so check the slope inside it.
        expect(Math.log(at('e2', 27) / at('e2', 75)) / 48).toBeCloseTo(Math.log(1 / 0.75) / 52, 12);
    });

    it('is faster when younger and slower when older', () => {
        expect(at('e2', 25)).toBeGreaterThan(1);
        expect(at('e2', 70)).toBeLessThan(1);
        expect(at('t', 25)).toBeGreaterThan(1);
        expect(at('t', 70)).toBeLessThan(1);
    });

    it('holds its end value outside 19–75', () => {
        for (const h of ['e2', 't'] as const) {
            expect(at(h, 12)).toBeCloseTo(at(h, 19), 12);
            expect(at(h, 90)).toBeCloseTo(at(h, 75), 12);
        }
    });
});

describe('the simulation with a year of birth', () => {
    const t0 = NOW_H - 2000;

    it('changes nothing without one, or with one it cannot use', () => {
        const events = regimen(Route.injection, Ester.EV, 5, 168, 6, NOW_H - 84);
        const base = runSimulation(events, BW)!;
        for (const born of [null, 1800, 2030, 1990.5, NaN]) {
            const sim = runSimulation(events, BW, born)!;
            expect(sim.concPGmL_E2).toEqual(base.concPGmL_E2);
        }
    });

    it('scales estradiol exposure by 1 / multiplier (AUC = F·D/k3)', () => {
        const events = [dose(Route.oral, Ester.E2, 2, t0)];
        const born = bornAt(25);
        const base = runSimulation(events, BW)!;
        const young = runSimulation(events, BW, born)!;
        const mul = ageClearanceMultiplier('e2', born, t0);
        expect(mul).toBeGreaterThan(1.1);
        expect(young.auc / base.auc).toBeCloseTo(1 / mul, 3);
    });

    it('scales testosterone exposure the same way, with its own slope', () => {
        const events = [dose(Route.injection, Ester.TE, 100, t0)];
        const born = bornAt(70);
        const base = runSimulation(events, BW)!;
        const old = runSimulation(events, BW, born)!;
        const mul = ageClearanceMultiplier('t', born, t0);
        expect(mul).toBeLessThan(0.95);
        const ratio = trapz(old.timeH, old.concNGdL_T) / trapz(base.timeH, base.concNGdL_T);
        expect(ratio).toBeCloseTo(1 / mul, 2);
    });

    it('takes each dose at the age it was taken', () => {
        // Born 1985: 19.3 at a dose in early 2005, 39.3 at one in early 2025.
        const early = dose(Route.oral, Ester.E2, 2, 35 * 8765.82);
        const late = dose(Route.oral, Ester.E2, 2, 55 * 8765.82);
        const auc = (e: typeof early) => runSimulation([e], BW, 1985)!.auc / runSimulation([e], BW)!.auc;
        expect(auc(early)).toBeCloseTo(1 / ageClearanceMultiplier('e2', 1985, early.timeH), 3);
        expect(auc(late)).toBeCloseTo(1 / ageClearanceMultiplier('e2', 1985, late.timeH), 3);
        expect(auc(early)).toBeLessThan(auc(late));
    });

    it('leaves cyproterone alone', () => {
        const events = [dose(Route.oral, Ester.CPA, 10, NOW_H - 20)];
        const base = runSimulation(events, BW)!;
        const sim = runSimulation(events, BW, bornAt(25))!;
        expect(interpolateConcentration_CPA(sim, NOW_H)).toBe(interpolateConcentration_CPA(base, NOW_H));
    });

    it('does not mix the hormones up', () => {
        const events = [dose(Route.gel, Ester.T, 50, NOW_H - 10), dose(Route.oral, Ester.E2, 2, NOW_H - 10)];
        const born = bornAt(25);
        const sim = runSimulation(events, BW, born)!;
        const tOnly = runSimulation([events[0]], BW, born)!;
        const e2Only = runSimulation([events[1]], BW, born)!;
        expect(interpolateConcentration_T(sim, NOW_H)).toBeCloseTo(interpolateConcentration_T(tOnly, NOW_H)!, 9);
        expect(interpolateConcentration_E2(sim, NOW_H)).toBeCloseTo(interpolateConcentration_E2(e2Only, NOW_H)!, 9);
    });
});

describe('calibration with a year of birth', () => {
    // Ten weeks of doses, so the multiplier is the same for all of them to
    // within 0.2%, and an age-adjusted model is the default one with both
    // clearances scaled by it. Calibrating either should come to the same
    // answer; a clearance grid run without the year of birth would not.
    const events = regimen(Route.injection, Ester.EV, 5, 168, 10, NOW_H - 84);
    const born = bornAt(25);
    const mul = ageClearanceMultiplier('e2', born, NOW_H - 800);
    const scaled = (by: number) => ({
        ...DEFAULT_PK_PARAMS,
        e2_kClear: DEFAULT_PK_PARAMS.e2_kClear * by,
        e2_kClearInj: DEFAULT_PK_PARAMS.e2_kClearInj * by,
    });
    // Labs from someone clearing 1.5 times faster than the adjusted model, at 1.2 times the level.
    const truth = runSimulationWithParams(events, BW, scaled(1.5), born)!;
    const labs = [NOW_H - 1000, NOW_H - 560, NOW_H - 230, NOW_H - 100].map(t =>
        lab(t, interpolateConcentration_E2(truth, t)! * 1.2),
    );

    afterEach(() => applyPKOverrides(null));

    for (const method of ['mipd', 'ekf'] as const) {
        it(`${method}: fits as it would on the same model with the clearance scaled in`, () => {
            const sim = runSimulation(events, BW, born)!;
            const cal = computeCalibration(sim, events, BW, labs, method, 'retrospective', born);
            applyPKOverrides(scaled(mul));
            const baked = computeCalibration(runSimulation(events, BW)!, events, BW, labs, method);
            expect(cal.kMul).toBeGreaterThan(1.1);
            expect(cal.kMul).toBeCloseTo(baked.kMul, 2);
            expect(cal.scale).toBeCloseTo(baked.scale, 2);
        });
    }
});

describe('syncing the year of birth', () => {
    it('reads it from a payload, and anything implausible as none', () => {
        expect(normalizeSyncState({ birthYear: 1990, birthYearUpdatedAt: 5 })).toMatchObject({
            birthYear: 1990,
            birthYearUpdatedAt: 5,
        });
        expect(normalizeSyncState({ birthYear: 1800 }).birthYear).toBeNull();
        expect(normalizeSyncState({ birthYear: null }).birthYear).toBeNull();
        expect(normalizeSyncState({}).birthYear).toBeUndefined();
    });

    it('resolves last-write-wins, a removal included', () => {
        const local = { ...emptySyncState(), birthYear: 1990, birthYearUpdatedAt: 100 };
        const removed = { ...emptySyncState(), birthYear: null, birthYearUpdatedAt: 200 };
        const { merged, localChanged } = mergeSyncStates(local, removed);
        expect(merged.birthYear).toBeNull();
        expect(localChanged).toBe(true);
        expect(mergeSyncStates(removed, local).merged.birthYear).toBeNull();
    });

    it('keeps it against a payload that says nothing about it', () => {
        const local = { ...emptySyncState(), birthYear: 1990, birthYearUpdatedAt: 100 };
        const { merged, remoteStale } = mergeSyncStates(local, emptySyncState());
        expect(merged.birthYear).toBe(1990);
        expect(remoteStale).toBe(true);
        expect(fingerprintState(merged)).not.toBe(fingerprintState(emptySyncState()));
    });
});
