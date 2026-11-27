import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('production route logging', () => {
    const sessions = readFileSync(new URL('../src/server/routes/sessions.ts', import.meta.url), 'utf8');

    it('does not log every request on the sessions hot path', () => {
        expect(sessions).not.toContain("console.error('handleSessionsRoute called'");
    });
});
