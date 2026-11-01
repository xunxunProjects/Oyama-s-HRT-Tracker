import React, { useState, useRef, useEffect, useLayoutEffect, useId } from 'react';
import { ChevronDown } from './icons';
import Tick from './Tick';

// The things that can be open at once inside a form (this list, the date
// picker), newest last. They sit inside forms that fold away on Escape as
// well, and one press should only take down the thing on top, which is the
// rule DialogContext follows. A single listener answers for the newest layer,
// in the capture phase on document: after the prompt's capture listener on
// window, so an open prompt still closes first and alone, and before the
// bubbling window listeners of what's underneath (useEscape).
const escapeLayers: { current: () => void }[] = [];
const onEscapeKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || escapeLayers.length === 0) return;
    e.stopPropagation();
    escapeLayers[escapeLayers.length - 1].current();
};

export const useEscapeLayer = (onEscape: () => void, active: boolean) => {
    const handlerRef = useRef(onEscape);
    useLayoutEffect(() => {
        handlerRef.current = onEscape;
    });
    useEffect(() => {
        if (!active) return;
        const layer = { current: () => handlerRef.current() };
        escapeLayers.push(layer);
        if (escapeLayers.length === 1) document.addEventListener('keydown', onEscapeKey, true);
        return () => {
            escapeLayers.splice(escapeLayers.indexOf(layer), 1);
            if (escapeLayers.length === 0) document.removeEventListener('keydown', onEscapeKey, true);
        };
    }, [active]);
};

/**
 * The mark at the end of anything that opens a choice: this list, a date.
 * One size and one pen wherever it is, smaller and lighter than the words it
 * follows, in their muted colour. It turns over while the choice is open, as
 * every disclosure's chevron does (.chev): left still, it was the one mark in
 * the app that didn't answer the press.
 */
export const SelectChevron: React.FC<{ open: boolean }> = ({ open }) => (
    <ChevronDown
        size={16}
        strokeWidth={1.75}
        className={`chev shrink-0 text-[var(--text-muted)] ${open ? 'rotate-180' : ''}`}
    />
);

interface Option {
    value: string;
    label: string;
    icon?: React.ReactNode;
    description?: string;
}

interface CustomSelectProps {
    value: string;
    onChange: (val: string) => void;
    options: Option[];
    label?: string;
    icon?: React.ReactNode;
    /** The id of a label the caller draws itself, in place of `label`. */
    labelledBy?: string;
}

/**
 * A choice, drawn as a line like a field: its name above, what's chosen on
 * the line, a chevron at the end (SelectChevron). Pressed, the options unfold under it in
 * place, as plain rows with a tick by the chosen one. Nothing floats over the form.
 *
 * Picking a row moves the tick to it and the list stays open, as the date
 * picker does; it folds away only when its line is pressed again (or on
 * Escape). Folding on the pick, or on a press anywhere else, shut the list
 * under the finger and pulled the form up with it, even for a touch that
 * only meant to scroll.
 */
const CustomSelect: React.FC<CustomSelectProps> = ({ value, onChange, options, label, icon, labelledBy }) => {
    const [isOpen, setIsOpen] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const labelId = useId();
    const valueId = useId();
    const listId = useId();
    const nameId = label && !icon ? labelId : labelledBy;

    const selectedOption = options.find(o => o.value === value);

    // Closing from the keyboard hands focus back to the line, so the next Tab
    // carries on through the form from where the list was.
    const close = () => {
        setIsOpen(false);
        triggerRef.current?.focus();
    };

    useEscapeLayer(close, isOpen);

    // The list opens with the chosen row focused, so the arrow keys start from
    // it, and the unfolded rows are brought into view if they ran off the
    // bottom of the screen.
    useEffect(() => {
        if (!isOpen) return;
        const list = listRef.current;
        const row =
            list?.querySelector<HTMLElement>('[aria-selected="true"]') ??
            list?.querySelector<HTMLElement>('[role="option"]');
        row?.focus({ preventScroll: true });
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const timer = window.setTimeout(
            () => list?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }),
            reduce ? 0 : 320,
        );
        return () => clearTimeout(timer);
    }, [isOpen]);

    const handleListKeyDown = (e: React.KeyboardEvent) => {
        const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
        const at = rows.indexOf(document.activeElement as HTMLElement);
        const go = (i: number) => {
            e.preventDefault();
            rows[Math.max(0, Math.min(rows.length - 1, i))]?.focus();
        };
        if (e.key === 'ArrowDown') go(at + 1);
        else if (e.key === 'ArrowUp') go(at - 1);
        else if (e.key === 'Home') go(0);
        else if (e.key === 'End') go(rows.length - 1);
        else if (e.key === 'Tab') setIsOpen(false);
    };

    return (
        <div className="flex flex-col">
            {label && !icon && (
                <label id={labelId} className="field-label">
                    {label}
                </label>
            )}

            {/* Named by its label and then its value ("Route, Oral"), the way
                a native select is read. */}
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setIsOpen(open => !open)}
                onKeyDown={e => {
                    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                        e.preventDefault();
                        setIsOpen(true);
                    }
                }}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-controls={listId}
                aria-labelledby={nameId ? `${nameId} ${valueId}` : undefined}
                className="choice-trigger"
            >
                {icon ? (
                    <>
                        <span className="flex flex-1 items-center gap-2 min-w-0">
                            {icon}
                            <span className="font-medium text-sm truncate">{label}</span>
                        </span>
                        <span id={valueId} className="text-sm text-[var(--text-muted)] truncate">
                            {selectedOption?.label}
                        </span>
                    </>
                ) : (
                    <>
                        {/* The chosen value keeps its full width and the
                            description (brand names) takes what is left, cut
                            short first: the drug is what the line must
                            confirm. */}
                        <span className="flex items-center gap-2 min-w-0">
                            {selectedOption?.icon && (
                                <span className="text-[var(--text-muted)]">{selectedOption.icon}</span>
                            )}
                            <span id={valueId} className="text-sm truncate">
                                {selectedOption?.label || value}
                            </span>
                        </span>
                        <span className="flex-1 min-w-0 truncate text-end text-xs text-[var(--text-muted)]">
                            {selectedOption?.description}
                        </span>
                    </>
                )}
                <SelectChevron open={isOpen} />
            </button>

            <div className="disclosure disclosure-bleed" data-open={isOpen} {...(isOpen ? {} : { inert: '' })}>
                <div className="disclosure-inner">
                    <div
                        ref={listRef}
                        id={listId}
                        role="listbox"
                        aria-labelledby={nameId}
                        onKeyDown={handleListKeyDown}
                        className="choice-options settings-section"
                    >
                        {options.map(opt => (
                            <button
                                key={opt.value}
                                type="button"
                                tabIndex={-1}
                                role="option"
                                aria-selected={opt.value === value}
                                onClick={() => onChange(opt.value)}
                                className="choice-option row-bleed"
                            >
                                {opt.icon && <span className="text-[var(--text-muted)]">{opt.icon}</span>}
                                {/* Label and description share a line when they
                                    fit; otherwise the description drops under
                                    the label whole. */}
                                <span className="flex-1 min-w-0 flex flex-wrap items-baseline justify-between gap-x-3">
                                    <span>{opt.label}</span>
                                    {opt.description && (
                                        <span className="text-xs font-normal text-[var(--text-muted)]">
                                            {opt.description}
                                        </span>
                                    )}
                                </span>
                                <Tick on={opt.value === value} size={18} />
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CustomSelect;
