import { describe, expect, it } from 'vitest';
import { resolveApiOrigin, resolveApiPort } from '../e2e/apiOrigin';

describe('E2E API origin', () => {
    it('derives the origin from E2E_API_PORT', () => {
        expect(resolveApiOrigin({ E2E_API_PORT: '8788' })).toBe('http://127.0.0.1:8788');
    });

    it('defaults to port 8787', () => {
        expect(resolveApiPort({})).toBe('8787');
        expect(resolveApiOrigin({})).toBe('http://127.0.0.1:8787');
    });
});
