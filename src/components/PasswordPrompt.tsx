import { useState, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../contexts/LanguageContext';
import { useInlineHost } from '../contexts/DialogContext';
import { useEscape } from '../hooks/useEscape';
import { PAGE_COLUMN } from './PageHeader';

interface PasswordPromptProps {
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

/**
 * Asks for a password as a line in the page, right under what needed it (an
 * encrypted file being imported, a cloud backup being opened, a security
 * change), the same way the app's other prompts do. There is no dialog.
 */
const PasswordPrompt = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    error,
    loading,
    masked,
}: PasswordPromptProps) => {
    const { t } = useTranslation();
    const [password, setPassword] = useState('');
    const host = useInlineHost(isOpen);
    const id = useId();

    useEscape(onClose, isOpen);

    useEffect(() => {
        if (isOpen) setPassword('');
    }, [isOpen]);

    if (!isOpen) return null;

    const line = (
        <form
            className="inline-prompt m-appear"
            aria-labelledby={`${id}-title`}
            onSubmit={e => {
                e.preventDefault();
                if (password && !loading) onConfirm(password);
            }}
        >
            <div className="inline-prompt-text basis-full">
                <p id={`${id}-title`} className="inline-prompt-title">
                    {title ?? t('import.password_title')}
                </p>
                <p className="inline-prompt-message">{description ?? t('import.password_desc')}</p>
                <input
                    type={masked ? 'password' : 'text'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="input-base mt-2 font-mono"
                    placeholder={t('auth.password')}
                    aria-label={t('auth.password')}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${id}-error` : undefined}
                    autoComplete="current-password"
                    autoFocus
                />
                {error && (
                    <p id={`${id}-error`} className="field-hint is-error">
                        {error}
                    </p>
                )}
            </div>
            <div className="inline-prompt-actions">
                <button type="button" onClick={onClose} className="btn-secondary btn-sm">
                    {t('btn.cancel')}
                </button>
                <button type="submit" disabled={!password || loading} className="btn-primary btn-sm">
                    {t('btn.ok')}
                </button>
            </div>
        </form>
    );

    if (host) return createPortal(line, host);
    const slot = document.getElementById('prompt-slot');
    return slot ? (
        createPortal(
            <div className="prompt-banner glass glass-bar">
                <div className={PAGE_COLUMN}>{line}</div>
            </div>,
            slot,
        )
    ) : (
        <div className={PAGE_COLUMN}>{line}</div>
    );
};

export default PasswordPrompt;
