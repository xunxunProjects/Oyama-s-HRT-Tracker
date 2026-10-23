import { describe, expect, it } from 'vitest';
import {
    MAX_SHARE_EXPIRY_MS,
    MAX_SHARE_EXPIRY_YEAR,
    SHARE_SECURITY_WINDOW_MS,
    isLongLivedShare,
    shareExpiryProblem,
} from '../shareExpiry';

const NOW = new Date('2026-10-23T17:03:00+08:00').getTime();
const DAY_MS = 24 * 60 * 60_000;

describe('share expiry policy', () => {
    it('accepts a date inside the 365-day security window', () => {
        const expiresAt = NOW + 7 * DAY_MS;
        expect(shareExpiryProblem(expiresAt, NOW)).toBeNull();
        expect(isLongLivedShare(expiresAt, NOW)).toBe(false);
    });

    it('accepts exactly 365 days ahead without a long-lived warning', () => {
        const expiresAt = NOW + SHARE_SECURITY_WINDOW_MS;
        expect(shareExpiryProblem(expiresAt, NOW)).toBeNull();
        expect(isLongLivedShare(expiresAt, NOW)).toBe(false);
    });

    it('accepts dates past the security window but warns about them', () => {
        const expiresAt = NOW + SHARE_SECURITY_WINDOW_MS + 1;
        expect(shareExpiryProblem(expiresAt, NOW)).toBeNull();
        expect(isLongLivedShare(expiresAt, NOW)).toBe(true);
    });

    it('accepts the date from the bug report, now with a long-lived warning', () => {
        const december2030 = new Date('2030-12-30T17:02:00+08:00').getTime();
        expect(shareExpiryProblem(december2030, NOW)).toBeNull();
        expect(isLongLivedShare(december2030, NOW)).toBe(true);
    });

    it('accepts the last instant before the end-of-2100 bound', () => {
        expect(shareExpiryProblem(MAX_SHARE_EXPIRY_MS - 1, NOW)).toBeNull();
    });

    it('rejects the end-of-2100 bound itself', () => {
        expect(shareExpiryProblem(MAX_SHARE_EXPIRY_MS, NOW)).toBe('tooFar');
    });

    it('reports a past date separately', () => {
        expect(shareExpiryProblem(NOW - 1, NOW)).toBe('past');
        expect(isLongLivedShare(NOW - 1, NOW)).toBe(false);
    });

    it('treats an unparseable date as a past date', () => {
        expect(shareExpiryProblem(Number.NaN, NOW)).toBe('past');
        expect(isLongLivedShare(Number.NaN, NOW)).toBe(false);
    });

    it('caps the year picker at 2100', () => {
        expect(MAX_SHARE_EXPIRY_YEAR).toBe(2100);
    });
});
