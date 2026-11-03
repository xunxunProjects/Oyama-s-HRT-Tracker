import { describe, expect, it } from 'vitest';
import {
    amenorrheaHazard,
    bioavailableTestosteroneNgDl,
    bodyCompStep,
    dhtFromTestosterone,
    freeTestosteroneNgDl,
    gnrhSuppression,
    hctStep,
    transitCompartmentAmount,
} from '../logic';

function rand(min: number, max: number): number {
    return min + Math.random() * (max - min);
}

describe('PK 10M robustness', () => {
    it('10M iterations: error count < 600', () => {
        let errors = 0;
        const N = 10_000_000;
        for (let i = 0; i < N; i++) {
            const tt = rand(0, 2000);
            const shbg = rand(1, 120);
            const alb = rand(2, 6);
            const ft = freeTestosteroneNgDl(tt, shbg, alb);
            const bt = bioavailableTestosteroneNgDl(tt, shbg, alb);
            if (!Number.isFinite(ft) || !Number.isFinite(bt) || ft < 0 || bt < ft) errors++;

            let h = rand(0.3, 0.6);
            h = hctStep(h, rand(0, 1500), rand(0.5, 24));
            if (!Number.isFinite(h)) errors++;

            const bc = bodyCompStep(rand(0, 5), rand(0, 5), rand(-1, 2), rand(0, 10));
            if (!Number.isFinite(bc.m) || !Number.isFinite(bc.fVisc)) errors++;

            const haz = amenorrheaHazard(rand(0, 1500), rand(0, 200));
            if (!Number.isFinite(haz) || haz < 0) errors++;

            const tc = transitCompartmentAmount(
                rand(0, 48),
                rand(1, 1000),
                rand(0.01, 0.5),
                rand(0.1, 2),
                Math.floor(rand(1, 6)),
            );
            if (!Number.isFinite(tc) || tc < 0) errors++;

            const dht = dhtFromTestosterone(rand(0, 1000), rand(0, 1));
            if (!Number.isFinite(dht) || dht < 0) errors++;

            const g = gnrhSuppression(rand(0, 365));
            if (!Number.isFinite(g) || g < 0) errors++;
        }
        // eslint-disable-next-line no-console
        console.log('10M error count:', errors);
        expect(errors).toBeLessThan(600);
    }, 600000);
});
