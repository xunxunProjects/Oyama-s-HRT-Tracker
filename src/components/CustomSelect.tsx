import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

const CustomSelect = ({ value, onChange, options, label, icon }: { value: string, onChange: (val: string) => void, options: { value: string, label: string, icon?: React.ReactNode }[], label?: string, icon?: React.ReactNode }) => {
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
                containerRef.current && containerRef.current.contains(event.target as Node) ||
                dropdownRef.current && dropdownRef.current.contains(event.target as Node)
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
                    const minSpaceBelow = 200;

                    let shouldFlip = false;
                    let maxHeight = 300;

                    if (spaceBelow < minSpaceBelow && spaceAbove > spaceBelow) {
                        shouldFlip = true;
                        maxHeight = Math.min(300, spaceAbove - 16);
                    } else {
                        shouldFlip = false;
                        maxHeight = Math.min(300, spaceBelow - 16);
                    }

                    if (shouldFlip) {
                        setPositionStyle({
                            bottom: window.innerHeight - rect.top + 8,
                            left: rect.left,
                            width: rect.width,
                            maxHeight: maxHeight
                        });
                    } else {
                        setPositionStyle({
                            top: rect.bottom + 8,
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

    return (
        <div className="space-y-2" ref={containerRef}>
            {label && !icon && <label className="block text-xs font-bold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] uppercase tracking-wider pl-1">{label}</label>}
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className={`w-full p-4 bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] border ${isOpen ? 'border-[var(--color-m3-primary)] dark:border-teal-400 ring-2 ring-[var(--color-m3-primary-container)] dark:ring-teal-900/30' : 'border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]'} rounded-[var(--radius-lg)] outline-none flex items-center justify-between transition-all duration-300 hover:border-[var(--color-m3-outline)] dark:hover:border-[var(--color-m3-dark-outline)]`}
                >
                    {icon ? (
                        <>
                            <div className="flex items-center gap-3">
                                {icon}
                                <span className="font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] text-sm">{label}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">{selectedOption?.label}</span>
                                <ChevronDown size={20} className={`text-[var(--color-m3-on-surface-variant)] transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex items-center gap-2">
                                {selectedOption?.icon}
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
                        className="fixed z-[999] bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container-high)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] rounded-[var(--radius-lg)] shadow-[var(--shadow-m3-3)] overflow-y-auto animate-m3-container p-1.5"
                    >
                        {options.map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => {
                                    onChange(opt.value);
                                    setIsOpen(false);
                                }}
                                className={`w-full p-3 text-left flex items-center gap-3 rounded-[var(--radius-md)] transition-all mb-0.5
                                    ${opt.value === value
                                        ? 'bg-[var(--color-m3-primary-container)] dark:bg-teal-900/30 text-[var(--color-m3-on-primary-container)] dark:text-teal-300 font-bold'
                                        : 'text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)]'}`}
                            >
                                {opt.icon}
                                <span>{opt.label}</span>
                                {opt.value === value && (
                                    <Check size={16} className="ml-auto text-[var(--color-m3-primary)] dark:text-teal-400" strokeWidth={2.5} />
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
