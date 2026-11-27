import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('community vote error helper', () => {
    const source = readFileSync(new URL('../communityVoteServer.ts', import.meta.url), 'utf8');

    it('declares status as the first argument', () => {
        expect(source).toMatch(/const error = \(status: number, code: string, message: string\)/);
    });

    it('passes a numeric status first at every call site', () => {
        // F-17: the local helper intentionally differs from workerUtil's
        // (code, message, status) order. Every call must use the local order.
        const calls = source.match(/(?<!\.)\berror\([^)]*\)/g) ?? [];
        expect(calls.length).toBeGreaterThan(5);
        for (const call of calls) {
            expect(call).toMatch(/error\(\s*\d+/);
        }
    });
});
