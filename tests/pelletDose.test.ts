import { describe, expect, it } from 'vitest';
import { tPelletModule } from '../src/domain/transmasc/t-pellet';
import { ExtraKey, Ester, Route } from '../src/domain/types';
import type { DoseEvent } from '../src/domain/types';

// Handelsman 1990 (PMID 2115044; summarized in PMID 25999802) measured a
// near-linear 0.65 mg/day release from a 100 mg pellet and 1.3 mg/day from a
// 200 mg pellet: 0.65% of the implanted dose per day, for roughly 4-5 months.
const dose = 600;
const publishedRateUGPerDay = dose * 6.5; // 3900 µg/day for 600 mg implanted

const pellet = (extras?: Partial<Record<ExtraKey, number>>): DoseEvent => ({
    id: 'pellet-1',
    route: Route.pellet,
    ester: Ester.T,
    doseMG: dose,
    timeH: 0,
    extras: extras ?? {},
});

describe('pellet dose drives the release model', () => {
    it('derives the zero-order rate from the saved dose when no rate was stored', () => {
        const derived = tPelletModule.resolveParams(pellet(), 1990, 70);
        const published = tPelletModule.resolveParams(
            pellet({ [ExtraKey.releaseRateUGPerDay]: publishedRateUGPerDay }),
            1990,
            70,
        );
        expect(derived.rateMGh).toBeCloseTo(published.rateMGh, 12);
    });

    it('stops delivery after the dissolution window instead of releasing forever', () => {
        const event = pellet();
        const amount = tPelletModule.buildAmount(event, [event], tPelletModule.resolveParams(event, 1990, 70));
        const at100Days = amount.amount(100 * 24);
        const at200Days = amount.amount(200 * 24);
        expect(at100Days).toBeGreaterThan(0);
        expect(at200Days).toBeLessThan(at100Days * 0.01);
    });

    it('still honours an explicitly stored release rate', () => {
        const explicit = tPelletModule.resolveParams(pellet({ [ExtraKey.releaseRateUGPerDay]: 100 }), 1990, 70);
        const derived = tPelletModule.resolveParams(pellet(), 1990, 70);
        expect(explicit.rateMGh).not.toBeCloseTo(derived.rateMGh, 6);
    });
});
