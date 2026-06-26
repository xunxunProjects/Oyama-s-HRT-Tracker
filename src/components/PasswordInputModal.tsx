import React, { useState, useEffect } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { useEscape } from '../hooks/useEscape';

interface PasswordInputModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (pw: string) => void;
    title?: string;
    description?: string;
    error?: string | null;
    loading?: boolean;
    /** Mask the input as a password field (defaults to the legacy visible text). */
    masked?: boolean;
}

const PasswordInputModal = ({ isOpen, onClose, onConfirm, title, description, error, loading, masked }: PasswordInputModalProps) => {
    const { t } = useTranslation();
    const [password, setPassword] = useState("");

    useEscape(onClose, isOpen);

    useEffect(() => {
        if (isOpen) setPassword("");
    }, [isOpen]);

    if (!isOpen) return null;

    const submit = () => { if (password && !loading) onConfirm(password); };

    return (
        <div className="modal-overlay z-[60] p-4">
            <div className="modal-shell">
                <div className="modal-card">
                    <h3 className="modal-title text-center">{title ?? t('import.password_title')}</h3>
                    <p className="text-xs text-muted mb-4 text-center leading-relaxed">{description ?? t('import.password_desc')}</p>

                    <input
                        type={masked ? 'password' : 'text'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
                        className="input-base font-mono text-center mb-2"
                        style={{ fontSize: '16px' }}
                        placeholder="Password"
                        autoComplete="current-password"
                        autoFocus
                    />

                    {error && (
                        <p className="text-xs text-red-500 dark:text-red-400 mb-2 text-center">{error}</p>
                    )}

                    <div className="flex gap-2 mt-2">
                        <button onClick={onClose} className="btn-secondary flex-1">{t('btn.cancel')}</button>
                        <button
                            onClick={submit}
                            disabled={!password || loading}
                            className="btn-primary flex-1"
                        >
                            {t('btn.ok')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PasswordInputModal;
