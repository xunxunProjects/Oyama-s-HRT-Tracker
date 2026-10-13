import { describe, expect, it } from 'vitest';
import { Ester, Route, getDoseAdvisory, getHormoneLevelAdvisory } from '../logic';
import { NOW_H, dose, lab, regimen } from './helpers';

// Day boundaries in getDoseAdvisory are local days, and the suite runs in UTC
// (tests/setup.ts). NOW_H is a multiple of 24, so NOW_H - 12 is noon of the
// previous day.
const NOON = NOW_H - 12;

describe('getDoseAdvisory', () => {
    it('is null with no history or a usual regimen', () => {
        expect(getDoseAdvisory([], NOW_H)).toBeNull();
        expect(getDoseAdvisory(regimen(Route.oral, Ester.E2, 4, 24, 14, NOON), NOW_H)).toBeNull();
        expect(getDoseAdvisory(regimen(Route.injection, Ester.EV, 5, 168, 6, NOON), NOW_H)).toBeNull();
        expect(getDoseAdvisory(regimen(Route.oral, Ester.CPA, 10, 24, 14, NOON), NOW_H)).toBeNull();
        expect(getDoseAdvisory(regimen(Route.injection, Ester.TC, 100, 168, 6, NOON), NOW_H)).toBeNull();
    });

    it('flags more than 12 mg of daily-route estradiol in one day', () => {
        expect(getDoseAdvisory([dose(Route.oral, Ester.E2, 12, NOON)], NOW_H)).toBeNull();
        expect(
            getDoseAdvisory(
                [dose(Route.oral, Ester.E2, 7, NOON), dose(Route.sublingual, Ester.E2, 6, NOON + 1)],
                NOW_H,
            ),
        ).toEqual({ kind: 'e2' });
    });

    it('sums by day, not across days', () => {
        expect(
            getDoseAdvisory([dose(Route.oral, Ester.E2, 8, NOON), dose(Route.oral, Ester.E2, 8, NOON - 24)], NOW_H),
        ).toBeNull();
    });

    it('ignores doses older than 14 days and doses in the future', () => {
        expect(getDoseAdvisory([dose(Route.oral, Ester.E2, 20, NOW_H - 24 * 15)], NOW_H)).toBeNull();
        expect(getDoseAdvisory([dose(Route.oral, Ester.E2, 20, NOW_H + 5)], NOW_H)).toBeNull();
    });

    it('infers a weekly injection rate from the injection cadence', () => {
        // 10 mg every 3.5 days is 20 mg/week: at the ceiling, not above it.
        expect(getDoseAdvisory(regimen(Route.injection, Ester.EV, 10, 84, 4, NOON), NOW_H)).toBeNull();
        // 12 mg every 3.5 days is 24 mg/week.
        expect(getDoseAdvisory(regimen(Route.injection, Ester.EV, 12, 84, 4, NOON), NOW_H)).toEqual({ kind: 'e2' });
    });

    it('a lone large injection is judged on its own size only', () => {
        expect(getDoseAdvisory([dose(Route.injection, Ester.EV, 40, NOON)], NOW_H)).toBeNull();
        expect(getDoseAdvisory([dose(Route.injection, Ester.EV, 60, NOON)], NOW_H)).toEqual({ kind: 'e2' });
    });

    it('a long-interval undecanoate depot is not mistaken for a huge weekly dose', () => {
        // 1000 mg every 12 weeks ≈ 83 mg/week.
        expect(getDoseAdvisory(regimen(Route.injection, Ester.TU, 1000, 24 * 7 * 12, 2, NOON), NOW_H)).toBeNull();
    });

    it('flags testosterone above 200 mg/week injected or 150 mg/day transdermal', () => {
        expect(getDoseAdvisory(regimen(Route.injection, Ester.TE, 250, 168, 3, NOON), NOW_H)).toEqual({ kind: 't' });
        expect(getDoseAdvisory([dose(Route.gel, Ester.T, 200, NOON)], NOW_H)).toEqual({ kind: 't' });
    });

    it('flags cyproterone above 12.5 mg/day', () => {
        expect(getDoseAdvisory([dose(Route.oral, Ester.CPA, 25, NOON)], NOW_H)).toEqual({ kind: 'cpa' });
    });

    it('reads cyproterone taken every few days as its daily average', () => {
        // 25 mg every 2 or 3 days is 12.5 or 8.3 mg/day.
        expect(getDoseAdvisory(regimen(Route.oral, Ester.CPA, 25, 48, 7, NOON), NOW_H)).toBeNull();
        expect(getDoseAdvisory(regimen(Route.oral, Ester.CPA, 25, 72, 5, NOON), NOW_H)).toBeNull();
        expect(getDoseAdvisory(regimen(Route.oral, Ester.CPA, 25, 24, 7, NOON), NOW_H)).toEqual({ kind: 'cpa' });
    });

    it('counts a larger latest cyproterone dose at once', () => {
        const events = regimen(Route.oral, Ester.CPA, 12.5, 24, 13, NOON - 24);
        expect(getDoseAdvisory([...events, dose(Route.oral, Ester.CPA, 12.5, NOON)], NOW_H)).toBeNull();
        expect(getDoseAdvisory([...events, dose(Route.oral, Ester.CPA, 50, NOON)], NOW_H)).toEqual({ kind: 'cpa' });
    });

    it('reads oral valerate as the estradiol it carries', () => {
        // 13 mg of valerate is 9.9 mg of estradiol, under the 12 mg ceiling.
        expect(getDoseAdvisory([dose(Route.oral, Ester.EV, 13, NOON)], NOW_H)).toBeNull();
        expect(getDoseAdvisory([dose(Route.oral, Ester.EV, 16, NOON)], NOW_H)).toEqual({ kind: 'e2' });
    });

    it('names estradiol and cyproterone together when both run high', () => {
        expect(
            getDoseAdvisory([dose(Route.oral, Ester.E2, 20, NOON), dose(Route.oral, Ester.CPA, 25, NOON)], NOW_H),
        ).toEqual({ kind: 'e2_cpa' });
    });

    it('otherwise reports the family that is furthest over its ceiling', () => {
        // CPA at 2× its ceiling, T injections at 1.5×.
        const events = [
            dose(Route.oral, Ester.CPA, 25, NOON),
            ...regimen(Route.injection, Ester.TC, 300, 168, 3, NOON),
        ];
        expect(getDoseAdvisory(events, NOW_H)).toEqual({ kind: 'cpa' });
    });

    it('unmodelled drugs never count as estradiol', () => {
        expect(getDoseAdvisory([dose(Route.oral, Ester.SPIRO, 200, NOON)], NOW_H)).toBeNull();
    });
});

describe('getHormoneLevelAdvisory', () => {
    it('needs at least one lab of each hormone', () => {
        expect(getHormoneLevelAdvisory([])).toBeNull();
        expect(getHormoneLevelAdvisory([lab(1, 10)])).toBeNull();
        expect(getHormoneLevelAdvisory([lab(1, 10, 'ng/dl')])).toBeNull();
    });

    it('flags both low and both high', () => {
        expect(getHormoneLevelAdvisory([lab(1, 20), lab(1, 30, 'ng/dl')])).toEqual({ kind: 'both_low' });
        expect(getHormoneLevelAdvisory([lab(1, 400), lab(1, 500, 'ng/dl')])).toEqual({ kind: 'both_high' });
    });

    it('stays quiet when only one is off, or exactly at a threshold', () => {
        expect(getHormoneLevelAdvisory([lab(1, 20), lab(1, 500, 'ng/dl')])).toBeNull();
        expect(getHormoneLevelAdvisory([lab(1, 30), lab(1, 49, 'ng/dl')])).toBeNull();
        expect(getHormoneLevelAdvisory([lab(1, 300), lab(1, 301, 'ng/dl')])).toBeNull();
    });

    it('uses the latest lab of each hormone independently, after unit conversion', () => {
        const labs = [
            lab(10, 500), // old high E2
            lab(20, 73.42, 'pmol/l'), // latest E2: 20 pg/mL
            lab(5, 1.0, 'nmol/l'), // latest T: 28.8 ng/dL
            lab(1, 900, 'ng/dl'), // old high T
        ];
        expect(getHormoneLevelAdvisory(labs)).toEqual({ kind: 'both_low' });
    });
});
