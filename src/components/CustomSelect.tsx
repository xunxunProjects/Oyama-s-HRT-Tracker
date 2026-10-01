import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import Tick from './Tick';

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
}

const CustomSelect: React.FC<CustomSelectProps> = ({ value, onChange, options, label, icon }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [positionStyle, setPositionStyle] = useState<React.CSSProperties>({});
    const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

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

    const handleSelect = (val: string) => {
        onChange(val);
        setIsOpen(false);
    };

    // The trigger matches .input-base: a field-coloured box with a findable
    // border that turns terracotta, with the focus glow, while open. The list
    // floats beneath as its own rounded panel, rows inset so their corners nest.
    return (
        <div className="space-y-1.5 flex flex-col" ref={containerRef}>
            {label && !icon && (
                <label className="block text-xs font-medium text-[var(--text)]">
                    {label}
                </label>
            )}

            <div className="relative">
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    aria-expanded={isOpen}
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
                                <span className="text-sm text-[var(--text-muted)]">{selectedOption?.label}</span>
                                <ChevronDown size={18} className={`chev text-[var(--text-muted)] ${isOpen ? 'rotate-180' : ''}`} />
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                {selectedOption?.icon && <div className="text-[var(--text-muted)]">{selectedOption.icon}</div>}
                                <span className="text-[var(--text)] text-sm truncate">{selectedOption?.label || value}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                {selectedOption?.description && (
                                    <span className="text-xs text-[var(--text-muted)]">{selectedOption.description}</span>
                                )}
                                <ChevronDown size={18} className={`chev text-[var(--text-muted)] ${isOpen ? 'rotate-180' : ''}`} />
                            </div>
                        </>
                    )}
                </button>

                {isOpen && portalTarget && createPortal(
                    <div
                        ref={dropdownRef}
                        style={positionStyle}
                        role="listbox"
                        className="dropdown-in menu-surface fixed z-[999] overflow-y-auto"
                    >
                        {options.map(opt => (
                            <button
                                key={opt.value}
                                role="option"
                                aria-selected={opt.value === value}
                                onClick={() => handleSelect(opt.value)}
                                className="menu-item"
                            >
                                {opt.icon && <div className="text-[var(--text-muted)]">{opt.icon}</div>}
                                <span className="flex-1">{opt.label}</span>
                                {opt.description && (
                                    <span className="text-xs font-normal text-[var(--text-muted)]">
                                        {opt.description}
                                    </span>
                                )}
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
