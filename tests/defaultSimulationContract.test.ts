import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Ester, Route, runSimulation } from '../logic';
import { BW, NOW_H, dose } from './helpers';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const E2_ONLY_KEYS = [
    'auc',
    'bodyCompFVisc',
    'bodyCompM',
    'concNGdL_T',
    'concNGdL_T_free',
    'concPGmL',
    'concPGmL_CPA',
    'concPGmL_BICA',
    'concPGmL_E2',
    'concPGmL_E2_bioavailable',
    'concPGmL_E2_free',
    'ldl',
    'lipidLDL',
    'muscleM',
    'timeH',
    'visceralFat',
    'vteRisk',
].sort();

describe('default simulation result contract', () => {
    it('always returns the same base curves with no options', () => {
        const sim = runSimulation([dose(Route.oral, Ester.E2, 2, NOW_H - 100)], BW)!;
        expect(Object.keys(sim).sort()).toEqual(E2_ONLY_KEYS);
    });

    it('adds the transmasculine curves when testosterone is present', () => {
        const sim = runSimulation([dose(Route.injection, Ester.TC, 100, NOW_H - 100)], BW)!;
        expect(Object.keys(sim)).toEqual(expect.arrayContaining(['concNGdL_T_bioavailable', 'dhtNgDl', 'hct']));
    });

    it('documents constant protein binding as on by default and dynamic SHBG as opt-in', () => {
        expect(read('Algorithm Explanation.md')).not.toContain('（可选，默认关闭，应用不调用）');
        expect(read('Algorithm Explanation.md')).not.toContain('## 18) SHBG 与游离雌二醇（可选子模型，默认关闭）');
        expect(read('docs/AI-GUIDE.md')).toContain('constant binding');
        expect(read('docs/shbg.md')).not.toContain('default simulation output is\nunchanged');
        expect(read('shbg.ts')).not.toContain('Nothing in the app calls it');
    });
});
