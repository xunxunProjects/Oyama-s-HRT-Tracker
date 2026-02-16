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
            <div className="bg-[var(--color-m3-surface-container-high)] dark:bg-[var(--color-m3-dark-surface-container-high)] rounded-[var(--radius-xl)] shadow-[var(--shadow-m3-3)] w-full max-w-sm p-6 animate-m3-decelerate safe-area-pb transition-colors duration-300 border-2 border-red-500/20">
                <div className="flex flex-col items-center mb-4">
                    <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full mb-3 text-red-600 dark:text-red-400">
                        <AlertTriangle size={24} />
                    </div>
                    <h3 className="font-display text-base font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] tracking-tight transition-colors">{t('account.delete_account')}</h3>
                </div>

                <p className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] mb-2 text-center transition-colors leading-relaxed">{t('account.delete_account_desc')}</p>
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
                    className="w-full p-3 text-sm bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container)] border border-[var(--color-m3-outline)] dark:border-[var(--color-m3-dark-outline)] rounded-[var(--radius-md)] focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none font-mono text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] transition-all placeholder:text-[var(--color-m3-outline)] dark:placeholder:text-[var(--color-m3-dark-outline)] mb-5"
                    placeholder={t('account.enter_password_confirm')}
                    autoFocus
                />

                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-[var(--color-m3-primary)] dark:text-teal-400 rounded-[var(--radius-full)] hover:bg-[var(--color-m3-primary-container)]/40 dark:hover:bg-teal-900/20 transition-all">{t('btn.cancel')}</button>
                    <button
                        onClick={handleSubmit}
                        disabled={!password || isLoading}
                        className="px-5 py-2.5 text-sm bg-red-600 text-white font-bold rounded-[var(--radius-full)] transition disabled:opacity-50 disabled:cursor-not-allowed shadow-[var(--shadow-m3-1)] hover:bg-red-700"
                    >
                        {isLoading ? '...' : t('btn.ok')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DeleteAccountModal;
