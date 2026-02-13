import React, { useState, useEffect } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { LabResult } from '../../logic';
import { Calendar, Activity, Check, Trash2, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import DateTimePicker from './DateTimePicker';

interface LabResultFormProps {
    resultToEdit?: LabResult | null;
    onSave: (result: LabResult) => void;
    onCancel: () => void;
    onDelete?: (id: string) => void;
    isInline?: boolean;
}

const LabResultForm: React.FC<LabResultFormProps> = ({ resultToEdit, onSave, onCancel, onDelete, isInline = false }) => {
    const { t } = useTranslation();
    const [date, setDate] = useState("");
    const [time, setTime] = useState("");
    const [value, setValue] = useState("");
    const [unit, setUnit] = useState<'pg/ml' | 'pmol/l'>('pmol/l');
    const [note, setNote] = useState("");
    const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

    useEffect(() => {
        if (resultToEdit) {
            const d = new Date(resultToEdit.timeH * 3600000);
            setDate(d.toISOString().split('T')[0]);
            setTime(d.toTimeString().slice(0, 5));
            setValue(resultToEdit.concValue.toString());
            setUnit(resultToEdit.unit);
        } else {
            const now = new Date();
            setDate(now.toISOString().split('T')[0]);
            setTime(now.toTimeString().slice(0, 5));
            setValue("");
            setUnit('pmol/l');
            setNote("");
        }
    }, [resultToEdit]);

    const handleSave = () => {
        if (!date || !time || !value) return;

        const dateTimeStr = `${date}T${time}`;
        const timeH = new Date(dateTimeStr).getTime() / 3600000;
        const numValue = parseFloat(value);

        if (isNaN(numValue) || numValue < 0) return;

        const newResult: LabResult = {
            id: resultToEdit?.id || uuidv4(),
            timeH,
            concValue: numValue,
            unit
        };

        onSave(newResult);
    };

    const handleDelete = () => {
        if (resultToEdit && onDelete) {
            onDelete(resultToEdit.id);
        }
    };

    return (
        <div className={`flex flex-col h-full bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] transition-colors duration-300 ${isInline ? 'rounded-[var(--radius-xl)] shadow-[var(--shadow-m3-1)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]' : ''}`}>
            {/* Header */}
            {isInline && (
                <div className="p-4 border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] flex justify-between items-center bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container-high)] rounded-t-[var(--radius-xl)]">
                    <h3 className="text-sm font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] px-2">
                        {t('lab.add_title')}
                    </h3>

                </div>
            )}

            <div className={`overflow-y-auto space-y-4 ${isInline ? 'p-4' : 'p-5'}`}>
                {/* Date & Time */}
                <div className="space-y-3 relative">
                    <label className="text-sm font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] flex items-center gap-2">
                        <Calendar size={16} className="text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]" />
                        {t('lab.date')}
                    </label>
                    <div
                        onClick={() => setIsDatePickerOpen(true)}
                        className="bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container-low)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] rounded-[var(--radius-md)] p-3 flex items-center justify-between cursor-pointer hover:border-[var(--color-m3-primary)] dark:hover:border-teal-400 transition-all font-mono"
                    >
                        <span className="text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] font-bold text-sm">
                            {date} <span className="text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] ml-2">{time}</span>
                        </span>
                        <Calendar size={16} className="text-[var(--color-m3-on-surface-variant)]" />
                    </div>
                    <DateTimePicker
                        isOpen={isDatePickerOpen}
                        onClose={() => setIsDatePickerOpen(false)}
                        initialDate={date && time ? new Date(`${date}T${time}`) : new Date()}
                        onConfirm={(d) => {
                            const year = d.getFullYear();
                            const month = String(d.getMonth() + 1).padStart(2, '0');
                            const day = String(d.getDate()).padStart(2, '0');
                            const hours = String(d.getHours()).padStart(2, '0');
                            const mins = String(d.getMinutes()).padStart(2, '0');
                            setDate(`${year}-${month}-${day}`);
                            setTime(`${hours}:${mins}`);
                            setIsDatePickerOpen(false);
                        }}
                    />
                </div>

                {/* Value & Unit */}
                <div className="space-y-3">
                    <label className="text-sm font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] flex items-center gap-2">
                        <Activity size={16} className="text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]" />
                        {t('lab.value')}
                    </label>
                    <div className="flex gap-3">
                        <div className="relative flex-1">
                            <input
                                type="number"
                                inputMode="decimal"
                                placeholder="0.0"
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                className="bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container-high)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] text-lg rounded-[var(--radius-md)] focus:ring-2 focus:ring-[var(--color-m3-primary-container)] focus:border-[var(--color-m3-primary)] block w-full p-3 font-bold placeholder-[var(--color-m3-outline)] outline-none transition-colors"
                            />
                        </div>
                        <div className="flex bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container-high)] rounded-[var(--radius-md)] p-1 border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]">
                            <button
                                onClick={() => setUnit('pmol/l')}
                                className={`px-4 py-3.5 rounded-[var(--radius-sm)] text-sm font-bold transition-all ${unit === 'pmol/l' ? 'bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] text-[var(--color-m3-primary)] dark:text-teal-400 shadow-sm' : 'text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] hover:text-[var(--color-m3-on-surface)]'}`}
                            >
                                pmol/L
                            </button>
                            <button
                                onClick={() => setUnit('pg/ml')}
                                className={`px-4 py-3.5 rounded-[var(--radius-sm)] text-sm font-bold transition-all ${unit === 'pg/ml' ? 'bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] text-[var(--color-m3-primary)] dark:text-teal-400 shadow-sm' : 'text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] hover:text-[var(--color-m3-on-surface)]'}`}
                            >
                                pg/mL
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className={`px-3 py-2.5 border-t border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container-high)] flex justify-between items-center shrink-0 safe-area-pb transition-colors duration-300 ${isInline ? 'rounded-b-[var(--radius-xl)]' : ''}`}>
                {resultToEdit && onDelete && (
                    <button
                        onClick={handleDelete}
                        className="p-2 text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-[var(--radius-full)] transition-all"
                    >
                        <Trash2 size={18} />
                    </button>
                )}

                <div className="flex gap-2 ml-auto">
                    <button
                        onClick={handleSave}
                        disabled={!value || !date || !time}
                        className="px-6 py-3.5 bg-[var(--color-m3-primary)] dark:bg-teal-600 text-[var(--color-m3-on-primary)] rounded-[var(--radius-full)] font-bold text-base transition-all disabled:opacity-70 flex items-center justify-center gap-1.5 shadow-[var(--shadow-m3-1)]"
                    >
                        <Check size={18} />
                        <span>{t('btn.save')}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LabResultForm;
