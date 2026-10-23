/**
 * Share links may be created with an expiry through the end of 2100, but only
 * the first year is inside the window where the security model is guaranteed.
 * Keeping both limits here lets the form and the Worker agree.
 */
export const MAX_SHARE_EXPIRY_YEAR = 2100;

// Exclusive upper bound. Noon UTC on 2101-01-01 is after the last instant of
// 2100 in every timezone (UTC-12 ends 2100 at 2101-01-01T12:00Z).
export const MAX_SHARE_EXPIRY_MS = Date.UTC(2101, 0, 1, 12, 0, 0, 0);

export const SHARE_SECURITY_WINDOW_MS = 365 * 24 * 60 * 60_000;

export type ShareExpiryProblem = 'past' | 'tooFar';

/** Why a requested expiry is unusable, or null when the date is allowed. */
export function shareExpiryProblem(expiresAt: number, now: number = Date.now()): ShareExpiryProblem | null {
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return 'past';
    if (expiresAt >= MAX_SHARE_EXPIRY_MS) return 'tooFar';
    return null;
}

/** True when the link will outlive the window where sharing security is guaranteed. */
export function isLongLivedShare(expiresAt: number, now: number = Date.now()): boolean {
    return Number.isFinite(expiresAt) && expiresAt > now + SHARE_SECURITY_WINDOW_MS;
}
