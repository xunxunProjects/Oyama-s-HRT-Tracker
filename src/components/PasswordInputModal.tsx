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
        <div className="modal-overlay z-[60] p-4">
            <div className="modal-shell">
                <div className="modal-card">
                    <h3 className="modal-title text-center">{t('import.password_title')}</h3>
                    <p className="text-xs text-muted mb-4 text-center leading-relaxed">{t('import.password_desc')}</p>

                    <input
                        type="text"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="input-base font-mono text-center mb-4"
                        placeholder="Password"
                        autoFocus
                    />

                    <div className="flex gap-2">
                        <button onClick={onClose} className="btn-secondary flex-1">{t('btn.cancel')}</button>
                        <button
                            onClick={() => onConfirm(password)}
                            disabled={!password}
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
