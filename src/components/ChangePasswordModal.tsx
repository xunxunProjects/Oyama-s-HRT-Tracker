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
            <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-lg w-full max-w-sm p-6 duration-300 animate-in fade-in zoom-in-95">
                <h3 className="text-base font-medium text-gray-900 dark:text-gray-100 mb-2 text-center tracking-tight transition-colors">{t('account.change_password')}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-5 text-center transition-colors leading-relaxed">{t('account.change_password_desc')}</p>

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
                        className="w-full p-3 text-sm bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-md focus:ring-1 focus:ring-pink-500 focus:border-pink-500 outline-none font-mono text-gray-900 dark:text-gray-100 transition-colors placeholder-gray-400 dark:placeholder-gray-500"
                        placeholder={t('account.current_password')}
                        autoFocus
                    />
                    <input
                        type="password"
                        value={newPass}
                        onChange={e => setNewPass(e.target.value)}
                        className="w-full p-3 text-sm bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-md focus:ring-1 focus:ring-pink-500 focus:border-pink-500 outline-none font-mono text-gray-900 dark:text-gray-100 transition-colors placeholder-gray-400 dark:placeholder-gray-500"
                        placeholder={t('account.new_password')}
                    />
                    <input
                        type="password"
                        value={confirm}
                        onChange={e => setConfirm(e.target.value)}
                        className="w-full p-3 text-sm bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-md focus:ring-1 focus:ring-pink-500 focus:border-pink-500 outline-none font-mono text-gray-900 dark:text-gray-100 transition-colors placeholder-gray-400 dark:placeholder-gray-500"
                        placeholder={t('account.confirm_password')}
                    />
                </div>

                <div className="flex gap-3 pt-1">
                    <button onClick={onClose} className="flex-1 py-3 md:py-2 text-base md:text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-neutral-600 rounded-xl md:rounded-md transition-colors">{t('btn.cancel')}</button>
                    <button
                        onClick={handleSubmit}
                        disabled={!current || !newPass || !confirm || isLoading}
                        className="flex-1 py-3 md:py-2 text-base md:text-sm font-medium bg-[var(--color-m3-primary)] hover:bg-[var(--color-m3-primary-light)] text-white rounded-xl md:rounded-md transition disabled:opacity-70"
                    >
                        {isLoading ? '...' : t('btn.save')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChangePasswordModal;
