import { describe, expect, it } from 'vitest';
import { SHARE_KEY_INVALID, ShareApiError, isTerminalLiveShareError } from '../src/services/sharing';

describe('live share polling errors', () => {
    it('stops on an expired link', () => {
        expect(isTerminalLiveShareError(new ShareApiError(410, 'SHARE_EXPIRED', 'expired'))).toBe(true);
    });

    it('stops on a deleted link', () => {
        expect(isTerminalLiveShareError(new ShareApiError(404, 'SHARE_NOT_FOUND', 'missing'))).toBe(true);
    });

    it('stops when the link key no longer opens the snapshot', () => {
        expect(isTerminalLiveShareError(new ShareApiError(400, SHARE_KEY_INVALID, 'wrong key'))).toBe(true);
    });

    it('keeps polling through rate limits and transient failures', () => {
        expect(isTerminalLiveShareError(new ShareApiError(429, 'RATE_LIMITED', 'slow down'))).toBe(false);
        expect(isTerminalLiveShareError(new ShareApiError(500, 'INTERNAL', 'oops'))).toBe(false);
        expect(isTerminalLiveShareError(new Error('network'))).toBe(false);
        expect(isTerminalLiveShareError(null)).toBe(false);
    });
});
