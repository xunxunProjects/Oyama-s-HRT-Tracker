import { ApiError, apiErrorCode } from '../services/apiClient';
import { LOCALE_MAP } from './helpers';

/**
 * The words for a failed sign-in. The worker answers in English, and showing
 * its message as it came put "Invalid credentials" in front of every reader.
 * The two failures a person causes by typing get the translated line; anything
 * else keeps the server's message, which is at least specific.
 */
export const describeAuthError = (err: unknown, t: (key: string) => string, lang?: string): string => {
    const code = apiErrorCode(err);
    if (code === 'INVALID_CREDENTIALS') return t('auth.invalid_credentials');
    if (code === 'TWO_FACTOR_INVALID') return t('account.2fa_verify_failed');
    if (code === 'ACCOUNT_LOCKED') {
        const retryAt = Date.now() + ((err instanceof ApiError && err.retryAfterMs) || 15 * 60_000);
        const time = new Intl.DateTimeFormat((lang && LOCALE_MAP[lang]) || undefined, {
            hour: 'numeric',
            minute: '2-digit',
        }).format(retryAt);
        return t('auth.account_locked').replace('{time}', time);
    }
    if (code === 'RATE_LIMITED') return t('auth.too_many_attempts');
    return (err instanceof Error && err.message) || t('error.generic');
};
