import React from 'react';
import { AlertCircle, ArrowRight, ChevronDown } from 'lucide-react';
import { DoseAdvisory as Advisory, HormoneLevelAdvisory } from '../../logic';
import CalibrationCurveIcon from './CalibrationCurveIcon';

// Splits a message after its first sentence. Handles the CJK full stop, which
// isn't followed by a space, and Latin/Hangul ". ", which is.
const splitLead = (text: string): [string, string] => {
    const m = /^(.+?(?:[。！？]|[.!?](?=\s)))\s*([\s\S]+)$/.exec(text);
    return m ? [m[1], m[2]] : [text, ''];
};

const alertIcon = <span className="icon-line"><AlertCircle size={16} strokeWidth={1.75} className="text-[var(--warning)]" /></span>;
const leadTone = 'font-medium text-[var(--warning)]';

// Plain text — no card, no fill, no border. This app never wraps a warning in a
// colored box anywhere else, so these shouldn't either. Only the opening
// sentence, which says what's wrong, carries the caution color, and it is all
// that shows until it's tapped: the reasoning and reassurance after it fold
// away underneath as ordinary body text. Left open, four or five lines of it
// sat between the reading and the chart on every visit.
const AdvisoryText: React.FC<{ text: string }> = ({ text }) => {
    const [lead, rest] = splitLead(text);
    const [open, setOpen] = React.useState(false);
    const bodyId = React.useId();

    if (!rest) {
        return (
            <p className="flex items-start gap-2 text-sm">
                {alertIcon}
                <span className={`min-w-0 ${leadTone}`}>{lead}</span>
            </p>
        );
    }

    return (
        <div className="text-sm">
            {/* type="button": this also renders inside the dose form. */}
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
                aria-controls={bodyId}
                className="group flex w-full items-start gap-2 text-start"
            >
                {alertIcon}
                {/* The chevron trails the last word rather than sitting at the
                    far edge, where on a wide screen it drifted off on its own. */}
                <span className={`min-w-0 ${leadTone}`}>
                    {lead}
                    <ChevronDown
                        size={16}
                        strokeWidth={1.75}
                        className={`chev ms-1 inline-block align-[-3px] text-[var(--warning)] opacity-60 group-hover:opacity-100 ${open ? 'rotate-180' : ''}`}
                    />
                </span>
            </button>
            <div id={bodyId} className="disclosure" data-open={open}>
                <div className="disclosure-inner">
                    {/* Hangs under the lead, clear of the icon (16px + the 8px gap). */}
                    <p className={`ps-6 pt-1 text-[var(--text-muted)] ${open ? 'advisory-unfold' : ''}`}>{rest}</p>
                </div>
            </div>
        </div>
    );
};

// Shared between Home (above the chart) and the dose entry form.
export const DoseAdvisoryLine: React.FC<{ advisory: Advisory; t: (k: string) => string }> = ({ advisory, t }) => (
    <AdvisoryText text={t(`advisory.${advisory.kind}.body`)} />
);

// The lab-based estradiol+testosterone combo heads-up. Shared between Home
// (above the chart) and the Lab page.
export const HormoneLevelAdvisoryLine: React.FC<{ advisory: HormoneLevelAdvisory; t: (k: string) => string }> = ({ advisory, t }) => (
    <AdvisoryText text={t(`advisory.hormone_${advisory.kind}.body`)} />
);

// Plain-text lines above the chart:
//   • dose warning — logged doses (a hard fact) running clearly high
//   • hormone-level warning — latest E2 + T labs both low or both high at once
//   • calibrate nudge — no lab yet to anchor the estimate
const DoseAdvisoryNotice: React.FC<{
    advisory: Advisory | null;
    hormoneAdvisory?: HormoneLevelAdvisory | null;
    showCalibrate: boolean;
    onCalibrate: () => void;
    t: (k: string) => string;
}> = ({ advisory, hormoneAdvisory, showCalibrate, onCalibrate, t }) => {
    if (!advisory && !hormoneAdvisory && !showCalibrate) return null;

    return (
        <div className="space-y-3.5">
            {advisory && <DoseAdvisoryLine advisory={advisory} t={t} />}
            {hormoneAdvisory && <HormoneLevelAdvisoryLine advisory={hormoneAdvisory} t={t} />}
            {showCalibrate && (
                // The calibration glyph is the Lab tab's own nav icon, so the
                // nudge points at the place it takes you.
                <button
                    onClick={onCalibrate}
                    className="group flex items-start gap-2 text-start text-xs text-[var(--text-muted)]"
                >
                    <span className="icon-line"><CalibrationCurveIcon size={16} strokeWidth={1.75} className="lucide opacity-80" /></span>
                    <span>
                        {t('advisory.calibrate.text')}{' '}
                        <span className="font-medium text-[var(--accent-ink)]">
                            <span className="underline decoration-transparent underline-offset-2 transition-colors group-hover:decoration-current">
                                {t('advisory.calibrate.cta')}
                            </span>
                            <ArrowRight size={14} strokeWidth={2} className="ms-0.5 inline-block align-[-2px] transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100" />
                        </span>
                    </span>
                </button>
            )}
        </div>
    );
};

export default DoseAdvisoryNotice;
