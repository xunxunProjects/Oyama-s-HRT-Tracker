/**
 * Model output against published human pharmacokinetic data, all at 70 kg.
 *
 * Bands are deliberately loose (a factor of 1.5 unless stated): the sources
 * report group means with wide spread, often without body weight, and some are
 * not baseline-corrected. Where the model falls outside the band the test is
 * marked `it.fails`: it states where the model should land and passes while
 * the gap exists. A model change that closes one needs its own evidence,
 * cited where the parameter is set in logic.ts.
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

describe('oral estradiol at steady state', () => {
    // Leinung et al. 2018, transfeminine people on oral estradiol, mean levels
    // by dose (chemiluminescent immunoassay, draw time not stated), as tabulated
    // in https://transfemscience.org/articles/oral-e2-leinung-2018/ Table 1.
    // With no draw time, the model's mean over the dosing day is compared.
    it.each([
        [2, 62],
        [4, 102],
        [8, 159],
    ])('%i mg/day averages within 1.5x of %i pg/mL', (mg, mean) => {
        const sim = runSimulation(regimen(Route.oral, Ester.E2, mg, 24, 30, NOW_H - 24), BW)!;
        within(scan(sim, interpolateConcentration_E2, NOW_H - 24, NOW_H, 0.1).mean, mean);
    });

    it('the level before the next dose stays above half the daily mean, as a 14 h half-life implies', () => {
        // The model used to fall to under 1 pg/mL between doses of 2 mg/day.
        const sim = runSimulation(regimen(Route.oral, Ester.E2, 2, 24, 30, NOW_H - 24), BW)!;
        const { mean } = scan(sim, interpolateConcentration_E2, NOW_H - 24, NOW_H, 0.1);
        expect(interpolateConcentration_E2(sim, NOW_H - 24 - 1e-6)! / mean).toBeGreaterThan(0.5);
    });
});

describe('cyproterone acetate, single 100 mg dose', () => {
    // Androcur 50 mg SmPC, section 5.2: "two cyproterone acetate 50 mg tablets
    // gives maximum serum levels of about 285 ng/ml at about 3 hours"; terminal
    // half-life 43.9 h. https://www.medicines.org.uk/emc/product/15996/smpc/print
    // The model used to peak at about 67 ng/mL.
    it('peaks within 1.5x of 285 ng/mL, 2 to 4 h after the dose', () => {
        const t0 = NOW_H - 300;
        const sim = runSimulation([dose(Route.oral, Ester.CPA, 100, t0)], BW)!;
        const { cmax, tmaxH } = scan(sim, interpolateConcentration_CPA, t0, t0 + 24);
        within(cmax, 285);
        expect(tmaxH).toBeGreaterThanOrEqual(2);
        expect(tmaxH).toBeLessThanOrEqual(4);
    });

    it('falls with a half-life within 1.5x of 43.9 h after the first day', () => {
        const t0 = NOW_H - 300;
        const sim = runSimulation([dose(Route.oral, Ester.CPA, 100, t0)], BW)!;
        const c = (h: number) => interpolateConcentration_CPA(sim, t0 + h)!;
        within((48 * Math.LN2) / Math.log(c(48) / c(96)), 43.9);
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
        const sim = runSimulation(
            [
                dose(Route.patchApply, Ester.E2, 0, t0, {
                    [ExtraKey.releaseRateUGPerDay]: ug,
                    [ExtraKey.patchWearH]: 168,
                }),
            ],
            BW,
        )!;
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

// 1 nmol/L of testosterone is 28.84 ng/dL.
const NMOL_T = 28.84;

/** Lowest, highest and mean testosterone over [from, to], hourly. */
const tRange = (events: Parameters<typeof runSimulation>[0], from: number, to: number) => {
    const sim = runSimulation(events, BW)!;
    let lo = Infinity,
        hi = -Infinity;
    for (let t = from; t <= to; t += 1) {
        const c = interpolateConcentration_T(sim, t)!;
        lo = Math.min(lo, c);
        hi = Math.max(hi, c);
    }
    return { lo, hi, mean: scan(sim, interpolateConcentration_T, from, to, 0.5).mean };
};

describe('testosterone injections', () => {
    // The formation fraction (DEFAULT_PK_PARAMS.t_ff_*) is fitted to the first
    // two, so their averages get a tight band.
    it('enanthate weekly at the Xyosted trial mean dose averages within 1.1x of the label Cavg of 553 ng/dL', () => {
        // Xyosted label, week 12, N = 137, doses of 50, 75 or 100 mg averaging
        // 73.9 mg/week: https://medlibrary.org/lib/rx/meds/xyosted/page/4/
        const sim = runSimulation(regimen(Route.injection, Ester.TE, 73.9, 168, 20, NOW_H - 168), BW)!;
        within(scan(sim, interpolateConcentration_T, NOW_H - 168, NOW_H, 0.5).mean, 553, 1.1);
    });

    it('undecanoate on the Aveed schedule matches the label after the third injection', () => {
        // Aveed label, 750 mg at weeks 0, 4 and 14, N = 117: Cavg 495, Cmax 891,
        // Cmin 324 ng/dL. https://medlibrary.org/lib/rx/meds/aveed/page/6/
        // The label's Cmax is a mean of each man's own peak, which sits above
        // the peak of a mean curve.
        const wk = 24 * 7;
        const t0 = NOW_H - 30 * wk;
        const doses = [0, 4, 14].map(w => dose(Route.injection, Ester.TU, 750, t0 + w * wk));
        const { lo, hi, mean } = tRange(doses, t0 + 14 * wk, t0 + 24 * wk);
        within(mean, 495, 1.1);
        within(hi, 891);
        within(lo, 324);
    });

    it('undecanoate 1000 mg peaks about a week after the first injection', () => {
        // Nebido label: "mean Cmax values of 38 nmol/L (11 ng/mL) were obtained
        // after 7 days". https://www.rxreasoner.com/monographs/nebido/pharmacology
        // The model reaches about half that height: the label's first peak is as
        // high as its steady-state peak, which no linear model can give, and
        // the model is fitted to the steady state below.
        const t0 = NOW_H - 24 * 100;
        const sim = runSimulation([dose(Route.injection, Ester.TU, 1000, t0)], BW)!;
        const { tmaxH } = scan(sim, interpolateConcentration_T, t0, t0 + 24 * 30, 0.5);
        expect(tmaxH / 24).toBeGreaterThan(5);
        expect(tmaxH / 24).toBeLessThan(9);
    });

    it('undecanoate 1000 mg every 10 weeks peaks and troughs within 1.5x of the Nebido label', () => {
        // Nebido label: "Mean Cmax and Cmin values of testosterone at
        // steady-state were about 37 ... and 16 nmol/L". The model used to fall
        // to a trough of 0.17 of its peak, against the label's 0.43.
        const every10wk = 24 * 7 * 10;
        const { lo, hi } = tRange(
            regimen(Route.injection, Ester.TU, 1000, every10wk, 8, NOW_H - every10wk),
            NOW_H - every10wk,
            NOW_H,
        );
        within(hi, 37 * NMOL_T);
        within(lo, 16 * NMOL_T);
    });

    it('weekly injections at the dose transgender men settled on average within 1.5x of their mean level', () => {
        // Spratt et al., J Clin Endocrinol Metab 2017;102(7):2349, 63 transgender
        // men on weekly subcutaneous testosterone: 31.7% settled on 50 mg, 54% on
        // 75 to 80 mg, 11.1% on 100 mg and 3.2% on 150 mg (a mean of about
        // 73.6 mg/week), with a mean testosterone of 702 ng/dL. The report below
        // names neither the ester nor the draw time, so cypionate is assumed
        // and the model's weekly mean is compared.
        // https://www.healio.com/news/endocrinology/20170412/subcutaneous-testosterone-therapy-safe-effective-in-femaletomale-transgender-patients
        const sim = runSimulation(regimen(Route.injection, Ester.TC, 73.6, 168, 20, NOW_H - 168), BW)!;
        within(scan(sim, interpolateConcentration_T, NOW_H - 168, NOW_H, 0.5).mean, 702);
    });

    it('cypionate 200 mg IM gives at least the Azmiro label exposure, and not more than twice it', () => {
        // Azmiro label, 26 hypogonadal men, single 200 mg IM dose, 31 days of
        // sampling: baseline-corrected AUC 137,219 h·ng/dL, Cmax 758 ng/dL.
        // https://www.accessdata.fda.gov/drugsatfda_docs/label/2024/216318s002lbl.pdf
        // Subtracting the pre-dose level after a dose that suppresses the men's
        // own testosterone understates the dose's share, so the label is a
        // lower bound here.
        const t0 = NOW_H - 24 * 40;
        const sim = runSimulation([dose(Route.injection, Ester.TC, 200, t0)], BW)!;
        let auc = 0;
        for (let t = t0; t < t0 + 24 * 31; t += 0.5) {
            auc += 0.25 * (interpolateConcentration_T(sim, t)! + interpolateConcentration_T(sim, t + 0.5)!);
        }
        expect(auc).toBeGreaterThan(137219);
        expect(auc).toBeLessThan(2 * 137219);
    });
});

describe('known gaps against published data', () => {
    // Doll et al., "Pharmacokinetics of Sublingual Versus Oral Estradiol in
    // Transgender Women", Endocr Pract 2022;28(3):237-242, PMID 34781041.
    // LC-MS/MS, single 1 mg doses in 10 transgender women: sublingual peaked at
    // 144 pg/mL at 1 h, oral at 35 pg/mL at 8 h.
    // https://pubmed.ncbi.nlm.nih.gov/34781041/
    //
    // Sublingual: the standard tier (θ = 0.11) peaks at about 509 pg/mL, 3.5x the
    // study. This is what GitHub issue #22 reports (about 1400 pg/mL for 2 mg at
    // 55 kg). The study does not say how long the tablet was held, so even a
    // factor of 2 is generous.
    it.fails('sublingual 1 mg (standard tier) peaks within 2x of 144 pg/mL', () => {
        const t0 = NOW_H - 100;
        const sim = runSimulation([dose(Route.sublingual, Ester.E2, 1, t0, { [ExtraKey.sublingualTier]: 2 })], BW)!;
        within(scan(sim, interpolateConcentration_E2, t0, t0 + 12, 0.01).cmax, 144, 2);
    });

    // Oral: the study sampled up to 8 h, and oral estradiol was still rising
    // then. The model, which routes swallowed estradiol through an estrone pool
    // (OralPK.kE1Pool), peaks at about 10 h, but at about 16 pg/mL at 8 h it is
    // under half the study's 35. The baseline-corrected oral valerate study
    // below the injections gives 24.7 pg/mL per mg of estradiol at its peak,
    // which the model meets within 1.5x; this abstract does not say whether
    // the participants' own estradiol was subtracted.
    it('oral 1 mg is still rising at 8 h', () => {
        const t0 = NOW_H - 100;
        const sim = runSimulation([dose(Route.oral, Ester.E2, 1, t0)], BW)!;
        expect(interpolateConcentration_E2(sim, t0 + 8)!).toBeGreaterThan(interpolateConcentration_E2(sim, t0 + 6)!);
    });

    it.fails('oral 1 mg reaches 35 pg/mL at 8 h, within 1.5x', () => {
        const t0 = NOW_H - 100;
        const sim = runSimulation([dose(Route.oral, Ester.E2, 1, t0)], BW)!;
        within(interpolateConcentration_E2(sim, t0 + 8)!, 35);
    });

    // Xyosted label, week 12: Cmin 436 against a Cavg of 553 ng/dL, a ratio of
    // 0.79 (https://medlibrary.org/lib/rx/meds/xyosted/page/4/). At the same
    // average the model's weekly enanthate trough is about 240 ng/dL, a ratio of
    // 0.43: its curve swings more than this subcutaneous label's. Intramuscular
    // injections may swing more than subcutaneous ones, and the app does not
    // tell the two apart, so the enanthate depot rates are left as they are.
    it.fails('enanthate weekly at the Xyosted mean dose troughs within 1.5x of the label Cmin of 436 ng/dL', () => {
        const { lo } = tRange(regimen(Route.injection, Ester.TE, 73.9, 168, 20, NOW_H - 168), NOW_H - 168, NOW_H);
        within(lo, 436);
    });
});
