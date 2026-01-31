import React, { useState, useEffect } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { useEscape } from '../hooks/useEscape';

const PasswordInputModal = ({ isOpen, onClose, onConfirm }: { isOpen: boolean, onClose: () => void, onConfirm: (pw: string) => void }) => {
    const { t } = useTranslation();
    const [password, setPassword] = useState("");

    useEscape(onClose, isOpen);

    useEffect(() => {
        if (isOpen) setPassword("");
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-[60] animate-in fade-in duration-200">
            <div className="bg-white dark:bg-zinc-900 rounded-[24px] shadow-xl border border-zinc-200 dark:border-zinc-800 w-full max-w-lg md:max-w-xl p-6 md:p-8 animate-in slide-in-from-bottom duration-300 safe-area-pb transition-colors duration-300">
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2 text-center tracking-tight transition-colors">{t('import.password_title')}</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-8 text-center transition-colors leading-relaxed">{t('import.password_desc')}</p>

                <input
                    type="text"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full p-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-4 focus:ring-pink-500/10 focus:border-pink-500 outline-none font-mono text-center text-lg mb-8 text-zinc-900 dark:text-white transition-all placeholder:text-zinc-300 dark:placeholder:text-zinc-600"
                    placeholder="Password"
                    autoFocus
                />

                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3.5 text-zinc-600 dark:text-zinc-400 font-bold bg-zinc-100 dark:bg-zinc-800 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 transition">{t('btn.cancel')}</button>
                    <button
                        onClick={() => onConfirm(password)}
                        disabled={!password}
                        className="flex-1 py-3.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold rounded-full hover:bg-zinc-800 dark:hover:bg-zinc-200 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-zinc-900/10 dark:shadow-zinc-100/10"
                    >
                        {t('btn.ok')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PasswordInputModal;
