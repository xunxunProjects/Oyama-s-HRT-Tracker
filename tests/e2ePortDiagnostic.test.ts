import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('E2E port diagnostics', () => {
    const workerScript = readFileSync(new URL('../e2e/start-worker.sh', import.meta.url), 'utf8');
    const guide = readFileSync(new URL('../wiki/AI-Contributors.md', import.meta.url), 'utf8');

    it('names the occupied port and the override in the worker preflight', () => {
        expect(workerScript).toMatch(/E2E_API_PORT/);
        expect(workerScript).toMatch(/already in use/i);
        expect(workerScript).toMatch(/\$PORT/);
    });

    it('documents the override in the contributor guide', () => {
        expect(guide).toMatch(/E2E_API_PORT=8788/);
    });
});
