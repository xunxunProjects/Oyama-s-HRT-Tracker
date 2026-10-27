import React, { useId } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import {
    CUSTOM_FREQ,
    CustomFrequencyKind,
    PLAN_EVERY_DAYS_MAX,
    PLAN_TIMES_PER_DAY_MAX,
    PlanDraft,
    isValidCustomDays,
    isValidCustomTimes,
} from '../utils/plan';
import { fill, fillNodes } from '../utils/regimenText';
import Tick from './Tick';

interface CustomFrequencyFieldsProps {
    draft: Pick<PlanDraft, 'freq' | 'customKind' | 'customEvery' | 'customTimes'>;
    onChange: (patch: Partial<PlanDraft>) => void;
    /** 'rows' matches the plan wizard's list; 'fields' the edit form's grid. */
    variant: 'rows' | 'fields';
}

const inputCls =
    'w-16 min-h-[44px] shrink-0 rounded-[var(--radius-md)] border bg-[var(--field)] px-2 text-center font-semibold tabular-nums text-body outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

/**
 * The two rhythms a preset list cannot cover: one dose every whole N days,
 * and N doses a day. They are a radio group: typing in a line or ticking its
 * radio chooses it, while moving focus alone never changes the saved rhythm.
 */
const CustomFrequencyFields: React.FC<CustomFrequencyFieldsProps> = ({ draft, onChange, variant }) => {
    const { t } = useTranslation();
    const groupName = useId();
    const errorId = useId();
    const line =
        variant === 'rows'
            ? 'flex min-h-14 w-full items-center gap-3.5 border-b border-[var(--border)] text-[0.9375rem] last:border-b-0'
            : 'flex w-full items-center gap-3.5 text-sm';

    const field = (
        kind: CustomFrequencyKind,
        pluralKey: string,
        singularKey: string,
        value: string,
        max: number,
        valid: boolean,
    ) => {
        const active = draft.freq === CUSTOM_FREQ && draft.customKind === kind;
        const template = Number(value) === 1 ? singularKey : pluralKey;
        return (
            <div key={kind} className={`${line} ${active ? 'font-semibold' : ''}`}>
                <label className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-body">
                    {fillNodes(t(template), {
                        n: (
                            <input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={max}
                                step={1}
                                value={value}
                                onChange={e =>
                                    onChange(
                                        kind === 'every'
                                            ? { customKind: kind, customEvery: e.target.value, freq: CUSTOM_FREQ }
                                            : { customKind: kind, customTimes: e.target.value, freq: CUSTOM_FREQ },
                                    )
                                }
                                aria-label={t(template).replace('{n}', 'N')}
                                aria-invalid={active && !valid}
                                aria-describedby={active && !valid ? errorId : undefined}
                                className={`${inputCls} ${
                                    active ? 'border-[var(--accent-ink)]' : 'border-[var(--border)]'
                                }`}
                                style={{ fontSize: '16px' }}
                            />
                        ),
                    })}
                </label>
                <label className="shrink-0 cursor-pointer">
                    <input
                        type="radio"
                        name={groupName}
                        checked={active}
                        onChange={() => onChange({ customKind: kind, freq: CUSTOM_FREQ })}
                        aria-label={t(template).replace('{n}', value || 'N')}
                        className="peer sr-only"
                    />
                    <span className="block rounded-full p-1 peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent-ink)]">
                        <Tick on={active} />
                    </span>
                </label>
            </div>
        );
    };

    const everyValid = isValidCustomDays(draft.customEvery);
    const timesValid = isValidCustomTimes(draft.customTimes);
    const activeValid = draft.customKind === 'every' ? everyValid : timesValid;
    const activeMax = draft.customKind === 'every' ? PLAN_EVERY_DAYS_MAX : PLAN_TIMES_PER_DAY_MAX;

    return (
        <div role="radiogroup" aria-label={t('plan.custom_freq')} className={variant === 'rows' ? '' : 'space-y-2'}>
            {field(
                'every',
                'plan.custom_every',
                'plan.custom_every_one',
                draft.customEvery,
                PLAN_EVERY_DAYS_MAX,
                everyValid,
            )}
            {field(
                'times',
                'plan.times_per_day',
                'plan.custom_times_one',
                draft.customTimes,
                PLAN_TIMES_PER_DAY_MAX,
                timesValid,
            )}
            {!activeValid && (
                <p id={errorId} className="pt-1 text-xs text-[var(--danger)]">
                    {fill(t('plan.custom_invalid'), { max: activeMax })}
                </p>
            )}
        </div>
    );
};

export default CustomFrequencyFields;
