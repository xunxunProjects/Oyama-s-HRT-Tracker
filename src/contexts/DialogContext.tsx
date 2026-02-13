import React, { createContext, useContext, useState, useCallback } from 'react';
import { useTranslation } from './LanguageContext';

type DialogType = 'alert' | 'confirm';

interface DialogContextType {
    showDialog: (type: DialogType, message: string, onConfirm?: () => void) => void;
}

const DialogContext = createContext<DialogContextType | null>(null);

export const useDialog = () => {
    const ctx = useContext(DialogContext);
    if (!ctx) throw new Error("useDialog must be used within DialogProvider");
    return ctx;
};

export const DialogProvider = ({ children }: { children: React.ReactNode }) => {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [type, setType] = useState<DialogType>('alert');
    const [message, setMessage] = useState("");
    const [onConfirm, setOnConfirm] = useState<(() => void) | null>(null);

    const showDialog = useCallback((type: DialogType, message: string, onConfirm?: () => void) => {
        setType(type);
        setMessage(message);
        setOnConfirm(() => onConfirm || null);
        setIsOpen(true);
    }, []);

    const handleConfirm = () => {
        if (onConfirm) onConfirm();
        setIsOpen(false);
    };

    return (
        <DialogContext.Provider value={{ showDialog }}>
            {children}
            {isOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-6" style={{ animation: 'dialogFadeIn 0.18s ease-out forwards' }}>
                    <style>{`
                        @keyframes dialogFadeIn { from { opacity: 0; } to { opacity: 1; } }
                        @keyframes dialogScaleIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
                    `}</style>
                    <div className="w-full max-w-sm">
                        <div
                            className="bg-[var(--color-m3-surface-container-high)] dark:bg-[var(--color-m3-dark-surface-container-high)] rounded-[var(--radius-xl)] shadow-[var(--shadow-m3-3)] p-6 transform transition-all"
                            style={{ animation: 'dialogScaleIn 0.2s ease-out forwards' }}
                        >
                            <h3 className="font-display text-base font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] mb-3 tracking-tight">
                                {type === 'confirm' ? t('dialog.confirm_title') : t('dialog.alert_title')}
                            </h3>
                            <p className="text-sm text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] mb-6 leading-relaxed">{message}</p>
                            <div className="flex justify-end gap-2">
                                {type === 'confirm' && (
                                    <button
                                        onClick={() => setIsOpen(false)}
                                        className="px-5 py-2.5 text-sm font-bold text-[var(--color-m3-primary)] dark:text-teal-400 rounded-[var(--radius-full)] hover:bg-[var(--color-m3-primary-container)]/40 dark:hover:bg-teal-900/20 transition-all"
                                    >
                                        {t('btn.cancel')}
                                    </button>
                                )}
                                <button
                                    onClick={handleConfirm}
                                    className="px-5 py-2.5 text-sm font-bold bg-[var(--color-m3-primary)] dark:bg-teal-600 text-[var(--color-m3-on-primary)] rounded-[var(--radius-full)] hover:shadow-[var(--shadow-m3-1)] transition-all"
                                >
                                    {type === 'confirm' ? t('btn.ok') : t('btn.ok')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </DialogContext.Provider>
    );
};
