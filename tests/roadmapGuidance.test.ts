import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('historical roadmap guidance', () => {
    it('does not tell agents to bypass CI or cite stale phase status as current', () => {
        const plan = readFileSync(new URL('../docs/todo/plan.md', import.meta.url), 'utf8');
        expect(plan).not.toMatch(/without waiting for CI/i);
        expect(plan).not.toMatch(/gh pr merge --admin/i);
        expect(plan).toMatch(/historical/i);
        expect(plan).toMatch(/docs\/AI-GUIDE\.md/);
    });
});
