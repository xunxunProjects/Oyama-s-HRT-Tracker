import React from 'react';

/**
 * The one on/off switch in the app. Track colour and knob position move
 * together on the same duration and curve (.switch-track / .switch-knob), so
 * every switch slides the same way wherever it sits.
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
        className={`relative inline-flex switch-track h-6 w-11 shrink-0 items-center rounded-full ${checked ? 'bg-[var(--color-m3-primary)]' : 'bg-[var(--color-m3-outline-variant)] dark:bg-[var(--color-m3-dark-outline-variant)]'}`}
    >
        <span className={`inline-block switch-knob h-4 w-4 rounded-full bg-white shadow-sm ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
);

export default Switch;
