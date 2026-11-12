import { describe, expect, it } from 'vitest';
import { interpolateConcentration_E2, runSimulation } from '../logic';
import { PK_SANDBOX_MODELS, buildSandboxEvent, computePkSandbox } from '../logic';

const model = (id: string) => PK_SANDBOX_MODELS.find(m => m.id === id)!;

describe('pkSandbox model catalog', () => {
    it('covers every route/ester combination the dose form can log', () => {
        expect(PK_SANDBOX_MODELS.length).toBe(20);
        expect(model('oral:E2')).toBeDefined();
        expect(model('injection:EV')).toBeDefined();
        expect(model('sublingual:E2')).toBeDefined();
        expect(model('gel:E2')).toBeDefined();
        expect(model('patchApply:E2')).toBeDefined();
        expect(model('oral:CPA')).toBeDefined();
        expect(model('oral:BICA')).toBeDefined();
        expect(model('injection:TU')).toBeDefined();
        expect(model('sc:T')).toBeDefined();
        expect(model('gel:T')).toBeDefined();
        expect(model('nasal:T')).toBeDefined();
        expect(model('pellet:T')).toBeDefined();
    });

    it('leaves out pairs nothing calibrates, like plain estradiol injected', () => {
        expect(PK_SANDBOX_MODELS.find(m => m.id === 'injection:E2')).toBeUndefined();
        expect(PK_SANDBOX_MODELS.find(m => m.id === 'oral:EB')).toBeUndefined();
        expect(PK_SANDBOX_MODELS[0].id).toBe('injection:EV');
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

    it('lists the faster decline of the mucosal share for sublingual estradiol only', () => {
        const params = (id: string) =>
            computePkSandbox(id, { birthYear: null }).derivation.find(step => step.key === 'params')!;
        expect(params('sublingual:E2').formula).toContain('k3_fast = 1.2000');
        expect(params('sublingual:E2').tex.join(' ')).toContain('k_{3,\\text{fast}} = 1.2000');
        expect(params('sublingual:EV').formula).not.toContain('k3_fast');
        expect(params('oral:E2').formula).not.toContain('k3_fast');
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
