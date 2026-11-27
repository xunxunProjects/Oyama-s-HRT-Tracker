import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('maintainer-local Prettier exclusions', () => {
    const ignore = readFileSync(new URL('../.prettierignore', import.meta.url), 'utf8');

    it('excludes untracked planning directories and protected planning drafts', () => {
        expect(ignore).toMatch(/^\.planning\/$/m);
        expect(ignore).toMatch(/^\.playwright-mcp\/$/m);
        expect(ignore).toMatch(/^docs\/superpowers\/plans\/2026-11-26-hydration-beta\.md$/m);
        expect(ignore).toMatch(/^docs\/superpowers\/plans\/2026-11-26-safety-alerts\.md$/m);
        expect(ignore).toMatch(/^docs\/superpowers\/specs\/2026-11-26-physiology-beta-safety-design\.md$/m);
    });

    it('still formats tracked superpowers plans and specs', () => {
        expect(ignore).not.toMatch(/^docs\/superpowers\/plans\/$/m);
        expect(ignore).not.toMatch(/^docs\/superpowers\/specs\/$/m);
    });
});
