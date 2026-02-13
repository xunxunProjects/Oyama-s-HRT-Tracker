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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200 p-6">
            <div className="bg-[var(--color-m3-surface-container-high)] dark:bg-[var(--color-m3-dark-surface-container-high)] rounded-[var(--radius-xl)] shadow-[var(--shadow-m3-3)] w-full max-w-sm p-6 animate-m3-decelerate safe-area-pb transition-colors duration-300">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-display text-base font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] tracking-tight">{t('modal.weight.title')}</h3>
                </div>

                <div className="flex justify-center mb-6">
                    <div className="relative flex flex-col items-center">
                        <input
                            type="number"
                            inputMode="decimal"
                            value={weightStr}
                            onChange={(e) => setWeightStr(e.target.value)}
                            className="font-display text-4xl font-black text-[var(--color-m3-primary)] dark:text-teal-400 tabular-nums w-36 text-center bg-transparent border-b-2 border-[var(--color-m3-primary-container)] dark:border-teal-900/50 focus:border-[var(--color-m3-primary)] dark:focus:border-teal-400 outline-none transition-colors pb-1"
                            placeholder="0.0"
                            autoFocus
                        />
                        <div className="text-sm font-bold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] mt-2">kg</div>
                    </div>
                </div>

                <div className="bg-[var(--color-m3-primary-container)] dark:bg-teal-900/20 p-3 rounded-[var(--radius-md)] mb-5 flex gap-2.5 items-start transition-colors border border-[var(--color-m3-outline-variant)] dark:border-teal-900/30">
                    <Info className="w-4 h-4 text-[var(--color-m3-primary)] dark:text-teal-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-[var(--color-m3-on-primary-container)] dark:text-teal-300 leading-relaxed transition-colors font-medium">
                        {t('modal.weight.desc')}
                    </p>
                </div>
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-[var(--color-m3-primary)] dark:text-teal-400 rounded-[var(--radius-full)] hover:bg-[var(--color-m3-primary-container)]/40 dark:hover:bg-teal-900/20 transition-all">{t('btn.cancel')}</button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className={`px-5 py-2.5 text-sm bg-[var(--color-m3-primary)] dark:bg-teal-600 text-[var(--color-m3-on-primary)] font-bold rounded-[var(--radius-full)] transition shadow-[var(--shadow-m3-1)] ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}
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
