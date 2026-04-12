import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import { useEscape } from '../hooks/useEscape';
import { AlertTriangle } from 'lucide-react';

const DeleteAccountModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
    const { t } = useTranslation();
    const { deleteAccount } = useAuth();
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");

    useEscape(onClose, isOpen);

    useEffect(() => {
        if (isOpen) {
            setPassword("");
            setError("");
        }
    }, [isOpen]);

    const handleSubmit = async () => {
        if (!password) return;
        setIsLoading(true);
        setError("");
        try {
            await deleteAccount(password);
            // Logout is handled in context
            onClose();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] animate-in fade-in duration-200 p-6">
            <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-lg w-full max-w-sm p-6 duration-300 animate-in fade-in zoom-in-95 border-2 border-red-500/20">
                <div className="flex flex-col items-center mb-4">
                    <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full mb-3 text-red-600 dark:text-red-400">
                        <AlertTriangle size={24} />
                    </div>
                    <h3 className="text-base font-medium text-gray-900 dark:text-gray-100 tracking-tight transition-colors">{t('account.delete_account')}</h3>
                </div>

                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 text-center transition-colors leading-relaxed">{t('account.delete_account_desc')}</p>
                <p className="text-xs text-red-600 dark:text-red-400 font-bold mb-5 text-center transition-colors leading-relaxed">{t('account.delete_warning')}</p>

                {error && (
                    <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs rounded-lg text-center">
                        {error}
                    </div>
                )}

                <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full p-3 text-sm bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container)] border border-[var(--color-m3-outline)] dark:border-[var(--color-m3-dark-outline)] rounded-md focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none font-mono text-gray-900 dark:text-gray-100 transition-colors placeholder-gray-400 dark:placeholder-gray-500 mb-5"
                    placeholder={t('account.enter_password_confirm')}
                    autoFocus
                />

                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-gray-500 dark:text-gray-400 rounded-md hover:bg-gray-100 dark:hover:bg-neutral-800 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">{t('btn.cancel')}</button>
                    <button
                        onClick={handleSubmit}
                        disabled={!password || isLoading}
                        className="px-5 py-2.5 text-sm bg-red-600 text-white font-medium rounded-md transition-colors disabled:opacity-70 hover:bg-red-700"
                    >
                        {isLoading ? '...' : t('btn.ok')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DeleteAccountModal;
