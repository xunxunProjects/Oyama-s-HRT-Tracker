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

    it('marks the current stage as rc5.5 while feature work is still pending', () => {
        for (const path of [
            'package.json',
            'package-lock.json',
            'src-tauri/tauri.conf.json',
            'src-tauri/Cargo.toml',
            'src-tauri/Cargo.lock',
            'docs/AI-GUIDE.md',
            'wiki/AI-Contributors.md',
            'CHANGELOG.md',
        ]) {
            expect(read(path), path).toContain('1.6.0-rc.5.5');
        }
        expect(read('docs/AI-GUIDE.md')).toMatch(/current stage rc5\.5/i);
        expect(read('wiki/AI-Contributors.md')).toMatch(/current stage rc5\.5/i);
        expect(read('docs/superpowers/2026-11-27-1.6-rc1-audit.md')).toMatch(/current stage rc5\.5/i);
        expect(read('docs/superpowers/2026-11-27-1.6-rc1-audit.md')).toMatch(/rc10 final review deferred/i);
    });
});
