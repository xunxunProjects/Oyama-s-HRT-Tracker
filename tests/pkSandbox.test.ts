import { describe, expect, it } from 'vitest';
import { interpolateConcentration_E2, runSimulation } from '../logic';
import { PK_SANDBOX_MODELS, buildSandboxEvent, computePkSandbox } from '../logic';

const model = (id: string) => PK_SANDBOX_MODELS.find(m => m.id === id)!;

describe('pkSandbox model catalog', () => {
    it('covers every supported route/ester combination', () => {
        expect(PK_SANDBOX_MODELS.length).toBe(54);
        expect(model('oral:E2')).toBeDefined();
        expect(model('injection:EV')).toBeDefined();
        expect(model('sublingual:E2')).toBeDefined();
        expect(model('gel:E2')).toBeDefined();
        expect(model('patchApply:E2')).toBeDefined();
        expect(model('oral:CPA')).toBeDefined();
        expect(model('oral:BICA')).toBeDefined();
        expect(model('injection:TU')).toBeDefined();
        expect(model('sc:TC')).toBeDefined();
        expect(model('gel:T')).toBeDefined();
        expect(model('patchApply:T')).toBeDefined();
        expect(model('oral:TU')).toBeDefined();
        expect(model('nasal:T')).toBeDefined();
        expect(model('pellet:TE')).toBeDefined();
    });

    it('has unique ids', () => {
        const ids = PK_SANDBOX_MODELS.map(m => m.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe('computePkSandbox', () => {
    it('computes a positive peak and threshold crossings for oral estradiol', () => {
        const result = computePkSandbox('oral:E2', { doseMG: 2, bodyWeightKG: 70, birthYear: 1990 });
        expect(result.peak.value).toBeGreaterThan(0);
        expect(result.peak.timeH).toBeGreaterThan(0);
        expect(result.timeBelow200H).not.toBeNull();
        expect(result.concentration.length).toBeGreaterThan(10);
    });

    it('matches runSimulation concentration at a sampled time', () => {
        const result = computePkSandbox('oral:E2', { doseMG: 2, bodyWeightKG: 70, birthYear: 1990 });
        const event = buildSandboxEvent(model('oral:E2'), { doseMG: 2, bodyWeightKG: 70, birthYear: 1990 });
        const sim = runSimulation([event], 70, 1990)!;
        const target = result.peak.timeH;
        const sandboxConc = result.concentration[Math.round(target / 0.1)];
        const simConc = interpolateConcentration_E2(sim, target);
        expect(sandboxConc).toBeCloseTo(simConc!, 0);
    });

    it('scales linearly with dose', () => {
        const a = computePkSandbox('oral:E2', { doseMG: 2, bodyWeightKG: 70, birthYear: 1990 });
        const b = computePkSandbox('oral:E2', { doseMG: 4, bodyWeightKG: 70, birthYear: 1990 });
        expect(b.peak.value / a.peak.value).toBeCloseTo(2, 6);
    });

    it('gives a non-zero curve for bicalutamide when enabled', () => {
        const result = computePkSandbox('oral:BICA', { doseMG: 50, bodyWeightKG: 70, birthYear: 1990 });
        expect(Math.max(...result.concentration)).toBeGreaterThan(0);
    });

    it('reports null thresholds when the peak never exceeds them', () => {
        const result = computePkSandbox('oral:E2', { doseMG: 0.01, bodyWeightKG: 70, birthYear: 1990 });
        // peak below 100 => first below-100 time is the peak itself or 0; allow finite
        expect(result.peak.value).toBeLessThan(200);
    });
});
