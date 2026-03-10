import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import Ripple from './Ripple';

interface Option {
    value: string;
    label: string;
    icon?: React.ReactNode;
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
                            bottom: window.innerHeight - rect.top + 4,
                            left: rect.left,
                            width: rect.width,
                            maxHeight: maxHeight
                        });
                    } else {
                        setPositionStyle({
                            top: rect.bottom + 4,
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

    return (
        <div className="space-y-1.5 flex flex-col" ref={containerRef}>
            {label && !icon && (
                <label className="block text-xs font-bold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] uppercase tracking-wider pl-1.5">
                    {label}
                </label>
            )}

            <div className="relative">
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className={`group w-full min-h-[56px] px-4 py-3 bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] border transition-all duration-300 outline-none flex items-center justify-between m3-state-layer overflow-hidden
                        ${isOpen
                            ? 'border-[var(--color-m3-primary)] dark:border-teal-400 ring-1 ring-[var(--color-m3-primary)] dark:ring-teal-400 rounded-t-[var(--radius-md)]'
                            : 'border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] hover:border-[var(--color-m3-on-surface)] dark:hover:border-[var(--color-m3-dark-on-surface)] rounded-[var(--radius-md)]'}`}
                >
                    <Ripple />
                    {icon ? (
                        <>
                            <div className="flex items-center gap-3">
                                {icon}
                                <span className="font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] text-sm">{label}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">{selectedOption?.label}</span>
                                <ChevronDown size={20} className={`text-[var(--color-m3-on-surface-variant)] transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex items-center gap-3">
                                {selectedOption?.icon && <div className="text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">{selectedOption.icon}</div>}
                                <span className="font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">{selectedOption?.label || value}</span>
                            </div>
                            <ChevronDown size={20} className={`text-[var(--color-m3-on-surface-variant)] transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                        </>
                    )}
                </button>

                {isOpen && portalTarget && createPortal(
                    <div
                        ref={dropdownRef}
                        style={positionStyle}
                        className="fixed z-[999] bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container-high)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] rounded-b-[var(--radius-md)] shadow-[var(--shadow-m3-3)] overflow-y-auto animate-in fade-in zoom-in-95 duration-200 py-2"
                    >
                        {options.map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => handleSelect(opt.value)}
                                className={`w-full px-4 py-3 text-start flex items-center gap-3 transition-colors relative m3-state-layer overflow-hidden
                                    ${opt.value === value
                                        ? 'bg-[var(--color-m3-secondary-container)] dark:bg-teal-900/40 text-[var(--color-m3-on-secondary-container)] dark:text-teal-200 font-bold'
                                        : 'text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] hover:bg-[var(--color-m3-surface-container-high)] dark:hover:bg-[var(--color-m3-dark-surface-container-highest)]'}`}
                            >
                                <Ripple />
                                {opt.icon && <div className={`${opt.value === value ? 'text-inherit' : 'text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]'}`}>{opt.icon}</div>}
                                <span className="flex-1 text-sm">{opt.label}</span>
                                {opt.value === value && (
                                    <Check size={18} className="text-[var(--color-m3-primary)] dark:text-teal-400" strokeWidth={3} />
                                )}
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
