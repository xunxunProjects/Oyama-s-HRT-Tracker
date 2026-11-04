import { describe, expect, it } from 'vitest';
import {
    Ester,
    Route,
    amenorrheaHazard,
    bioavailableTestosteroneNgDl,
    bodyCompStep,
    freeTestosteroneNgDl,
    hctStep,
    interpolateConcentration_T,
    runSimulation,
} from '../logic';
import { BW, NOW_H, regimen } from './helpers';

function rand(min: number, max: number): number {
    return min + Math.random() * (max - min);
}

describe('PK model robustness (100k iterations)', () => {
    it('pure-function fuzz: 100k iterations stay finite', () => {
        for (let i = 0; i < 100_000; i++) {
            const tt = rand(0, 2000);
            const shbg = rand(1, 120);
            const alb = rand(2, 6);
            const ft = freeTestosteroneNgDl(tt, shbg, alb);
            const bt = bioavailableTestosteroneNgDl(tt, shbg, alb);
            expect(Number.isFinite(ft)).toBe(true);
            expect(Number.isFinite(bt)).toBe(true);
            expect(ft).toBeGreaterThanOrEqual(0);

            let h = rand(0.3, 0.6);
            h = hctStep(h, rand(0, 1500), rand(0.5, 24));
            expect(Number.isFinite(h)).toBe(true);

            const { m, fVisc } = bodyCompStep(rand(0, 5), rand(0, 5), rand(-1, 2), rand(0, 10));
            expect(Number.isFinite(m)).toBe(true);
            expect(Number.isFinite(fVisc)).toBe(true);

            const haz = amenorrheaHazard(rand(0, 1500), rand(0, 200));
            expect(Number.isFinite(haz)).toBe(true);
            expect(haz).toBeGreaterThanOrEqual(0);
        }
    }, 60000);

    it('interpolation fuzz: 100k random time points on a precomputed sim', () => {
        const t0 = NOW_H - 24 * 60;
        const sim = runSimulation(regimen(Route.injection, Ester.TC, 100, 168, 20, t0), BW)!;
        for (let i = 0; i < 100_000; i++) {
            const t = rand(t0 - 100, t0 + 24 * 60 + 100);
            const c = interpolateConcentration_T(sim, t);
            if (c !== null) {
                expect(Number.isFinite(c)).toBe(true);
                expect(c).toBeGreaterThanOrEqual(0);
            }
        }
    }, 60000);

    it('runSimulation fuzz: 500 random regimens do not throw', () => {
        for (let i = 0; i < 500; i++) {
            const ester = Math.random() < 0.5 ? Ester.TC : Ester.TE;
            const route = Math.random() < 0.5 ? Route.injection : Route.gel;
            const doseMg = rand(1, 200);
            const intervalH = route === Route.injection ? rand(24, 336) : 24;
            const nDoses = Math.floor(rand(1, 8));
            const t0 = NOW_H - rand(100, 2000);
            const events = regimen(route, ester, doseMg, intervalH, nDoses, t0);
            let threw = false;
            try {
                const sim = runSimulation(events, BW);
                if (sim) {
                    const c = interpolateConcentration_T(sim, NOW_H);
                    if (c !== null) expect(Number.isFinite(c)).toBe(true);
                }
            } catch (e) {
                threw = true;
            }
            expect(threw).toBe(false);
        }
    }, 60000);
});
