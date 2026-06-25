import React, { useState } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { Copy } from 'lucide-react';
import { useEscape } from '../hooks/useEscape';

const PasswordDisplayModal = ({ isOpen, onClose, password }: { isOpen: boolean, onClose: () => void, password: string }) => {
    const { t } = useTranslation();
    const [copied, setCopied] = useState(false);

    useEscape(onClose, isOpen);

    const handleCopy = () => {
        navigator.clipboard.writeText(password);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay z-[60] p-4">
            <div className="modal-shell">
                <div className="modal-card">
                    <h3 className="modal-title text-center">{t('export.password_title')}</h3>
                    <p className="text-xs text-muted mb-4 text-center leading-relaxed">{t('export.password_desc')}</p>

                    <div className="callout mb-4 flex items-center justify-between">
                        <span className="font-mono text-sm font-medium tracking-widest select-all text-body">{password}</span>
                        <button onClick={handleCopy} className="p-1.5 text-muted hover:text-body">
                            {copied ? <span className="text-xs">{t('qr.copied')}</span> : <Copy size={18} />}
                        </button>
                    </div>

                    <button onClick={onClose} className="btn-primary w-full">
                        {t('btn.ok')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PasswordDisplayModal;
