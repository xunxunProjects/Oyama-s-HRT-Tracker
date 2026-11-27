import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const literature = read('tests/literature.test.ts');
const audit = read('docs/superpowers/2026-11-27-1.6-rc1-audit.md');
const expectedFailures = literature.match(/it\.fails\(/g) ?? [];
const gaps = [...literature.matchAll(/TRACKED GAP (F11-\d+) \((important|minor)\)/g)].map(match => ({
    id: match[1],
    severity: match[2],
    offset: match.index,
}));

describe('expected-failure literature gaps', () => {
    it('annotates every it.fails with a tracked gap ID and severity', () => {
        expect(expectedFailures.length).toBeGreaterThan(0);
        expect(gaps.length).toBe(expectedFailures.length);
        expect(new Set(gaps.map(gap => gap.id)).size).toBe(gaps.length);
        for (const gap of gaps) {
            expect(gap.severity).toBe('important');
            expect(literature.slice(gap.offset, gap.offset + 1200)).toContain('it.fails(');
        }
    });

    it('lists every tracked gap in the audit with its severity', () => {
        for (const gap of gaps) {
            expect(audit).toContain(gap.id);
            expect(audit).toMatch(new RegExp(`${gap.id}[^\\n]*important`));
        }
    });
});
