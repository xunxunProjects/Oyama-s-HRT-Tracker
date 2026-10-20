import React from 'react';
import { NewPasswordLevel } from '../../passwordStrength';
import { useTranslation } from '../contexts/LanguageContext';

// 'tooShort' is for forms that speak up before the minimum length is reached.
type HintLevel = NewPasswordLevel | 'tooShort';

const TONE: Record<HintLevel, string> = {
    tooShort: 'text-[var(--danger)]',
    tooLong: 'text-[var(--danger)]',
    weak: 'text-[var(--danger)]',
    fair: 'text-muted',
    strong: 'text-[var(--accent-ink)]',
};

const MESSAGE: Record<HintLevel, string> = {
    tooShort: 'pw.too_short',
    tooLong: 'pw.too_long',
    weak: 'pw.strength_weak',
    fair: 'pw.strength_fair',
    strong: 'pw.strength_strong',
};

/**
 * The one-line verdict under a new-password field. The paragraph stays mounted
 * while the field is on screen and only its text changes: screen readers
 * usually skip a live region that appears with its first message already in it.
 */
const PasswordStrengthHint: React.FC<{ level: HintLevel | null; id?: string; className?: string }> = ({
    level,
    id,
    className = '',
}) => {
    const { t } = useTranslation();
    return (
        <p id={id} className={`text-xs ${level ? TONE[level] : ''} ${className}`} aria-live="polite">
            {level ? t(MESSAGE[level]) : null}
        </p>
    );
};

export default PasswordStrengthHint;
