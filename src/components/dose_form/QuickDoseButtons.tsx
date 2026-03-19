import React from 'react';
import { Plus, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from '../../contexts/LanguageContext';
import { useDialog } from '../../contexts/DialogContext';
import { Route, Ester } from '../../../logic';

export interface QuickDose {
    id: string;
    route: Route;
    ester: Ester;
    value: number;
    createdAt: number;
}

interface QuickDoseButtonsProps {
    route: Route;
    ester: Ester;
    quickDoses: QuickDose[];
    currentDose: string;
    onSelectDose: (value: number) => void;
    onAddQuickDose: (dose: QuickDose) => void;
    onDeleteQuickDose: (id: string) => void;
    unit?: string;
}

const QuickDoseButtons: React.FC<QuickDoseButtonsProps> = ({
    route,
    ester,
    quickDoses,
    currentDose,
    onSelectDose,
    onAddQuickDose,
    onDeleteQuickDose,
    unit = 'mg'
}) => {
    const { t } = useTranslation();
    const { showDialog } = useDialog();

    // Filter quick doses for current route + ester combination
    const filteredDoses = quickDoses
        .filter(d => d.route === route && d.ester === ester)
        .sort((a, b) => a.value - b.value);

    const handleAdd = () => {
        const val = parseFloat(currentDose);
        if (!Number.isFinite(val) || val <= 0) {
            showDialog('alert', t('quickdose.empty_input'));
            return;
        }

        // Check for duplicate
        const exists = filteredDoses.some(d => Math.abs(d.value - val) < 0.0001);
        if (exists) return;

        const newDose: QuickDose = {
            id: uuidv4(),
            route,
            ester,
            value: val,
            createdAt: Date.now()
        };
        onAddQuickDose(newDose);
    };

    const handleDelete = (id: string) => {
        showDialog('confirm', t('quickdose.delete_confirm'), () => {
            onDeleteQuickDose(id);
        });
    };

    const formatValue = (val: number): string => {
        if (Number.isInteger(val)) return val.toString();
        // Remove trailing zeros
        const str = val.toFixed(3);
        return str.replace(/\.?0+$/, '');
    };

    return (
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {filteredDoses.map(dose => (
                <div key={dose.id} className="group relative">
                    <button
                        type="button"
                        onClick={() => onSelectDose(dose.value)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-[var(--radius-full)] border transition-all duration-200
                            bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container-high)]
                            border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]
                            text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]
                            hover:bg-[var(--color-m3-primary-container)] dark:hover:bg-teal-900/30
                            hover:border-[var(--color-m3-primary)] dark:hover:border-teal-500
                            hover:text-[var(--color-m3-primary)] dark:hover:text-teal-400
                            active:scale-95"
                    >
                        {formatValue(dose.value)} {unit}
                    </button>
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDelete(dose.id); }}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center
                            bg-red-100 dark:bg-red-900/40 text-red-500 dark:text-red-400
                            opacity-0 group-hover:opacity-100 transition-opacity duration-150
                            hover:bg-red-200 dark:hover:bg-red-900/60"
                    >
                        <X size={10} strokeWidth={3} />
                    </button>
                </div>
            ))}
            <button
                type="button"
                onClick={handleAdd}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-[var(--radius-full)] border border-dashed transition-all duration-200
                    border-[var(--color-m3-outline)] dark:border-[var(--color-m3-dark-outline)]
                    text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]
                    hover:border-[var(--color-m3-primary)] dark:hover:border-teal-400
                    hover:text-[var(--color-m3-primary)] dark:hover:text-teal-400
                    hover:bg-[var(--color-m3-primary-container)]/30 dark:hover:bg-teal-900/20
                    active:scale-95"
                title={t('quickdose.add')}
            >
                <Plus size={14} strokeWidth={2.5} />
            </button>
        </div>
    );
};

export default QuickDoseButtons;
