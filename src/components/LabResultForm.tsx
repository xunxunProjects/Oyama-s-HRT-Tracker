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
    const [date, setDate] = useState("");
    const [time, setTime] = useState("");
    const [value, setValue] = useState("");
    const [unit, setUnit] = useState<'pg/ml' | 'pmol/l'>('pmol/l');
    const [note, setNote] = useState("");

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
        <div className={`flex flex-col h-full bg-white dark:bg-gray-900 transition-colors duration-300 ${isInline ? 'rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-800' : ''}`}>
            {/* Header */}
            {isInline && (
                <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50 rounded-t-[2rem]">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white px-2">
                        {t('lab.add_title')}
                    </h3>
                    <button onClick={onCancel} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition">
                        <X size={16} className="text-gray-500 dark:text-gray-400" />
                    </button>
                </div>
            )}

            <div className={`overflow-y-auto space-y-6 ${isInline ? 'p-4' : 'p-6'}`}>
                {/* Date & Time */}
                <div className="space-y-3">
                    <label className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                        <Calendar size={16} className="text-gray-400 dark:text-gray-500" />
                        {t('lab.date')}
                    </label>
                    <div className="flex gap-3">
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-sm rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent block w-full p-3 font-medium transition-colors"
                        />
                        <input
                            type="time"
                            value={time}
                            onChange={(e) => setTime(e.target.value)}
                            className="w-32 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-sm rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent block p-3 font-medium text-center transition-colors"
                        />
                    </div>
                </div>

                {/* Value & Unit */}
                <div className="space-y-3">
                    <label className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                        <Activity size={16} className="text-gray-400 dark:text-gray-500" />
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
                                className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-lg rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent block w-full p-3 font-bold placeholder-gray-300 dark:placeholder-gray-600 transition-colors"
                            />
                        </div>
                        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 border border-gray-200 dark:border-gray-700">
                            <button
                                onClick={() => setUnit('pmol/l')}
                                className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${unit === 'pmol/l' ? 'bg-white dark:bg-gray-700 shadow-sm text-teal-600 dark:text-teal-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                            >
                                pmol/L
                            </button>
                            <button
                                onClick={() => setUnit('pg/ml')}
                                className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${unit === 'pg/ml' ? 'bg-white dark:bg-gray-700 shadow-sm text-teal-600 dark:text-teal-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                            >
                                pg/mL
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className={`p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50 flex gap-3 shrink-0 safe-area-pb transition-colors duration-300 ${isInline ? 'rounded-b-[2rem]' : ''}`}>
                {resultToEdit && onDelete && (
                    <button
                        onClick={handleDelete}
                        className="p-4 text-red-500 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-xl transition-colors"
                    >
                        <Trash2 size={20} />
                    </button>
                )}

                {/* Inline Cancel Button */}
                {isInline && (
                    <button
                        onClick={onCancel}
                        className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold py-4 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-all active:scale-[0.98]"
                    >
                        {t('btn.cancel')}
                    </button>
                )}

                <button
                    onClick={handleSave}
                    disabled={!value || !date || !time}
                    className="flex-1 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-bold py-4 rounded-xl hover:bg-gray-800 dark:hover:bg-white active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100"
                >
                    <Check size={20} />
                    {t('btn.save')}
                </button>
            </div>
        </div>
    );
};

export default LabResultForm;
