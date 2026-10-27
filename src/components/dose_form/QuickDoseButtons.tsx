import React from 'react';
import { Plus, Close } from '../icons';
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
    unit = 'mg',
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
            createdAt: Date.now(),
        };
        onAddQuickDose(newDose);
    };

    const handleDelete = (dose: QuickDose) => {
        showDialog(
            'confirm',
            `${formatValue(dose.value)} ${unit}`,
            () => {
                onDeleteQuickDose(dose.id);
            },
            { danger: true, title: t('quickdose.delete_confirm'), confirmLabel: t('btn.delete') },
        );
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
                <div key={dose.id} className="group relative inline-flex items-center">
                    <button
                        type="button"
                        onClick={() => onSelectDose(dose.value)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border
 border-[var(--border)]
                            text-body
 hover:bg-[var(--surface-hover)]"
                    >
                        {formatValue(dose.value)} {unit}
                    </button>
                    {/* With a mouse, a badge on the chip's corner that shows on
                        hover. On a touch screen there is no hover, and an
                        unseen 16px corner took taps meant for the chip, so
                        there it sits beside the chip, always shown, muted,
                        with a 44px-tall hit area (.tap-target, which also
                        takes it out of absolute positioning). */}
                    <button
                        type="button"
                        onClick={e => {
                            e.stopPropagation();
                            handleDelete(dose);
                        }}
                        aria-label={`${t('btn.delete')} ${formatValue(dose.value)} ${unit}`}
                        className="tap-target absolute -top-1.5 -right-1.5 w-4 h-4 rounded-md flex items-center justify-center
 bg-[var(--surface-hover)]
 text-muted border border-[var(--border)]
                            opacity-0 group-hover:opacity-100 focus-visible:opacity-100
                            pointer-coarse:inset-auto pointer-coarse:w-6 pointer-coarse:h-6 pointer-coarse:opacity-100 pointer-coarse:bg-transparent pointer-coarse:border-transparent"
                    >
                        <Close size={10} strokeWidth={3} />
                    </button>
                </div>
            ))}
            <button
                type="button"
                onClick={handleAdd}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-dashed
 border-[var(--border)]
                    text-[var(--text-muted)]
 hover:border-[var(--border-strong)]
                    hover:text-[var(--text)]"
                title={t('quickdose.add')}
                aria-label={t('quickdose.add')}
            >
                <Plus size={14} strokeWidth={2.5} />
            </button>
        </div>
    );
};

export default QuickDoseButtons;
