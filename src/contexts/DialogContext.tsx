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
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end justify-center z-[100] p-4" style={{ animation: 'dialogFadeIn 0.18s ease-out forwards' }}>
                    <style>{`
                        @keyframes dialogFadeIn { from { opacity: 0; } to { opacity: 1; } }
                        @keyframes dialogSlideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
                    `}</style>
                    <div className="w-full max-w-lg">
                        <div className="bg-white dark:bg-zinc-900 rounded-[24px] shadow-xl border border-zinc-200 dark:border-zinc-800 p-6 transform transition-all" style={{ animation: 'dialogSlideUp 0.22s ease-out forwards' }}>
                            <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2 tracking-tight">
                                {type === 'confirm' ? t('dialog.confirm_title') : t('dialog.alert_title')}
                            </h3>
                            <p className="text-zinc-500 dark:text-zinc-400 mb-6 leading-relaxed text-sm">{message}</p>
                            <div className="flex gap-3">
                                {type === 'confirm' && (
                                    <button
                                        onClick={() => setIsOpen(false)}
                                        className="flex-1 py-3.5 text-zinc-600 dark:text-zinc-400 font-bold bg-zinc-100 dark:bg-zinc-800 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
                                    >
                                        {t('btn.cancel')}
                                    </button>
                                )}
                                <button
                                    onClick={handleConfirm}
                                    className="flex-1 py-3.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold rounded-full hover:bg-zinc-800 dark:hover:bg-zinc-200 transition shadow-lg shadow-zinc-900/10 dark:shadow-zinc-100/10"
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
