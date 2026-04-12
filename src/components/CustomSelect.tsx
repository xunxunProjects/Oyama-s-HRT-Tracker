import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

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
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 pl-1">
                    {label}
                </label>
            )}

            <div className="relative">
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className={`group w-full min-h-[44px] px-3 py-2 bg-white dark:bg-neutral-900 border transition-colors outline-none flex items-center justify-between overflow-hidden
                        ${isOpen
                            ? 'border-teal-500 ring-1 ring-teal-500 rounded-t-md'
                            : 'border-gray-200 dark:border-neutral-800 hover:border-gray-300 dark:hover:border-neutral-700 rounded-md'}`}
                >
                    {icon ? (
                        <>
                            <div className="flex items-center gap-2">
                                {icon}
                                <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{label}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="text-sm text-gray-500">{selectedOption?.label}</span>
                                <ChevronDown size={16} className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex items-center gap-2">
                                {selectedOption?.icon && <div className="text-gray-500 dark:text-gray-400">{selectedOption.icon}</div>}
                                <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{selectedOption?.label || value}</span>
                            </div>
                            <ChevronDown size={16} className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                        </>
                    )}
                </button>

                {isOpen && portalTarget && createPortal(
                    <div
                        ref={dropdownRef}
                        style={positionStyle}
                        className="fixed z-[999] bg-white dark:bg-neutral-900 border x border-gray-200 dark:border-neutral-800 border-t-0 rounded-b-md shadow-sm overflow-y-auto animate-in fade-in duration-100 py-1"
                    >
                        {options.map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => handleSelect(opt.value)}
                                className={`w-full px-3 py-2 text-start flex items-center gap-2 transition-colors relative overflow-hidden
                                    ${opt.value === value
                                        ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 font-medium'
                                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-neutral-800'}`}
                            >
                                {opt.icon && <div className={`${opt.value === value ? 'text-inherit' : 'text-gray-400 dark:text-gray-500'}`}>{opt.icon}</div>}
                                <span className="flex-1 text-sm">{opt.label}</span>
                                {opt.value === value && (
                                    <Check size={16} className="text-teal-600 dark:text-teal-400" strokeWidth={2.5} />
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
