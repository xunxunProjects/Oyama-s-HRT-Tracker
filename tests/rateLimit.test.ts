import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/server/env';
import { checkRateLimit, passwordCheckAllowed } from '../src/server/rateLimit';

const uniqueKey = (name: string) => `${name}:${Date.now()}:${Math.random()}`;

describe('checkRateLimit', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('falls back to a per-isolate limiter when the configured binding is absent', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const env = {} as Env;
        const key = uniqueKey('missing-binding');

        for (let i = 0; i < 10; i += 1) {
            expect(await checkRateLimit(env, key, 10)).toBe(true);
        }
        expect(await checkRateLimit(env, key, 10)).toBe(false);
    });

    it('denies the request when the binding throws instead of failing open', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const env = {
            RL_PER_MINUTE_10: {
                limit: async () => {
                    throw new Error('limiter unavailable');
                },
            },
        } as unknown as Env;

        expect(await checkRateLimit(env, uniqueKey('throwing-binding'), 10)).toBe(false);
    });

    it('isolates the fallback buckets of separate env instances', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const firstEnv = {} as Env;
        const secondEnv = {} as Env;
        const key = uniqueKey('isolation');

        for (let i = 0; i < 10; i += 1) {
            expect(await checkRateLimit(firstEnv, key, 10)).toBe(true);
        }
        expect(await checkRateLimit(secondEnv, key, 10)).toBe(true);
    });

    it('keeps the shared password-check bucket when no binding exists', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const env = {} as Env;
        const userId = uniqueKey('password-user');

        for (let i = 0; i < 10; i += 1) {
            expect(await passwordCheckAllowed(env, userId)).toBe(true);
        }
        expect(await passwordCheckAllowed(env, userId)).toBe(false);
    });
});
