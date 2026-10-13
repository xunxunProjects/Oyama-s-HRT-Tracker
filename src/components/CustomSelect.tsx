import React, { useState, useRef, useEffect, useLayoutEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import Tick from './Tick';

// The floating lists that can be open at once (this select, DateTimePicker's
// picker and its lists), newest last. They sit inside forms and modals that
// close on Escape as well, and one press should only take down the thing on
// top, which is the rule DialogContext follows. A single listener answers for
// the newest layer. It listens in the capture phase on document: after the
// dialog's capture listener on window, so a confirm open over everything
// still closes first and alone, and before the bubbling window listeners of
// the modals underneath (useEscape), which the stopped press never reaches.
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

const CustomSelect: React.FC<CustomSelectProps> = ({ value, onChange, options, label, icon, labelledBy }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [positionStyle, setPositionStyle] = useState<React.CSSProperties>({});
    const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
    const labelId = useId();
    const valueId = useId();
    const listId = useId();
    const nameId = label && !icon ? labelId : labelledBy;

    useEffect(() => {
        if (typeof document !== 'undefined') {
            setPortalTarget(document.body);
        }
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                (containerRef.current && containerRef.current.contains(event.target as Node)) ||
                (dropdownRef.current && dropdownRef.current.contains(event.target as Node))
            ) {
                return;
            }
            setIsOpen(false);
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    useLayoutEffect(() => {
        if (isOpen && containerRef.current) {
            const updatePosition = () => {
                const rect = containerRef.current?.getBoundingClientRect();
                if (rect) {
                    const spaceBelow = window.innerHeight - rect.bottom;
                    const spaceAbove = rect.top;
                    const minSpaceBelow = 240;

                    let shouldFlip = false;
                    let maxHeight = 320;

                    if (spaceBelow < minSpaceBelow && spaceAbove > spaceBelow) {
                        shouldFlip = true;
                        maxHeight = Math.min(320, spaceAbove - 24);
                    } else {
                        shouldFlip = false;
                        maxHeight = Math.min(320, spaceBelow - 24);
                    }

                    if (shouldFlip) {
                        setPositionStyle({
                            bottom: window.innerHeight - rect.top + 6,
                            left: rect.left,
                            width: rect.width,
                            maxHeight: maxHeight
                        });
                    } else {
                        setPositionStyle({
                            top: rect.bottom + 6,
                            left: rect.left,
                            width: rect.width,
                            maxHeight: maxHeight
                        });
                    }
                }
            };
            updatePosition();
            window.addEventListener('resize', updatePosition);
            window.addEventListener('scroll', updatePosition, { capture: true, passive: true });
            return () => {
                window.removeEventListener('resize', updatePosition);
                window.removeEventListener('scroll', updatePosition, { capture: true });
            };
        }
    }, [isOpen]);

    const selectedOption = options.find(o => o.value === value);

    // Closing from the keyboard or by choosing hands focus back to the trigger,
    // so the next Tab carries on through the form from where the list was.
    const close = () => {
        setIsOpen(false);
        triggerRef.current?.focus();
    };

    const handleSelect = (val: string) => {
        onChange(val);
        close();
    };

    useEscapeLayer(close, isOpen);

    // The list opens with the chosen row focused, so the arrow keys start from
    // it. After a click no ring shows, since the browser only draws one for
    // focus that follows the keyboard. preventScroll: on the first frame the
    // list may not be placed yet, and focusing it there would scroll the page.
    useEffect(() => {
        if (!isOpen) return;
        const list = dropdownRef.current;
        const row = list?.querySelector<HTMLElement>('[aria-selected="true"]') ?? list?.querySelector<HTMLElement>('[role="option"]');
        row?.focus({ preventScroll: true });
    }, [isOpen, portalTarget]);

    const handleListKeyDown = (e: React.KeyboardEvent) => {
        const rows = Array.from(dropdownRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
        const at = rows.indexOf(document.activeElement as HTMLElement);
        const go = (i: number) => {
            e.preventDefault();
            rows[Math.max(0, Math.min(rows.length - 1, i))]?.focus();
        };
        if (e.key === 'ArrowDown') go(at + 1);
        else if (e.key === 'ArrowUp') go(at - 1);
        else if (e.key === 'Home') go(0);
        else if (e.key === 'End') go(rows.length - 1);
        // The list is portalled to the end of the page; Tab moves on from the
        // trigger instead of falling off the end of the document.
        else if (e.key === 'Tab') close();
    };

    // The trigger matches .input-base: a field-coloured box with a findable
    // border that turns terracotta, with the focus glow, while open. The list
    // floats beneath as its own rounded panel, rows inset so their corners nest.
    return (
        <div className="space-y-1.5 flex flex-col" ref={containerRef}>
            {label && !icon && (
                <label id={labelId} className="block text-xs font-medium text-[var(--text)]">
                    {label}
                </label>
            )}

            <div className="relative">
                {/* Named by its label and then its value ("Route, Oral"), the
                    way a native select is read. */}
                <button
                    ref={triggerRef}
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    onKeyDown={(e) => {
                        if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                            e.preventDefault();
                            setIsOpen(true);
                        }
                    }}
                    aria-haspopup="listbox"
                    aria-expanded={isOpen}
                    aria-controls={isOpen ? listId : undefined}
                    aria-labelledby={nameId ? `${nameId} ${valueId}` : undefined}
                    className={`group w-full min-h-[44px] ps-3.5 pe-3 py-2 bg-[var(--field)] border rounded-[var(--radius-md)] outline-none flex items-center justify-between overflow-hidden
                        ${isOpen
                            ? 'border-[var(--accent-ink)]'
                            : 'border-[var(--border)] hover:border-[var(--border-strong)]'}`}
                >
                    {icon ? (
                        <>
                            <div className="flex items-center gap-2">
                                {icon}
                                <span className="font-medium text-[var(--text)] text-sm">{label}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span id={valueId} className="text-sm text-[var(--text-muted)]">{selectedOption?.label}</span>
                                <ChevronDown size={18} className={`chev text-[var(--text-muted)] ${isOpen ? 'rotate-180' : ''}`} />
                            </div>
                        </>
                    ) : (
                        <>
                            {/* The chosen value keeps its full width and the
                                description (brand names) takes what is left,
                                cut short first: the drug is what the field must
                                confirm, and it used to be the part cut off. */}
                            <div className="flex items-center gap-2 min-w-0">
                                {selectedOption?.icon && <div className="text-[var(--text-muted)]">{selectedOption.icon}</div>}
                                <span id={valueId} className="text-[var(--text)] text-sm truncate">{selectedOption?.label || value}</span>
                            </div>
                            {selectedOption?.description && (
                                <span className="flex-1 min-w-0 ms-2 truncate text-end text-xs text-[var(--text-muted)]">{selectedOption.description}</span>
                            )}
                            <ChevronDown size={18} className={`chev shrink-0 ms-1.5 text-[var(--text-muted)] ${isOpen ? 'rotate-180' : ''}`} />
                        </>
                    )}
                </button>

                {isOpen && portalTarget && createPortal(
                    <div
                        ref={dropdownRef}
                        id={listId}
                        style={positionStyle}
                        role="listbox"
                        aria-labelledby={nameId}
                        onKeyDown={handleListKeyDown}
                        className="dropdown-in menu-surface fixed z-[999] overflow-y-auto"
                    >
                        {options.map(opt => (
                            <button
                                key={opt.value}
                                type="button"
                                tabIndex={-1}
                                role="option"
                                aria-selected={opt.value === value}
                                onClick={() => handleSelect(opt.value)}
                                className="menu-item"
                            >
                                {opt.icon && <div className="text-[var(--text-muted)]">{opt.icon}</div>}
                                {/* Label and description share a line when they
                                    fit; otherwise the description drops under
                                    the label whole, rather than both wrapping
                                    side by side in two narrow columns. */}
                                <span className="flex-1 min-w-0 flex flex-wrap items-baseline justify-between gap-x-3 py-1.5">
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
                    </div>,
                    portalTarget
                )}
            </div>
        </div>
    );
};

export default CustomSelect;
