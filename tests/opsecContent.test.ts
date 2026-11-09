import { describe, expect, it } from 'vitest';
import katex from 'katex';
import { getOpSecContent, type OpSecBlock } from '../src/content/opsec';

const LANGS = ['zh', 'zh-TW', 'en', 'ja'] as const;

describe('OpSec extended content', () => {
    it.each(LANGS)('%s has extended sections with renderable math', lang => {
        const content = getOpSecContent(lang);
        expect(content.extendedHeading.length).toBeGreaterThan(0);
        expect(content.extendedNote.length).toBeGreaterThan(0);

        const extended = content.sections.filter(section => section.level === 'extended');
        expect(extended.length).toBeGreaterThan(0);

        const mathBlocks = extended
            .flatMap(section => section.blocks)
            .filter((block): block is Extract<OpSecBlock, { type: 'math' }> => block.type === 'math');

        expect(mathBlocks.length).toBeGreaterThan(0);
        for (const block of mathBlocks) {
            expect(block.text.length).toBeGreaterThan(0);
            expect(() =>
                katex.renderToString(block.text, {
                    displayMode: true,
                    throwOnError: true,
                    strict: 'ignore',
                }),
            ).not.toThrow();
        }
    });

    it.each(['zh', 'zh-TW', 'en'] as const)('%s has non-empty Mermaid sources for the IRC pilot', lang => {
        const content = getOpSecContent(lang);
        const diagrams = content.sections
            .flatMap(section => section.blocks)
            .filter((block): block is Extract<OpSecBlock, { type: 'mermaid' }> => block.type === 'mermaid');

        expect(diagrams.length).toBeGreaterThanOrEqual(2);
        for (const block of diagrams) {
            expect(block.code.trim().length).toBeGreaterThan(0);
            expect(block.code).toContain('flowchart');
        }
    });

    it('keeps section ids unique and ordered by reading level', () => {
        const content = getOpSecContent('zh');
        const ids = content.sections.map(section => section.id);
        expect(new Set(ids).size).toBe(ids.length);

        const levels = content.sections.map(section => section.level);
        expect(levels.lastIndexOf('basic')).toBeLessThan(levels.indexOf('advanced'));
        expect(levels.lastIndexOf('advanced')).toBeLessThan(levels.indexOf('extended'));
    });
});
