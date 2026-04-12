import React, { useState, useEffect } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { LabResult } from '../../logic';
import { Calendar, Activity, Check, Trash2, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface LabResultFormProps {
    resultToEdit?: LabResult | null;
    onSave: (result: LabResult) => void;
    onCancel: () => void;
    onDelete?: (id: string) => void;
    isInline?: boolean;
}

const LabResultForm: React.FC<LabResultFormProps> = ({ resultToEdit, onSave, onCancel, onDelete, isInline = false }) => {
    const { t } = useTranslation();
    const [dateStr, setDateStr] = useState("");
    const [value, setValue] = useState("");
    const [unit, setUnit] = useState<'pg/ml' | 'pmol/l'>('pmol/l');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    useEffect(() => {
        if (resultToEdit) {
            const d = new Date(resultToEdit.timeH * 3600000);
            const iso = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
            setDateStr(iso);
            setValue(resultToEdit.concValue.toString());
            setUnit(resultToEdit.unit);
        } else {
            const now = new Date();
            const iso = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
            setDateStr(iso);
            setValue("");
            setUnit('pmol/l');
        }
    }, [resultToEdit]);

    const handleSave = () => {
        if (!dateStr || !value) return;

        const timeH = new Date(dateStr).getTime() / 3600000;
        const numValue = parseFloat(value);

        if (isNaN(numValue) || numValue < 0 || isNaN(timeH)) return;

        const newResult: LabResult = {
            id: resultToEdit?.id || uuidv4(),
            timeH,
            concValue: numValue,
            unit
        };

        onSave(newResult);
    };

    return (
        <div className={`flex flex-col h-full bg-white dark:bg-neutral-900 transition-colors duration-300 ${isInline ? 'border border-gray-200 dark:border-neutral-800 rounded-lg' : ''}`}>
            {/* Header */}
            {isInline && (
                <div className="p-4 border-b border-gray-200 dark:border-neutral-800 flex justify-between items-center bg-gray-50/50 dark:bg-neutral-900 rounded-t-lg">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 px-2">
                        {t('lab.add_title')}
                    </h3>
                </div>
            )}

            <div className={`overflow-y-auto ${isInline ? 'p-4' : 'p-5'} space-y-4`}>
                {/* Date & Time */}
                <div className="space-y-1.5 relative">
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 pl-1 flex items-center gap-1.5">
                        <Calendar size={14} className="text-gray-400 dark:text-gray-500" />
                        {t('lab.date')}
                    </label>
                    <input
                        type="datetime-local"
                        value={dateStr}
                        onChange={(e) => setDateStr(e.target.value)}
                        className="w-full bg-white dark:bg-neutral-900 rounded-md p-3 border border-gray-200 dark:border-neutral-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:focus:border-emerald-500 outline-none transition-colors text-sm font-medium text-gray-900 dark:text-gray-100"
                    />
                </div>

                {/* Value & Unit */}
                <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 pl-1 flex items-center gap-1.5">
                        <Activity size={14} className="text-gray-400 dark:text-gray-500" />
                        {t('lab.value')}
                    </label>
                    <div className="flex gap-2 items-center">
                        <div className="relative flex-1">
                            <input
                                type="number"
                                inputMode="decimal"
                                placeholder="0.0"
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                className="w-full bg-gray-50 dark:bg-neutral-900 rounded-md p-3 border border-gray-200 dark:border-neutral-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:focus:border-emerald-500 outline-none transition-colors font-medium text-gray-900 dark:text-gray-100 text-sm"
                            />
                        </div>
                        <div className="flex bg-gray-100 dark:bg-neutral-800 p-1 rounded-md border border-gray-200 dark:border-neutral-700 shrink-0">
                            <button
                                onClick={() => setUnit('pmol/l')}
                                className={`px-3 py-2 rounded text-xs font-semibold transition-colors ${unit === 'pmol/l' ? 'bg-white dark:bg-neutral-900 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
                            >
                                pmol/L
                            </button>
                            <button
                                onClick={() => setUnit('pg/ml')}
                                className={`px-3 py-2 rounded text-xs font-semibold transition-colors ${unit === 'pg/ml' ? 'bg-white dark:bg-neutral-900 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
                            >
                                pg/mL
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className={`px-4 py-3 border-t border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex justify-between items-center shrink-0 transition-colors duration-300 ${isInline ? 'rounded-b-lg' : ''}`}>
                <div className="flex gap-2 items-center flex-wrap min-h-10">
                    {resultToEdit && onDelete && (
                        <div className="flex items-center">
                            <div className={`overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] flex items-center ${
                                showDeleteConfirm ? 'w-36 sm:w-40 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded opacity-100 pl-3 pr-1 py-1' : 'w-0 opacity-0 border border-transparent'
                            }`}>
                                <span className="text-xs text-red-600 dark:text-red-400 font-medium whitespace-nowrap grow">{t('dialog.confirm_title')}?</span>
                                <div className="flex items-center shrink-0 ml-2">
                                    <button
                                        onClick={() => {
                                            onDelete(resultToEdit.id);
                                            onCancel();
                                        }}
                                        className="p-1 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 rounded transition-colors"
                                        title={t('btn.ok')}
                                    >
                                        <Check size={16} />
                                    </button>
                                    <button
                                        onClick={() => setShowDeleteConfirm(false)}
                                        className="p-1 text-gray-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                                        title={t('btn.cancel')}
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            </div>

                            <div className={`overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                                showDeleteConfirm ? 'w-0 opacity-0' : 'w-[2.35rem] opacity-100'
                            }`}>
                                <button
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="p-2 text-gray-400 hover:text-red-500 border border-transparent rounded transition-colors flex items-center justify-center"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex gap-2 ml-auto shrink-0">
                    <button
                        onClick={handleSave}
                        disabled={!value || !dateStr}
                        className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium text-sm transition-colors disabled:opacity-70 flex items-center justify-center gap-1.5"
                    >
                        <Check size={16} />
                        <span>{t('btn.save')}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LabResultForm;
