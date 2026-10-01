import React from 'react';

/**
 * The one on/off switch in the app, at iOS proportions: a 22px knob on a
 * 44×26 track. The off track is border-strong so the off state is findable
 * (3:1), not a near-invisible hairline grey. Track colour and knob position
 * move together (.switch-track / .switch-knob), so every switch slides the
 * same way wherever it sits.
 *
 * Give it `label` when nothing on screen names it, or `id` when a <label
 * htmlFor> beside it already does.
 */
const Switch: React.FC<{
    checked: boolean;
    onChange: (next: boolean) => void;
    label?: string;
    id?: string;
}> = ({ checked, onChange, label, id }) => (
    <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex switch-track h-[26px] w-11 shrink-0 items-center rounded-full ${checked ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]'}`}
    >
        <span className={`inline-block switch-knob h-[22px] w-[22px] rounded-full bg-white shadow-[var(--shadow-xs)] ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
);

export default Switch;
