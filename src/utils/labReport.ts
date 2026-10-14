import {
    DoseEvent,
    LabResult,
    SimulationResult,
    isT_LabUnit,
    labDoseContext,
    labInModelUnit,
    rawModelAtLab,
} from '../../logic';
import { fill } from './regimenText';

type T = (key: string) => string;

const trim1 = (n: number) => String(Number(n.toFixed(1)));

/** "5.2 小时", "3 天": how long before the draw, in hours up to two days, in days past that. */
export const sinceDoseLabel = (hours: number, t: T) =>
    hours < 48 ? fill(t('lab.hours'), { n: trim1(hours) }) : fill(t('lab.days'), { n: trim1(hours / 24) });

/** Lab vs model in percent: +29 is the lab 29% above the model. */
export const labVsModelPct = (lab: number, model: number) => Math.round((lab / model - 1) * 100);

const pad2 = (n: number) => String(n).padStart(2, '0');
const localStamp = (timeH: number) => {
    const d = new Date(timeH * 3600000);
    const off = -d.getTimezoneOffset();
    const sign = off >= 0 ? '+' : '-';
    const oh = pad2(Math.floor(Math.abs(off) / 60));
    const om = pad2(Math.abs(off) % 60);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())} UTC${sign}${oh}:${om}`;
};

const ASSAY_TEXT = { lcms: 'LC-MS/MS', immuno: 'immunoassay' } as const;

/**
 * Every lab with what is needed to set it beside the model, one tab-separated
 * row each, in English whatever the app's language, so it pastes cleanly into
 * a spreadsheet or a GitHub issue and reads the same to whoever collects it
 * (issue #22 needs exactly these for sublingual). Only what the person
 * logged and what the app worked out from it: no account, no name.
 */
export function labDetailsText(labs: LabResult[], events: DoseEvent[], sim: SimulationResult | null): string {
    const header = [
        'drawn',
        'hormone',
        'lab value',
        'lab unit',
        'assay',
        'last dose route',
        'last dose drug',
        'last dose mg',
        'sublingual hold min',
        'hours from dose to draw',
        'model before calibration',
        'model unit',
        'lab vs model',
    ];
    const rows = labs
        .slice()
        .sort((a, b) => a.timeH - b.timeH)
        .map(lab => {
            const isT = isT_LabUnit(lab.unit);
            const ctx = labDoseContext(lab, events);
            const model = rawModelAtLab(sim, lab);
            const pct = model != null ? labVsModelPct(labInModelUnit(lab), model) : null;
            return [
                localStamp(lab.timeH),
                isT ? 'testosterone' : 'estradiol',
                String(lab.concValue),
                lab.unit,
                lab.assay ? ASSAY_TEXT[lab.assay] : 'not sure',
                ctx ? ctx.event.route : '',
                ctx ? ctx.event.ester : '',
                ctx ? String(ctx.event.doseMG) : '',
                ctx?.holdMin != null ? String(ctx.holdMin) : '',
                ctx ? trim1(ctx.hoursBefore) : '',
                model != null ? (isT ? String(Math.round(model)) : trim1(model)) : '',
                isT ? 'ng/dL' : 'pg/mL',
                pct != null ? `${pct > 0 ? '+' : ''}${pct}%` : '',
            ];
        });
    return [header, ...rows].map(r => r.join('\t')).join('\n');
}
