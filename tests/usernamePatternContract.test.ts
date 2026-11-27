import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PATTERN = '[a-zA-Z0-9_-]{3,30}';

describe('shared username validation pattern', () => {
    const client = readFileSync(new URL('../src/utils/username.ts', import.meta.url), 'utf8');
    const server = readFileSync(new URL('../src/server/validation.ts', import.meta.url), 'utf8');

    it('imports one pattern from the shared module instead of duplicating the regex', () => {
        expect(server).toMatch(/from '\.\.\/utils\/username'/);
        expect(server).not.toContain(PATTERN);
        expect(client).toContain(PATTERN);
    });

    it('does not claim the regex lives in worker.ts', () => {
        expect(client).not.toContain('Mirrors USERNAME_REGEX in worker.ts');
    });
});
