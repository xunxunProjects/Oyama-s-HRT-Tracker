import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import { useEscape } from '../hooks/useEscape';

const ChangePasswordModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
    const { t } = useTranslation();
    const { changePassword } = useAuth();
    const [current, setCurrent] = useState("");
    const [newPass, setNewPass] = useState("");
    const [confirm, setConfirm] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");

    useEscape(onClose, isOpen);

    useEffect(() => {
        if (isOpen) {
            setCurrent("");
            setNewPass("");
            setConfirm("");
            setError("");
        }
    }, [isOpen]);

    const handleSubmit = async () => {
        if (!current || !newPass || !confirm) return;
        if (newPass !== confirm) {
            setError("New passwords do not match");
            return;
        }
        if (newPass.length < 8) {
            setError("Password must be at least 8 characters");
            return;
        }

        setIsLoading(true);
        setError("");
        try {
            await changePassword(current, newPass);
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
            <div className="bg-[var(--color-m3-surface-container-high)] dark:bg-[var(--color-m3-dark-surface-container-high)] rounded-[var(--radius-xl)] shadow-[var(--shadow-m3-3)] w-full max-w-sm p-6 animate-m3-decelerate safe-area-pb transition-colors duration-300">
                <h3 className="font-display text-base font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] mb-2 text-center tracking-tight transition-colors">{t('account.change_password')}</h3>
                <p className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] mb-5 text-center transition-colors leading-relaxed">{t('account.change_password_desc')}</p>

                {error && (
                    <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs rounded-lg text-center">
                        {error}
                    </div>
                )}

                <div className="space-y-3 mb-5">
                    <input
                        type="password"
                        value={current}
                        onChange={e => setCurrent(e.target.value)}
                        className="w-full p-3 text-sm bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container)] border border-[var(--color-m3-outline)] dark:border-[var(--color-m3-dark-outline)] rounded-[var(--radius-md)] focus:ring-2 focus:ring-[var(--color-m3-primary-container)] focus:border-[var(--color-m3-primary)] dark:focus:border-teal-400 outline-none font-mono text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] transition-all placeholder:text-[var(--color-m3-outline)] dark:placeholder:text-[var(--color-m3-dark-outline)]"
                        placeholder={t('account.current_password')}
                        autoFocus
                    />
                    <input
                        type="password"
                        value={newPass}
                        onChange={e => setNewPass(e.target.value)}
                        className="w-full p-3 text-sm bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container)] border border-[var(--color-m3-outline)] dark:border-[var(--color-m3-dark-outline)] rounded-[var(--radius-md)] focus:ring-2 focus:ring-[var(--color-m3-primary-container)] focus:border-[var(--color-m3-primary)] dark:focus:border-teal-400 outline-none font-mono text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] transition-all placeholder:text-[var(--color-m3-outline)] dark:placeholder:text-[var(--color-m3-dark-outline)]"
                        placeholder={t('account.new_password')}
                    />
                    <input
                        type="password"
                        value={confirm}
                        onChange={e => setConfirm(e.target.value)}
                        className="w-full p-3 text-sm bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container)] border border-[var(--color-m3-outline)] dark:border-[var(--color-m3-dark-outline)] rounded-[var(--radius-md)] focus:ring-2 focus:ring-[var(--color-m3-primary-container)] focus:border-[var(--color-m3-primary)] dark:focus:border-teal-400 outline-none font-mono text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] transition-all placeholder:text-[var(--color-m3-outline)] dark:placeholder:text-[var(--color-m3-dark-outline)]"
                        placeholder={t('account.confirm_password')}
                    />
                </div>

                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-[var(--color-m3-primary)] dark:text-teal-400 rounded-[var(--radius-full)] hover:bg-[var(--color-m3-primary-container)]/40 dark:hover:bg-teal-900/20 transition-all">{t('btn.cancel')}</button>
                    <button
                        onClick={handleSubmit}
                        disabled={!current || !newPass || !confirm || isLoading}
                        className="px-5 py-2.5 text-sm bg-[var(--color-m3-primary)] dark:bg-teal-600 text-[var(--color-m3-on-primary)] font-bold rounded-[var(--radius-full)] transition disabled:opacity-50 disabled:cursor-not-allowed shadow-[var(--shadow-m3-1)]"
                    >
                        {isLoading ? '...' : t('btn.save')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChangePasswordModal;
