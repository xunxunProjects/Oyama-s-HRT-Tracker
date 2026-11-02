import { describe, expect, it } from 'vitest';
import { BICALUTAMIDE_ORAL, Ester, Route, interpolateConcentration_BICA, runSimulation } from '../logic';
import { BW, NOW_H, dose, regimen, relErr, scan, trapz } from './helpers';

const DAY = 24;

describe('bicalutamide optional PK submodel (issue #206 §3)', () => {
    it('is off by default: a BICA dose draws no curve', () => {
        expect(runSimulation([dose(Route.oral, Ester.BICA, 50, NOW_H - 10)], BW)).toBeNull();
        const withE2 = runSimulation(
            [dose(Route.oral, Ester.BICA, 50, NOW_H - 10), dose(Route.oral, Ester.E2, 2, NOW_H - 10)],
            BW,
        )!;
        const alone = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 10)], BW)!;
        const t = NOW_H - 7;
        expect(interpolateConcentration_BICA(withE2, t)).toBe(0);
        expect(interpolateConcentration_BICA(alone, t)).toBe(0);
    });

    it('is switched on through runSimulation options', () => {
        const sim = runSimulation([dose(Route.oral, Ester.BICA, 50, NOW_H - 10)], BW, null, {
            bicalutamide: true,
        })!;
        expect(Math.max(...sim.concPGmL_BICA)).toBeGreaterThan(0);
    });

    it('back-calculates CL/F and Vd/F from AUC and t1/2 (self-check, <10%)', () => {
        const D = 50; // mg
        const sim = runSimulation([dose(Route.oral, Ester.BICA, D, NOW_H - 1000)], BW, null, {
            bicalutamide: true,
        })!;
        const { cmax, tmaxH } = scan(
            sim,
            (_s, t) => interpolateConcentration_BICA(sim, t)!,
            NOW_H - 1000,
            NOW_H - 1000 + 200,
            0.5,
        );
        const auc = trapz(sim.timeH, sim.concPGmL_BICA);
        const aucExpected = (D / BICALUTAMIDE_ORAL.clfLh) * 1000; // ng*h/mL
        expect(relErr(auc, aucExpected)).toBeLessThan(0.1);
        expect(Math.abs(tmaxH - BICALUTAMIDE_ORAL.tmaxH)).toBeLessThan(3);
        const ke = BICALUTAMIDE_ORAL.ke;
        const ka = BICALUTAMIDE_ORAL.ka;
        const vdF = BICALUTAMIDE_ORAL.vdPerKG * BW; // L
        const cmaxFormula = (D / vdF) * (ka / (ka - ke)) * (Math.exp(-ke * tmaxH) - Math.exp(-ka * tmaxH));
        expect(relErr(cmaxFormula * 1000, cmax)).toBeLessThan(0.1);
    });

    it('accumulates over weeks, not hours, on 50 mg qd', () => {
        const t0 = NOW_H - 60 * DAY;
        const sim = runSimulation(regimen(Route.oral, Ester.BICA, 50, DAY, 60, t0 + 59 * DAY), BW, null, {
            bicalutamide: true,
        })!;
        const early = interpolateConcentration_BICA(sim, t0 + 3 * DAY)!;
        const late = interpolateConcentration_BICA(sim, t0 + 55 * DAY)!;
        expect(late).toBeGreaterThan(3 * early);
        expect(Number.isFinite(late)).toBe(true);
    });
});
