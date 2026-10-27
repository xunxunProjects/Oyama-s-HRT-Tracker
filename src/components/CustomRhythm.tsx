import React, { useId, useState } from 'react';
import Segmented from './Segmented';
import Stepper from './Stepper';
import { MAX_EVERY_DAYS, MAX_TIMES_PER_DAY, parseFrequency } from '../utils/plan';

type Kind = 'every' | 'daily';

/** What a half-typed custom field leaves in the draft: no rhythm, so the step's Next and the row's Save wait. */
export const UNSET_RHYTHM = 'custom';

/**
 * A rhythm the list doesn't have, typed in: every so many days, or so many
 * times a day, as a whole number. It starts from the key it's given and
 * reports every change as a key (parseFrequency), or UNSET_RHYTHM while what's
 * typed isn't one yet, which the hint under it explains. Nothing here changes
 * the draft except typing, stepping, or switching the kind: focusing a field
 * leaves the rhythm as it was.
 */
const CustomRhythm: React.FC<{
    freq: string;
    onChange: (key: string) => void;
    t: (key: string) => string;
}> = ({ freq, onChange, t }) => {
    const hintId = useId();
    const start = parseFrequency(freq);
    const [kind, setKind] = useState<Kind>(start && start.timesPerDay > 1 ? 'daily' : 'every');
    const [text, setText] = useState(() =>
        String(start ? (start.timesPerDay > 1 ? start.timesPerDay : Math.max(2, Math.round(start.everyDays))) : 4),
    );

    const max = kind === 'daily' ? MAX_TIMES_PER_DAY : MAX_EVERY_DAYS;
    const keyFor = (k: Kind, value: string): string => {
        const n = Number(value);
        const top = k === 'daily' ? MAX_TIMES_PER_DAY : MAX_EVERY_DAYS;
        return Number.isInteger(n) && n >= 2 && n <= top ? `${k === 'daily' ? 'd' : 'e'}${n}` : UNSET_RHYTHM;
    };
    const valid = keyFor(kind, text) !== UNSET_RHYTHM;

    return (
        <div className="space-y-3">
            <Segmented
                aria-label={t('plan.freq')}
                options={[
                    { id: 'every', label: t('plan.freq_kind_every') },
                    { id: 'daily', label: t('plan.freq_kind_daily') },
                ]}
                value={kind}
                onChange={next => {
                    // A number that fits both kinds carries over; one that
                    // doesn't (every 30 days, as doses a day) is brought into
                    // range rather than left invalid by a switch.
                    const top = next === 'daily' ? MAX_TIMES_PER_DAY : MAX_EVERY_DAYS;
                    const n = Math.min(top, Math.max(2, Math.round(Number(text)) || 2));
                    setKind(next);
                    setText(String(n));
                    onChange(keyFor(next, String(n)));
                }}
            />
            <div aria-describedby={hintId}>
                <Stepper
                    label={kind === 'daily' ? t('plan.freq_daily_label') : t('plan.freq_every_label')}
                    value={text}
                    min={2}
                    max={max}
                    step={() => 1}
                    inputStep="1"
                    onChange={v => {
                        setText(v);
                        onChange(keyFor(kind, v));
                    }}
                />
            </div>
            <p id={hintId} className={`field-hint ${valid ? '' : 'is-error'}`} aria-live="polite">
                {t(kind === 'daily' ? 'plan.freq_range_daily' : 'plan.freq_range_every').replace('{max}', String(max))}
            </p>
        </div>
    );
};

export default CustomRhythm;
