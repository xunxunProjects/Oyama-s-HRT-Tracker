import React from 'react';
import { Minus, Plus } from './icons';

/**
 * A number field with − and + on either side, so the batch values can be
 * nudged with a thumb instead of summoning the number pad. Typing still works;
 * the buttons step from whatever is typed and stop at the limits.
 */
const Stepper: React.FC<{
    label: string;
    value: string;
    onChange: (v: string) => void;
    min: number;
    max?: number;
    /** Size of one step for a given value and direction. */
    step: (current: number, dir: 1 | -1) => number;
    inputStep: string;
}> = ({ label, value, onChange, min, max = Infinity, step, inputStep }) => {
    const id = React.useId();
    const n = parseFloat(value);
    const current = Number.isFinite(n) ? n : min;
    const nudge = (dir: 1 | -1) => {
        const next = Math.min(max, Math.max(min, current + dir * step(current, dir)));
        onChange(String(Math.round(next * 100) / 100));
    };
    const btn =
        'grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] disabled:opacity-35 disabled:hover:bg-transparent';
    return (
        <div className="space-y-1.5">
            <label htmlFor={id} className="field-label">
                {label}
            </label>
            <span className="flex items-center gap-1">
                <button
                    type="button"
                    onClick={() => nudge(-1)}
                    disabled={current <= min}
                    aria-label={`${label} −`}
                    className={btn}
                >
                    <Minus size={16} />
                </button>
                <input
                    id={id}
                    type="number"
                    inputMode="decimal"
                    min={min}
                    max={Number.isFinite(max) ? max : undefined}
                    step={inputStep}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    className="input-base min-w-0 flex-1 text-center text-sm font-medium tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                    type="button"
                    onClick={() => nudge(1)}
                    disabled={current >= max}
                    aria-label={`${label} +`}
                    className={btn}
                >
                    <Plus size={16} />
                </button>
            </span>
        </div>
    );
};

export default Stepper;
