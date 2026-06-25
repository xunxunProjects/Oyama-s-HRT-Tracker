import React, { useState, useEffect } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { useDialog } from '../contexts/DialogContext';
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
        <div className="modal-overlay">
            <div className="modal-shell">
                <div className="modal-card">
                    <h3 className="modal-title">{t('modal.weight.title')}</h3>

                    <div className="flex justify-center mb-5">
                        <div className="flex items-end gap-2">
                            <input
                                type="number"
                                inputMode="decimal"
                                value={weightStr}
                                onChange={(e) => setWeightStr(e.target.value)}
                                className="text-2xl font-medium tabular-nums w-20 text-center bg-transparent border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] focus:border-[var(--color-m3-primary)] outline-none pb-1 text-body"
                                placeholder="0.0"
                                autoFocus
                            />
                            <span className="text-sm text-muted pb-1">kg</span>
                        </div>
                    </div>

                    <p className="callout mb-5">
                        {t('modal.weight.desc')}
                    </p>

                    <div className="flex gap-2">
                        <button onClick={onClose} className="btn-secondary flex-1">
                            {t('btn.cancel')}
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="btn-primary flex-1"
                        >
                            {t('btn.save')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WeightEditorModal;
