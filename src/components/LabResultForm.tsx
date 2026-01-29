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
        <div className={`flex flex-col h-full bg-white dark:bg-zinc-900 transition-colors duration-300 ${isInline ? 'rounded-[2rem] shadow-sm border border-zinc-100 dark:border-zinc-800' : ''}`}>
            {/* Header */}
            {isInline && (
                <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-800/50 rounded-t-[2rem]">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white px-2">
                        {t('lab.add_title')}
                    </h3>

                </div>
            )}

            <div className={`overflow-y-auto space-y-6 ${isInline ? 'p-4' : 'p-6'}`}>
                {/* Date & Time */}
                <div className="space-y-3 relative">
                    <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                        <Calendar size={16} className="text-zinc-400 dark:text-zinc-500" />
                        {t('lab.date')}
                    </label>
                    <div
                        onClick={() => setIsDatePickerOpen(true)}
                        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 flex items-center justify-between cursor-pointer hover:border-zinc-300 dark:hover:border-zinc-500 transition-all font-mono"
                    >
                        <span className="text-zinc-900 dark:text-white font-bold text-sm">
                            {date} <span className="text-zinc-400 dark:text-zinc-500 ml-2">{time}</span>
                        </span>
                        <Calendar size={16} className="text-zinc-400" />
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
                    <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                        <Activity size={16} className="text-zinc-400 dark:text-zinc-500" />
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
                                className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white text-lg rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent block w-full p-3 font-bold placeholder-zinc-300 dark:placeholder-zinc-600 transition-colors"
                            />
                        </div>
                        <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-xl p-1 border border-zinc-200 dark:border-zinc-700">
                            <button
                                onClick={() => setUnit('pmol/l')}
                                className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${unit === 'pmol/l' ? 'bg-white dark:bg-zinc-700 text-teal-600 dark:text-teal-400' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                            >
                                pmol/L
                            </button>
                            <button
                                onClick={() => setUnit('pg/ml')}
                                className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${unit === 'pg/ml' ? 'bg-white dark:bg-zinc-700 text-teal-600 dark:text-teal-400' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                            >
                                pg/mL
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            {/* Footer */}
            <div className={`p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/50 flex justify-between items-center shrink-0 safe-area-pb transition-colors duration-300 ${isInline ? 'rounded-b-[2rem]' : ''}`}>
                {resultToEdit && onDelete && (
                    <button
                        onClick={handleDelete}
                        className="p-2.5 text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-all"
                    >
                        <Trash2 size={20} />
                    </button>
                )}

                <div className="flex gap-3 ml-auto">
                    <button
                        onClick={onCancel}
                        className={`px-6 py-3.5 bg-zinc-100/80 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 font-bold text-[15px] transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${isInline ? 'hidden md:flex' : 'flex'}`}
                    >
                        <X size={18} />
                        <span>{t('btn.cancel')}</span>
                    </button>

                    <button
                        onClick={handleSave}
                        disabled={!value || !date || !time}
                        className="px-6 py-3.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-full hover:bg-zinc-800 dark:hover:bg-white font-bold text-[15px] transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:hover:scale-100 flex items-center justify-center gap-2"
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
