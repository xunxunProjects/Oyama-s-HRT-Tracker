import { afterEach, describe, expect, it } from 'vitest';
import {
    BODY_WEIGHT_KG_MAX,
    BODY_WEIGHT_KG_MIN,
    DEFAULT_PK_PARAMS,
    Ester,
    PK_PARAM_RANGES,
    Route,
    activeCompoundName,
    applyPKOverrides,
    convertToNgDl,
    convertToPgMl,
    getActivePKParams,
    getToE2Factor,
    interpolateConcentration_E2,
    isEstradiolEster,
    isKnownEster,
    isPlausibleBodyWeightKG,
    isT_LabUnit,
    isTestosteroneEster,
    isUnmodelledDrug,
    runSimulation,
    runSimulationWithParams,
    sanitizePKParams,
} from '../logic';
import { BW, NOW_H, dose } from './helpers';

afterEach(() => applyPKOverrides(null));

describe('lab unit conversion', () => {
    it('E2: pmol/L ÷ 3.671 = pg/mL', () => {
        expect(convertToPgMl(100, 'pg/ml')).toBe(100);
        expect(convertToPgMl(367.1, 'pmol/l')).toBeCloseTo(100, 12);
    });

    it('T: nmol/L × 28.842 = ng/dL', () => {
        expect(convertToNgDl(500, 'ng/dl')).toBe(500);
        expect(convertToNgDl(10, 'nmol/l')).toBeCloseTo(288.42, 12);
    });

    it("the other hormone's unit passes through unchanged (callers filter by isT_LabUnit)", () => {
        expect(convertToPgMl(42, 'ng/dl')).toBe(42);
        expect(convertToNgDl(42, 'pmol/l')).toBe(42);
        expect(isT_LabUnit('ng/dl')).toBe(true);
        expect(isT_LabUnit('nmol/l')).toBe(true);
        expect(isT_LabUnit('pg/ml')).toBe(false);
        expect(isT_LabUnit('pmol/l')).toBe(false);
    });
});

describe('molecular-weight factors', () => {
    it.each([
        [Ester.E2, 1],
        [Ester.EB, 272.38 / 376.5],
        [Ester.EV, 272.38 / 356.5],
        [Ester.EC, 272.38 / 396.58],
        [Ester.EN, 272.38 / 384.56],
        [Ester.EU, 272.38 / 440.66],
        [Ester.TC, 288.42 / 412.6],
        [Ester.TE, 288.42 / 400.59],
        [Ester.TU, 288.42 / 456.7],
        [Ester.T, 1],
        [Ester.SPIRO, 1],
    ])('%s → %f', (ester, factor) => {
        expect(getToE2Factor(ester)).toBeCloseTo(factor, 12);
    });

    it('a 5 mg EV dose is about 3.82 mg of estradiol', () => {
        expect(5 * getToE2Factor(Ester.EV)).toBeCloseTo(3.82, 2);
    });
});

describe('drug classification', () => {
    it('sorts each code into exactly one family', () => {
        for (const e of [Ester.E2, Ester.EB, Ester.EV, Ester.EC, Ester.EN, Ester.EU]) {
            expect(isEstradiolEster(e)).toBe(true);
            expect(isTestosteroneEster(e)).toBe(false);
        }
        for (const e of [Ester.T, Ester.TC, Ester.TE, Ester.TU]) {
            expect(isTestosteroneEster(e)).toBe(true);
            expect(isEstradiolEster(e)).toBe(false);
        }
        expect(isEstradiolEster(Ester.CPA)).toBe(false);
        expect(isUnmodelledDrug(Ester.CPA)).toBe(false);
        for (const e of [Ester.SPIRO, Ester.BICA, Ester.MPA, Ester.LEUP, Ester.TRIP, Ester.RLX]) {
            expect(isUnmodelledDrug(e)).toBe(true);
            expect(isEstradiolEster(e)).toBe(false);
        }
    });

    it('treats an unknown code as unmodelled and names it by its code', () => {
        expect(isKnownEster('NEW')).toBe(false);
        expect(isKnownEster(42)).toBe(false);
        expect(isUnmodelledDrug('NEW' as Ester)).toBe(true);
        expect(activeCompoundName('NEW' as Ester)).toBe('NEW');
        expect(activeCompoundName(Ester.EV)).toBe('Estradiol');
        expect(activeCompoundName(Ester.TU)).toBe('Testosterone');
        expect(activeCompoundName(Ester.CPA)).toBe('Cyproterone Acetate');
    });
});

describe('PK parameter handling', () => {
    it('every default sits inside its accepted range', () => {
        for (const [key, [min, max]] of Object.entries(PK_PARAM_RANGES)) {
            const v = DEFAULT_PK_PARAMS[key as keyof typeof DEFAULT_PK_PARAMS];
            expect(v).toBeGreaterThanOrEqual(min);
            expect(v).toBeLessThanOrEqual(max);
        }
    });

    it('sanitizePKParams clamps, drops junk and fills in defaults', () => {
        expect(sanitizePKParams(null)).toBeNull();
        expect(sanitizePKParams('x')).toBeNull();
        expect(sanitizePKParams({ unrelated: 1 })).toBeNull();
        const out = sanitizePKParams({
            e2_kClear: 0,
            e2_oral_bio: 5,
            e2_ff_EV: 'abc',
            t_kClear: Infinity,
            e2_gel_arm: '0.07',
        })!;
        expect(out.e2_kClear).toBe(0.001);
        expect(out.e2_oral_bio).toBe(1);
        expect(out.e2_ff_EV).toBe(DEFAULT_PK_PARAMS.e2_ff_EV);
        expect(out.t_kClear).toBe(DEFAULT_PK_PARAMS.t_kClear);
        expect(out.e2_gel_arm).toBe(0.07);
        expect(out.e2_kClearInj).toBe(DEFAULT_PK_PARAMS.e2_kClearInj);
    });

    it('applyPKOverrides changes the model and null restores the defaults', () => {
        const events = [dose(Route.oral, Ester.E2, 2, NOW_H - 20)];
        const t = NOW_H - 17;
        const base = interpolateConcentration_E2(runSimulation(events, BW)!, t)!;
        applyPKOverrides({ ...DEFAULT_PK_PARAMS, e2_oral_bio: 0.06 });
        expect(getActivePKParams().e2_oral_bio).toBe(0.06);
        expect(interpolateConcentration_E2(runSimulation(events, BW)!, t)! / base).toBeCloseTo(2, 9);
        applyPKOverrides(null);
        expect(getActivePKParams()).toEqual(DEFAULT_PK_PARAMS);
    });

    it('a poisoned override cannot reach the model', () => {
        applyPKOverrides({ ...DEFAULT_PK_PARAMS, e2_kClear: -1, e2_oral_bio: NaN });
        const p = getActivePKParams();
        expect(p.e2_kClear).toBe(0.001);
        expect(p.e2_oral_bio).toBe(DEFAULT_PK_PARAMS.e2_oral_bio);
    });

    it('runSimulationWithParams uses its parameters and then restores the active ones', () => {
        applyPKOverrides({ ...DEFAULT_PK_PARAMS, e2_oral_bio: 0.05 });
        const events = [dose(Route.oral, Ester.E2, 2, NOW_H - 20)];
        const t = NOW_H - 17;
        const active = interpolateConcentration_E2(runSimulation(events, BW)!, t)!;
        const other = interpolateConcentration_E2(
            runSimulationWithParams(events, BW, { ...DEFAULT_PK_PARAMS, e2_oral_bio: 0.01 })!,
            t,
        )!;
        expect(other / active).toBeCloseTo(0.2, 9);
        expect(getActivePKParams().e2_oral_bio).toBe(0.05);
    });

    it('getActivePKParams returns a copy', () => {
        const p = getActivePKParams();
        p.e2_kClear = 99;
        expect(getActivePKParams().e2_kClear).toBe(DEFAULT_PK_PARAMS.e2_kClear);
    });
});

describe('isPlausibleBodyWeightKG', () => {
    it('accepts the documented range and nothing else', () => {
        expect(isPlausibleBodyWeightKG(BODY_WEIGHT_KG_MIN)).toBe(true);
        expect(isPlausibleBodyWeightKG(BODY_WEIGHT_KG_MAX)).toBe(true);
        expect(isPlausibleBodyWeightKG(70)).toBe(true);
        for (const bad of [BODY_WEIGHT_KG_MIN - 0.1, BODY_WEIGHT_KG_MAX + 0.1, 1e-9, 0, -70, NaN, Infinity]) {
            expect(isPlausibleBodyWeightKG(bad)).toBe(false);
        }
    });
});
