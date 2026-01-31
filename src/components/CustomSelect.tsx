import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

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
                    const minSpaceBelow = 200; // Minimum space required to show useful amount of options

                    let shouldFlip = false;
                    let maxHeight = 300; // Default max height

                    // If not enough space below AND more space above, flip it
                    if (spaceBelow < minSpaceBelow && spaceAbove > spaceBelow) {
                        shouldFlip = true;
                        maxHeight = Math.min(300, spaceAbove - 16); // Leave 16px padding
                    } else {
                        shouldFlip = false;
                        maxHeight = Math.min(300, spaceBelow - 16); // Leave 16px padding
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
            {label && !icon && <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-500 uppercase tracking-wider pl-1">{label}</label>}
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className={`w-full p-4 bg-white dark:bg-zinc-900 border ${isOpen ? 'border-zinc-400 dark:border-zinc-500 ring-2 ring-zinc-100 dark:ring-zinc-800' : 'border-zinc-200 dark:border-zinc-700'} rounded-xl outline-none flex items-center justify-between transition-all hover:border-zinc-300 dark:hover:border-zinc-500`}
                >
                    {icon ? (
                        <>
                            <div className="flex items-center gap-3">
                                {icon}
                                <span className="font-bold text-zinc-900 dark:text-white text-sm">{label}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">{selectedOption?.label}</span>
                                <ChevronDown size={20} className={`text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex items-center gap-2">
                                {selectedOption?.icon}
                                <span className="font-bold text-zinc-900 dark:text-white">{selectedOption?.label || value}</span>
                            </div>
                            <ChevronDown size={20} className={`text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </>
                    )}
                </button>

                {isOpen && portalTarget && createPortal(
                    <div
                        ref={dropdownRef}
                        style={positionStyle}
                        className="fixed z-[999] bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-2xl shadow-xl overflow-y-auto animate-in fade-in zoom-in-95 duration-100 p-1.5"
                    >
                        {options.map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => {
                                    onChange(opt.value);
                                    setIsOpen(false);
                                }}
                                className={`w-full p-3 text-left flex items-center gap-3 rounded-xl transition-all mb-0.5
                                    ${opt.value === value
                                        ? 'bg-zinc-100 dark:bg-zinc-700/50 text-zinc-900 dark:text-white font-bold'
                                        : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700/30 hover:text-zinc-900 dark:hover:text-zinc-200'}`}
                            >
                                {opt.icon}
                                <span>{opt.label}</span>
                                {opt.value === value && <div className="ml-auto w-2 h-2 rounded-full bg-zinc-900 dark:bg-white" />}
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
