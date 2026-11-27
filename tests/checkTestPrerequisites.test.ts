import { describe, expect, it } from 'vitest';
import { verifyTestPrerequisites } from '../scripts/checkTestPrerequisites.mjs';

describe('CI test prerequisites', () => {
    it('reports missing SQLite and OpenSSL so security suites cannot skip silently', async () => {
        const missing = await verifyTestPrerequisites({
            importModule: async () => {
                throw new Error('node:sqlite is unavailable');
            },
            runCommand: () => {
                throw new Error('openssl not found');
            },
        });

        expect(missing).toEqual(['node:sqlite', 'openssl']);
    });

    it('accepts an environment where both prerequisites are available', async () => {
        const missing = await verifyTestPrerequisites({
            importModule: async () => ({}),
            runCommand: () => Buffer.from('OpenSSL 3'),
        });

        expect(missing).toEqual([]);
    });
});
