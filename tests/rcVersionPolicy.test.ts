import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('RC version policy', () => {
    it('documents the manual six-field bump as the supported RC path', () => {
        expect(read('docs/AI-GUIDE.md')).toMatch(/six version fields/i);
        expect(read('docs/AI-GUIDE.md')).toContain('python3 scripts/set_version.py --check');
        expect(read('wiki/AI-Contributors.md')).toMatch(/six version fields/i);
        expect(read('wiki/AI-Contributors.md')).toMatch(/manual/i);
    });

    it('keeps rc tags outside the stable release workflow pattern', () => {
        const guide = read('docs/AI-GUIDE.md');
        expect(guide).toMatch(/v1\.6-rc1/);
        expect(guide).toMatch(/only matches .vX\.Y\.Z. tags/i);
        expect(guide).toMatch(/Do not "fix" this/i);
    });
});
