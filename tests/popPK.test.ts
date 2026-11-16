import { describe, expect, it } from 'vitest';
import {
    DEFAULT_POP_PK_COVARIATE_PARAMS,
    Ester,
    ExtraKey,
    Route,
    popPKCovariateFactors,
    runSimulation,
    weightK3Factor,
} from '../logic';
import { BW, dose, relErr, trapz } from './helpers';

const WEIGHTS = [50, 70, 100, 150];

describe('weightK3Factor', () => {
    it('is exactly 1 at the 70 kg reference', () => {
        expect(weightK3Factor(70)).toBe(1);
    });

    it('applies (BW/70)^-0.25 so total CL scales as (BW/70)^0.75', () => {
        for (const kg of WEIGHTS) {
            const ratio = kg / 70;
            const { clFactor, vFactor } = popPKCovariateFactors(kg, null, null, DEFAULT_POP_PK_COVARIATE_PARAMS);

            expect(vFactor).toBeCloseTo(ratio, 12);
            expect(clFactor).toBeCloseTo(Math.pow(ratio, 0.75), 12);
            expect(weightK3Factor(kg)).toBeCloseTo(Math.pow(ratio, -0.25), 12);
            expect(weightK3Factor(kg)).toBeCloseTo(clFactor / vFactor, 12);
        }
    });
});

function e2Auc(kg: number): number {
    const sim = runSimulation([dose(Route.oral, Ester.E2, 2, 0)], kg);
    if (!sim) throw new Error(`E2 simulation failed at ${kg} kg`);
    return trapz(sim.timeH, sim.concPGmL_E2);
}

function tAuc(kg: number): number {
    const sim = runSimulation([dose(Route.gel, Ester.T, 50, 0, { [ExtraKey.gelSite]: 0 })], kg);
    if (!sim) throw new Error(`T simulation failed at ${kg} kg`);
    return trapz(sim.timeH, sim.concNGdL_T);
}

describe('body weight scales total clearance', () => {
    it.each(WEIGHTS)('E2 oral AUC at %i kg follows (kg/70)^-0.75', kg => {
        const expected = e2Auc(BW) * Math.pow(kg / BW, -0.75);
        expect(relErr(e2Auc(kg), expected)).toBeLessThan(0.01);
    });

    it.each(WEIGHTS)('T gel AUC at %i kg follows (kg/70)^-0.75', kg => {
        const expected = tAuc(BW) * Math.pow(kg / BW, -0.75);
        expect(relErr(tAuc(kg), expected)).toBeLessThan(0.01);
    });
});
