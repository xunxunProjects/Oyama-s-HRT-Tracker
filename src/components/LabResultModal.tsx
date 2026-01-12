import React, { useState, useEffect } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { LabResult } from '../logic';
import { X, Calendar, Activity, TestTube, FileText, Trash2, Check, FlaskConical } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface LabResultModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (result: LabResult) => void;
    onDelete?: (id: string) => void;
    resultToEdit?: LabResult | null;
}

const LabResultModal = ({ isOpen, onClose, onSave, onDelete, resultToEdit }: LabResultModalProps) => {
    const { t } = useTranslation();
    const [date, setDate] = useState("");
    const [time, setTime] = useState("");
    const [value, setValue] = useState("");
    const [unit, setUnit] = useState<'pg/ml' | 'pmol/l'>('pmol/l');
    const [note, setNote] = useState("");

    useEffect(() => {
        if (isOpen) {
            if (resultToEdit) {
                const d = new Date(resultToEdit.timeH * 3600000);
                setDate(d.toISOString().split('T')[0]);
                setTime(d.toTimeString().slice(0, 5));
                setValue(resultToEdit.concValue.toString());
                setUnit(resultToEdit.unit);
                // Note is not in LabResult yet, maybe add it? For now ignore.
            } else {
                const now = new Date();
                setDate(now.toISOString().split('T')[0]);
                setTime(now.toTimeString().slice(0, 5));
                setValue("");
                setUnit('pmol/l');
                setNote("");
            }
        }
    }, [isOpen, resultToEdit]);

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
        onClose();
    };

    const handleDelete = () => {
        if (resultToEdit && onDelete) {
            onDelete(resultToEdit.id);
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-50 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-900 rounded-t-3xl md:rounded-3xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] md:max-h-[85vh] animate-in slide-in-from-bottom duration-300 transition-colors duration-300">

                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-white dark:bg-gray-900 shrink-0 transition-colors duration-300">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <FlaskConical className="text-teal-500" size={20} />
                        {resultToEdit ? t('lab.edit_title') : t('lab.add_title')}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                        <X size={20} className="text-gray-500 dark:text-gray-400" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-6">
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
                <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50 flex gap-3 shrink-0 safe-area-pb transition-colors duration-300">
                    {resultToEdit && onDelete && (
                        <button
                            onClick={handleDelete}
                            className="p-4 text-red-500 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-xl transition-colors"
                        >
                            <Trash2 size={20} />
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
        </div>
    );
};

export default LabResultModal;

