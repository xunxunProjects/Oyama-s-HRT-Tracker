import React, { useState, useEffect } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { useDialog } from '../contexts/DialogContext';
import { Info } from 'lucide-react';
import { useEscape } from '../hooks/useEscape';

const WeightEditorModal = ({ isOpen, onClose, currentWeight, onSave }: any) => {
    const { t } = useTranslation();
    const { showDialog } = useDialog();
    const [weightStr, setWeightStr] = useState(currentWeight.toString());

    useEscape(onClose, isOpen);

    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => setWeightStr(currentWeight.toString()), [currentWeight, isOpen]);

    const handleSave = () => {
        if (isSaving) return;
        setIsSaving(true);
        const val = parseFloat(weightStr);
        if (!isNaN(val) && val > 0) {
            onSave(val);
            onClose();
        } else {
            showDialog('alert', t('error.nonPositive'));
            setIsSaving(false);
        }
        setIsSaving(false);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-50 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-zinc-900 rounded-t-[32px] md:rounded-[24px] shadow-xl border border-zinc-200 dark:border-zinc-800 w-full max-w-lg md:max-w-xl p-6 md:p-8 animate-in slide-in-from-bottom duration-300 safe-area-pb transition-colors duration-300">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-zinc-900 dark:text-white transition-colors tracking-tight">{t('modal.weight.title')}</h3>
                </div>

                <div className="flex justify-center mb-10">
                    <div className="relative flex flex-col items-center">
                        <input
                            type="number"
                            inputMode="decimal"
                            value={weightStr}
                            onChange={(e) => setWeightStr(e.target.value)}
                            className="text-6xl font-black text-pink-400 tabular-nums w-48 text-center bg-transparent border-b-2 border-pink-100 dark:border-pink-900/50 focus:border-pink-400 outline-none transition-colors pb-2"
                            placeholder="0.0"
                            autoFocus
                        />
                        <div className="text-base font-bold text-zinc-400 mt-3">kg</div>
                    </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-2xl mb-8 flex gap-3 items-start transition-colors border border-blue-100 dark:border-blue-900/30">
                    <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed transition-colors font-medium">
                        {t('modal.weight.desc')}
                    </p>
                </div>
                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3.5 text-zinc-600 dark:text-zinc-400 font-bold bg-zinc-100 dark:bg-zinc-800 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 transition">{t('btn.cancel')}</button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className={`flex-1 py-3.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold rounded-full hover:bg-zinc-800 dark:hover:bg-zinc-200 transition shadow-lg shadow-zinc-900/10 dark:shadow-zinc-100/10 ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                        {isSaving ? (
                            <span className="flex items-center justify-center gap-2">
                                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                {t('btn.save')}
                            </span>
                        ) : (
                            t('btn.save')
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default WeightEditorModal;
