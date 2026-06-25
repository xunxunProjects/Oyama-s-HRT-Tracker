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
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border
                            border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]
                            text-body
                            hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)]"
                    >
                        {formatValue(dose.value)} {unit}
                    </button>
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDelete(dose.id); }}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-md flex items-center justify-center
                            bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container)]
                            text-muted border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]
                            opacity-0 group-hover:opacity-100"
                    >
                        <X size={10} strokeWidth={3} />
                    </button>
                </div>
            ))}
            <button
                type="button"
                onClick={handleAdd}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-dashed
                    border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]
                    text-muted
                    hover:border-[var(--color-m3-outline)] dark:hover:border-[var(--color-m3-dark-outline)]
                    hover:text-body"
                title={t('quickdose.add')}
            >
                <Plus size={14} strokeWidth={2.5} />
            </button>
        </div>
    );
};

export default QuickDoseButtons;
