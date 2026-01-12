import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

const CustomSelect = ({ value, onChange, options, label, icon }: { value: string, onChange: (val: string) => void, options: { value: string, label: string, icon?: React.ReactNode }[], label?: string, icon?: React.ReactNode }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = options.find(o => o.value === value);

    return (
        <div className="space-y-2" ref={containerRef}>
            {label && !icon && <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">{label}</label>}
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className={`w-full p-4 bg-white dark:bg-gray-800 border ${isOpen ? 'border-pink-300 ring-2 ring-pink-100 dark:ring-pink-900/20' : 'border-gray-200 dark:border-gray-700'} rounded-xl outline-none flex items-center justify-between transition-all hover:bg-gray-50 dark:hover:bg-gray-800/80`}
                >
                    {icon ? (
                        <>
                            <div className="flex items-center gap-3">
                                {icon}
                                <span className="font-bold text-gray-900 dark:text-white text-sm">{label}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-gray-500 dark:text-gray-400">{selectedOption?.label}</span>
                                <ChevronDown size={20} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex items-center gap-2">
                                {selectedOption?.icon}
                                <span className="font-medium text-gray-800 dark:text-white">{selectedOption?.label || value}</span>
                            </div>
                            <ChevronDown size={20} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </>
                    )}
                </button>

                {isOpen && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-md z-50 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                        {options.map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => {
                                    onChange(opt.value);
                                    setIsOpen(false);
                                }}
                                className={`w-full p-3 text-left flex items-center gap-2 hover:bg-pink-50 dark:hover:bg-pink-900/20 transition-colors
                                    ${opt.value === value ? 'bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 font-bold' : 'text-gray-700 dark:text-gray-300'}`}
                            >
                                {opt.icon}
                                <span>{opt.label}</span>
                                {opt.value === value && <div className="ml-auto w-2 h-2 rounded-full bg-pink-400" />}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CustomSelect;
