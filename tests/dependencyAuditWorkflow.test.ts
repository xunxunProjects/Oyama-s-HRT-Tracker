import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('dependency audit report workflow', () => {
    const workflow = readFileSync(new URL('../.github/workflows/dependency-audit.yml', import.meta.url), 'utf8');

    it('is scheduled and manually runnable', () => {
        expect(workflow).toMatch(/schedule:/);
        expect(workflow).toMatch(/workflow_dispatch:/);
    });

    it('reports both Rust and npm advisories without blocking builds', () => {
        expect(workflow).toMatch(/cargo audit/);
        expect(workflow).toMatch(/npm audit/);
        expect(workflow).toMatch(/\|\| true/);
        expect(workflow).toMatch(/GITHUB_STEP_SUMMARY/);
    });
});
