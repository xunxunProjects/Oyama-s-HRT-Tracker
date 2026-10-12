/**
 * Model output against published human pharmacokinetic data, all at 70 kg.
 *
 * Bands are deliberately loose (a factor of 1.5 unless stated): the sources
 * report group means with wide spread, often without body weight, and some are
 * not baseline-corrected. Where the model falls outside the band the test is
 * marked `it.fails`: it states where the model should land and passes while
 * the gap exists. Those are reported, not fixed, because changing the model
 * needs its own evidence and review.
 */
import { describe, expect, it } from 'vitest';
import {
    Ester,
    ExtraKey,
    Route,
    interpolateConcentration_CPA,
    interpolateConcentration_E2,
    interpolateConcentration_T,
    runSimulation,
} from '../logic';
import { BW, NOW_H, dose, regimen, scan, trapz } from './helpers';

const within = (actual: number, published: number, factor = 1.5) => {
    expect(actual).toBeGreaterThan(published / factor);
    expect(actual).toBeLessThan(published * factor);
};

describe('estradiol injections, single 5 mg IM dose', () => {
    // transfemscience.org, "An Informal Meta-Analysis of Estradiol Levels with
    // Injectable Estradiol Preparations", Table 9:
    // https://transfemscience.org/articles/injectable-e2-meta-analysis/
    // (estradiol cypionate, 155 pg/mL at 4.3 d, sits at the edge of the band:
    // the model gives about 231 pg/mL, a ratio of 1.49, so it is left out.)
    it.each([
        [Ester.EB, 971],
        [Ester.EV, 295],
        [Ester.EN, 160],
    ])('%s peak is within 1.5x of the meta-analysis Cmax of %i pg/mL', (ester, cmax) => {
        const t0 = NOW_H - 2000;
        const sim = runSimulation([dose(Route.injection, ester, 5, t0)], BW)!;
        within(scan(sim, interpolateConcentration_E2, t0, t0 + 24 * 30, 0.25).cmax, cmax);
    });
});

describe('oral estradiol valerate, single 1 mg tablet', () => {
    // Baseline-corrected LC-MS/MS bioequivalence study, 24 subjects, fasting:
    // Cmax 18.90 pg/mL, AUC0-inf 563.02 h·pg/mL, t1/2 14.36 h.
    // https://pmc.ncbi.nlm.nih.gov/articles/PMC11246651
    it('peak and total exposure are within 1.5x of the study', () => {
        const t0 = NOW_H - 300;
        const sim = runSimulation([dose(Route.oral, Ester.EV, 1, t0)], BW)!;
        within(scan(sim, interpolateConcentration_E2, t0, t0 + 48).cmax, 18.9);
        within(trapz(sim.timeH, sim.concPGmL_E2), 563);
    });
});

describe('transdermal estradiol patch', () => {
    // Climara label, Table 2 (abdomen, single application): Cavg 41 pg/mL at
    // 0.05 mg/day and 87 pg/mL at 0.1 mg/day.
    // https://www.rxreasoner.com/monographs/climara/pharmacology
    // The label Cmax (71 and 147) is about twice the model's, whose zero-order
    // input is flat across the wear period; how much of that gap is real rather
    // than the mean-of-individual-maxima effect is unsettled, so only Cavg is
    // checked.
    it.each([
        [50, 41],
        [100, 87],
    ])('%i µg/day averages within 1.5x of the label Cavg of %i pg/mL', (ug, cavg) => {
        const t0 = NOW_H - 300;
        const sim = runSimulation([dose(Route.patchApply, Ester.E2, 0, t0,
            { [ExtraKey.releaseRateUGPerDay]: ug, [ExtraKey.patchWearH]: 168 })], BW)!;
        within(scan(sim, interpolateConcentration_E2, t0, t0 + 168, 0.25).mean, cavg);
    });
});

describe('testosterone gel', () => {
    // AndroGel 1% label, Table 5, day 180, 5 g gel (50 mg testosterone):
    // Cavg 555 ± 225 ng/dL. https://medlibrary.org/lib/rx/meds/androgel-1/page/4/
    it('50 mg/day averages within 1.5x of the label Cavg of 555 ng/dL', () => {
        const sim = runSimulation(regimen(Route.gel, Ester.T, 50, 24, 30, NOW_H - 24), BW)!;
        within(scan(sim, interpolateConcentration_T, NOW_H - 24, NOW_H, 0.1).mean, 555);
    });
});

describe('known gaps against published data', () => {
    // Doll et al., "Pharmacokinetics of Sublingual Versus Oral Estradiol in
    // Transgender Women", Endocr Pract 2022;28(3):237-242, PMID 34781041.
    // LC-MS/MS, single 1 mg doses in 10 transgender women: sublingual peaked at
    // 144 pg/mL at 1 h, oral at 35 pg/mL at 8 h.
    // https://pubmed.ncbi.nlm.nih.gov/34781041/
    //
    // Sublingual: the standard tier (θ = 0.11) peaks at about 549 pg/mL, 3.8x the
    // study. This is what GitHub issue #22 reports (about 1400 pg/mL for 2 mg at
    // 55 kg). The study does not say how long the tablet was held, so even a
    // factor of 2 is generous.
    it.fails('sublingual 1 mg (standard tier) peaks within 2x of 144 pg/mL', () => {
        const t0 = NOW_H - 100;
        const sim = runSimulation([dose(Route.sublingual, Ester.E2, 1, t0, { [ExtraKey.sublingualTier]: 2 })], BW)!;
        within(scan(sim, interpolateConcentration_E2, t0, t0 + 12, 0.01).cmax, 144, 2);
    });

    // Oral: the model peaks at about 69 pg/mL at 3 h and falls with an apparent
    // half-life of about 2.3 h, so at steady state on 2 mg/day the trough is
    // under 1 pg/mL. Labels report 14-26 h (e.g. Bijuva, Angeliq). The design
    // doc lists the missing estrone/estrone sulfate reservoir as a known
    // limitation, and the parameters match upstream PKcore, so this is a model
    // simplification rather than a coding error.
    it.fails('oral 1 mg peaks within 1.5x of 35 pg/mL, no earlier than 5 h', () => {
        const t0 = NOW_H - 100;
        const sim = runSimulation([dose(Route.oral, Ester.E2, 1, t0)], BW)!;
        const { cmax, tmaxH } = scan(sim, interpolateConcentration_E2, t0, t0 + 24);
        within(cmax, 35);
        expect(tmaxH).toBeGreaterThanOrEqual(5);
    });

    // Androcur 50 mg SmPC, section 5.2: "two cyproterone acetate 50 mg tablets
    // gives maximum serum levels of about 285 ng/ml at about 3 hours"; absolute
    // bioavailability 88%. https://www.medicines.org.uk/emc/product/15996/smpc/print
    // The model peaks at about 67 ng/mL. It puts the whole dose into the
    // terminal-phase volume (14 L/kg) with F = 0.7, so total exposure is close
    // (about 0.7x) but the peak is about 4x low.
    it.fails('cyproterone 100 mg peaks within 1.5x of 285 ng/mL', () => {
        const t0 = NOW_H - 300;
        const sim = runSimulation([dose(Route.oral, Ester.CPA, 100, t0)], BW)!;
        within(scan(sim, interpolateConcentration_CPA, t0, t0 + 24).cmax, 285);
    });

    // Nebido (testosterone undecanoate 1000 mg) label: first-injection "mean
    // Cmax values of 38 nmol/L (11 ng/mL) were obtained after 7 days"; at steady
    // state "Mean Cmax and Cmin ... about 37 ... and 16 nmol/L".
    // https://www.rxreasoner.com/monographs/nebido/pharmacology
    // The model peaks at about 3.2 days and its steady-state trough/peak ratio is
    // about 0.17 against the label's 0.43. This is a shape problem, separate from
    // the average-level shortfall in suspected-bugs.test.ts; upstream PKcore's own
    // TU parameters peak at about 7 days.
    it.fails('TU 1000 mg peaks after about 7 days, and at steady state the trough is about 0.4 of the peak', () => {
        const t0 = NOW_H - 24 * 7 * 10 * 8;
        const single = runSimulation([dose(Route.injection, Ester.TU, 1000, t0)], BW)!;
        const { tmaxH } = scan(single, interpolateConcentration_T, t0, t0 + 24 * 30, 0.5);
        expect(tmaxH / 24).toBeGreaterThan(5);

        const every10wk = 24 * 7 * 10;
        const ss = runSimulation(regimen(Route.injection, Ester.TU, 1000, every10wk, 8, NOW_H - every10wk), BW)!;
        let lo = Infinity, hi = -Infinity;
        for (let t = NOW_H - every10wk; t <= NOW_H; t += 1) {
            const c = interpolateConcentration_T(ss, t)!;
            lo = Math.min(lo, c); hi = Math.max(hi, c);
        }
        expect(lo / hi).toBeGreaterThan(0.3);
    });
});
