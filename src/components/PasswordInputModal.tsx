import React, { useState, useEffect } from 'react';
import { useTranslation } from '../contexts/LanguageContext';

const PasswordInputModal = ({ isOpen, onClose, onConfirm }: { isOpen: boolean, onClose: () => void, onConfirm: (pw: string) => void }) => {
    const { t } = useTranslation();
    const [password, setPassword] = useState("");

    useEffect(() => {
        if (isOpen) setPassword("");
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-[60] animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-900 rounded-t-3xl md:rounded-3xl shadow-md shadow-gray-900/10 w-full max-w-lg md:max-w-xl p-6 md:p-8 animate-in slide-in-from-bottom duration-300 safe-area-pb transition-colors duration-300">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2 text-center transition-colors">{t('import.password_title')}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 text-center transition-colors">{t('import.password_desc')}</p>

                <input
                    type="text"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-pink-300 outline-none font-mono text-center text-lg mb-6 text-gray-900 dark:text-white transition-colors"
                    placeholder="..."
                    autoFocus
                />

                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3.5 text-gray-600 dark:text-gray-300 font-bold bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition">{t('btn.cancel')}</button>
                    <button
                        onClick={() => onConfirm(password)}
                        disabled={!password}
                        className="flex-1 py-3.5 bg-[#f6c4d7] dark:bg-pink-700 text-white font-bold rounded-xl hover:bg-[#f3b4cb] dark:hover:bg-pink-600 transition disabled:opacity-50"
                    >
                        {t('btn.ok')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PasswordInputModal;
