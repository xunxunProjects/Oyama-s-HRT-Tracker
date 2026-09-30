import React, { useEffect, useRef, useState } from 'react';
import Tick from './Tick';

export interface InlineOption<K extends string> {
    value: K;
    /** How the choice reads inside the sentence. */
    label: string;
    /** How it reads in the menu, when that wants more words than the sentence does. */
    menuLabel?: string;
}

/**
 * A word in a sentence that can be changed where it stands: tap it and a small
 * menu drops under it. For a choice that only shapes the line it sits in, so
 * it doesn't need a row in Settings.
 *
 * Built from spans so it can live inside a <p>. Closes on a pick, on Escape,
 * and on a press anywhere outside.
 */
function InlineChoice<K extends string>({ value, options, onChange, label }: {
    value: K;
    options: readonly InlineOption<K>[];
    onChange: (next: K) => void;
    /** Names the choice for assistive tech; the visible word alone says only its current value. */
    label: string;
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('pointerdown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const current = options.find(o => o.value === value);

    return (
        <span ref={rootRef} className="relative inline-block">
            <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={`${label}: ${current?.label ?? ''}`}
                onClick={() => setOpen(o => !o)}
                className="text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] underline decoration-dotted decoration-[var(--color-m3-outline)] dark:decoration-[var(--color-m3-dark-outline)] underline-offset-4 hover:decoration-solid"
            >
                {current?.label}
            </button>
            {open && (
                <span
                    role="menu"
                    aria-label={label}
                    className="dropdown-in absolute left-0 top-full z-30 mt-1 block min-w-[10rem] rounded-lg border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] bg-white dark:bg-neutral-900 shadow-[var(--shadow-m3-3)] py-1"
                >
                    {options.map(o => (
                        <button
                            key={o.value}
                            type="button"
                            role="menuitemradio"
                            aria-checked={o.value === value}
                            onClick={() => { onChange(o.value); setOpen(false); }}
                            className={`flex w-full items-center justify-between gap-3 whitespace-nowrap px-3 py-2 text-sm text-start ${o.value === value
                                ? 'bg-[var(--color-m3-primary-container)] dark:bg-[var(--color-m3-dark-primary-container)] text-[var(--color-m3-on-primary-container)] dark:text-[var(--color-m3-dark-on-primary-container)] font-medium'
                                : 'text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container-high)]'}`}
                        >
                            <span>{o.menuLabel ?? o.label}</span>
                            <Tick on={o.value === value} />
                        </button>
                    ))}
                </span>
            )}
        </span>
    );
}

export default InlineChoice;
