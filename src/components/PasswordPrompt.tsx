import { useState, useEffect, useId } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { PromptPlace, useInlineHost } from '../contexts/DialogContext';
import { useEscape } from '../hooks/useEscape';

interface PasswordPromptProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (pw: string, code: string) => void;
    title?: string;
    description?: string;
    error?: string | null;
    loading?: boolean;
    /** Mask the input as a password field (defaults to the legacy visible text). */
    masked?: boolean;
    /** Ask for the current TOTP or backup code alongside the password. */
    secondFactor?: boolean;
    /** What the password is for (a backup, a passkey), when one page asks for
     *  several: a new one moves the line under the row pressed for it. */
    anchorKey?: string | number;
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
    secondFactor,
    anchorKey,
}: PasswordPromptProps) => {
    const { t } = useTranslation();
    const [password, setPassword] = useState('');
    const [code, setCode] = useState('');
    const host = useInlineHost(isOpen, anchorKey);
    const id = useId();

    useEscape(onClose, isOpen);

    useEffect(() => {
        if (isOpen) {
            setPassword('');
            setCode('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const line = (
        <form
            className="inline-prompt m-appear"
            aria-labelledby={`${id}-title`}
            onSubmit={e => {
                e.preventDefault();
                if (password && (!secondFactor || code) && !loading) onConfirm(password, code);
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
                    className="input-base mt-2"
                    placeholder={t('auth.password')}
                    aria-label={t('auth.password')}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${id}-error` : undefined}
                    autoComplete="current-password"
                    autoFocus
                />
                {secondFactor && (
                    <>
                        <input
                            type="text"
                            value={code}
                            onChange={e => setCode(e.target.value)}
                            className="input-base mt-2"
                            placeholder={t('auth.totp_placeholder')}
                            aria-label={t('account.2fa_code')}
                            inputMode="text"
                            autoComplete="one-time-code"
                        />
                        <p className="mt-1.5 text-xs text-[var(--text-muted)]">{t('account.step_up_hint')}</p>
                    </>
                )}
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
                <button
                    type="submit"
                    disabled={!password || (!!secondFactor && !code) || loading}
                    className="btn-primary btn-sm"
                >
                    {t('btn.ok')}
                </button>
            </div>
        </form>
    );

    return <PromptPlace host={host}>{line}</PromptPlace>;
};

export default PasswordPrompt;
