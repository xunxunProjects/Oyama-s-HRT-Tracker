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
                <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-[100] p-0 md:p-4">
                    <div className="w-full md:max-w-sm safe-area-pb">
                        <div
                            className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-t-2xl md:rounded-xl shadow-lg p-6 md:p-5 max-h-[88vh] overflow-y-auto"
                        >
                            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
                                {type === 'confirm' ? t('dialog.confirm_title') : t('dialog.alert_title')}
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-gray-300 mb-5 leading-relaxed">{message}</p>
                            <div className="flex gap-3 pt-1">
                                {type === 'confirm' && (
                                    <button
                                        onClick={() => setIsOpen(false)}
                                        className="flex-1 py-3 md:py-2 text-base md:text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-neutral-600 rounded-xl md:rounded-md"
                                    >
                                        {t('btn.cancel')}
                                    </button>
                                )}
                                <button
                                    onClick={handleConfirm}
                                    className="flex-1 py-3 md:py-2 text-base md:text-sm font-medium bg-[var(--color-m3-primary)] hover:bg-[var(--color-m3-primary-light)] text-white rounded-xl md:rounded-md"
                                >
                                    {t('btn.ok')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </DialogContext.Provider>
    );
};
