import { describe, expect, it } from 'vitest';
import {
    Ester,
    ExtraKey,
    Route,
    interpolateConcentration_E2,
    labDoseContext,
    rawModelAtLab,
    runSimulation,
    sublingualHoldMin,
} from '../logic';
import { labDetailsText } from '../src/utils/labReport';
import { emptySyncState, fingerprintState, mergeSyncStates } from '../src/utils/syncMerge';
import { BW, NOW_H, dose, lab, regimen } from './helpers';

describe('labDoseContext', () => {
    it('picks the newest estradiol dose at or before an E2 draw', () => {
        const events = [
            dose(Route.sublingual, Ester.E2, 2, NOW_H - 30),
            dose(Route.sublingual, Ester.E2, 2, NOW_H - 6, { [ExtraKey.sublingualTier]: 3 }),
            dose(Route.oral, Ester.CPA, 12.5, NOW_H - 2),
            dose(Route.sublingual, Ester.E2, 2, NOW_H + 2),
        ];
        const ctx = labDoseContext(lab(NOW_H, 150), events)!;
        expect(ctx.event).toBe(events[1]);
        expect(ctx.hoursBefore).toBe(6);
        expect(ctx.holdMin).toBe(15);
    });

    it('matches a T lab to testosterone, not estradiol', () => {
        const events = [dose(Route.injection, Ester.TE, 100, NOW_H - 72), dose(Route.oral, Ester.E2, 2, NOW_H - 1)];
        const ctx = labDoseContext(lab(NOW_H, 600, 'ng/dl'), events)!;
        expect(ctx.event).toBe(events[0]);
        expect(ctx.holdMin).toBeNull();
    });

    it('has nothing to say past 30 days, or for a removal', () => {
        expect(labDoseContext(lab(NOW_H, 50), [dose(Route.injection, Ester.EV, 5, NOW_H - 31 * 24)])).toBeNull();
        expect(labDoseContext(lab(NOW_H, 50), [dose(Route.patchRemove, Ester.E2, 0, NOW_H - 1)])).toBeNull();
    });
});

describe('sublingualHoldMin', () => {
    it('reads a custom hold back from its theta, a tier, or the standard tier', () => {
        expect(sublingualHoldMin(dose(Route.sublingual, Ester.E2, 1, 0))).toBe(10);
        expect(sublingualHoldMin(dose(Route.sublingual, Ester.E2, 1, 0, { [ExtraKey.sublingualTier]: 0 }))).toBe(2);
        expect(sublingualHoldMin(dose(Route.sublingual, Ester.E2, 1, 0, { [ExtraKey.sublingualTheta]: 0.11 }))).toBe(
            10,
        );
        expect(sublingualHoldMin(dose(Route.oral, Ester.E2, 1, 0))).toBeNull();
    });
});

describe('labDetailsText', () => {
    const events = regimen(Route.sublingual, Ester.E2, 2, 12, 20, NOW_H - 4, { [ExtraKey.sublingualTier]: 2 });
    const sim = runSimulation(events, BW)!;

    it('writes one row per lab with the timing issue #22 asks for', () => {
        const l = { ...lab(NOW_H, 300, 'pmol/l'), assay: 'lcms' as const };
        const rows = labDetailsText([l], events, sim)
            .split('\n')
            .map(r => r.split('\t'));
        expect(rows).toHaveLength(2);
        const [h, r] = rows;
        const col = (name: string) => r[h.indexOf(name)];
        expect(col('hormone')).toBe('estradiol');
        expect(col('assay')).toBe('LC-MS/MS');
        expect(col('last dose route')).toBe('sublingual');
        expect(col('sublingual hold min')).toBe('10');
        expect(col('hours from dose to draw')).toBe('4');
        const model = interpolateConcentration_E2(sim, NOW_H)!;
        expect(Number(col('model before calibration'))).toBeCloseTo(model, 0);
        expect(col('lab vs model')).toBe(`${Math.round((300 / 3.671 / model - 1) * 100)}%`.replace(/^(\d)/, '+$1'));
    });

    it('leaves the model blank where there is no dose before the lab', () => {
        const row = labDetailsText([lab(NOW_H - 2000, 20)], events, sim)
            .split('\n')[1]
            .split('\t');
        expect(row[5]).toBe('');
        expect(rawModelAtLab(sim, lab(NOW_H - 2000, 20))).toBeNull();
        expect(row.at(-1)).toBe('');
    });
});

describe('sync and the assay', () => {
    const withLab = (l: object) => {
        const st = emptySyncState();
        st.modes.transfem.labResults = [l];
        return st;
    };
    const base = lab(NOW_H, 100);

    it('carries a newer assay edit across devices', () => {
        const local = withLab({ ...base, updatedAt: 1 });
        const remote = withLab({ ...base, assay: 'immuno', updatedAt: 2 });
        const { merged, localChanged } = mergeSyncStates(local, remote);
        expect(localChanged).toBe(true);
        expect(merged.modes.transfem.labResults[0].assay).toBe('immuno');
    });

    it('reads a lab saved before the assay existed as unchanged', () => {
        expect(fingerprintState(withLab({ ...base }))).toBe(fingerprintState(withLab({ ...base, assay: undefined })));
    });
});
