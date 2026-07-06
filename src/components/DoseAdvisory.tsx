import React from 'react';
import { AlertCircle, Info } from 'lucide-react';
import { DoseAdvisory as Advisory } from '../../logic';

// Plain-text line — no card, no fill, no border. This app never wraps a warning
// in a colored box anywhere else, so the dose notice shouldn't either: it's just
// a sentence, flush with the page margin, colored to signal caution and nothing
// more. Shared between Home (below the chart) and the dose entry form.
export const DoseAdvisoryLine: React.FC<{ advisory: Advisory; t: (k: string) => string }> = ({ advisory, t }) => (
    <p className="flex items-start gap-1.5 text-[13px] leading-snug text-amber-700/90 dark:text-amber-400/85">
        <AlertCircle size={14} strokeWidth={1.75} className="mt-[3px] shrink-0" />
        <span>{t(`advisory.${advisory.kind}.body`)}</span>
    </p>
);

// Two plain-text lines above the chart:
//   • dose warning — logged doses (a hard fact) running clearly high
//   • calibrate nudge — no lab yet to anchor the estimate
const DoseAdvisoryNotice: React.FC<{
    advisory: Advisory | null;
    showCalibrate: boolean;
    onCalibrate: () => void;
    t: (k: string) => string;
}> = ({ advisory, showCalibrate, onCalibrate, t }) => {
    if (!advisory && !showCalibrate) return null;

    return (
        <div className="space-y-1.5">
            {advisory && <DoseAdvisoryLine advisory={advisory} t={t} />}
            {showCalibrate && (
                <button
                    onClick={onCalibrate}
                    className="flex items-start gap-1.5 text-left text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]"
                >
                    <Info size={13} strokeWidth={1.75} className="mt-[2px] shrink-0 opacity-70" />
                    <span>
                        {t('advisory.calibrate.text')}{' '}
                        <span className="text-[var(--color-m3-primary)] underline underline-offset-2 dark:text-[var(--color-m3-primary-light)]">
                            {t('advisory.calibrate.cta')}
                        </span>
                    </span>
                </button>
            )}
        </div>
    );
};

export default DoseAdvisoryNotice;
