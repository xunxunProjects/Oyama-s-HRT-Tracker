import { describe, expect, it } from 'vitest';
import katex from 'katex';
import { loadOpSecContent, type OpSecBlock, type OpSecContent } from '../src/content/opsec';

const LANGS = ['zh', 'zh-TW', 'yue', 'en', 'ja', 'ko', 'tr', 'ru', 'uk'] as const;

/** Everything about a block except its words: the same guide in every
 *  language has the same sections, blocks, callout kinds, list lengths and
 *  formulas. */
const shape = (content: OpSecContent) =>
    content.sections.map(section => ({
        id: section.id,
        level: section.level,
        blocks: section.blocks.map((block: OpSecBlock) => {
            switch (block.type) {
                case 'ul':
                case 'ol':
                    return `${block.type}:${block.items.length}`;
                case 'warn':
                    return `warn:${block.kind ?? 'warning'}`;
                case 'callout':
                    return `callout:${block.kind}`;
                case 'math':
                    return `math:${block.text}:${block.caption ? 'caption' : ''}`;
                case 'mermaid':
                    return `mermaid:${block.caption ? 'caption' : ''}`;
                default:
                    return block.type;
            }
        }),
    }));

const strings = (content: OpSecContent): string[] => [
    content.title,
    content.contentsLabel,
    content.disclaimerTitle,
    ...content.disclaimer,
    content.intro,
    content.basicHeading,
    content.advancedHeading,
    content.advancedNote,
    content.extendedHeading,
    content.extendedNote,
    ...content.sections.flatMap(section => [
        section.title,
        ...section.blocks.flatMap(block => {
            if (block.type === 'ul' || block.type === 'ol') return block.items;
            if (block.type === 'math') return block.caption ? [block.caption] : [];
            if (block.type === 'mermaid') return block.caption ? [block.code, block.caption] : [block.code];
            return [block.text];
        }),
    ]),
];

describe('OpSec guide', () => {
    it.each(LANGS)('%s has extended sections with renderable math', async lang => {
        const content = await loadOpSecContent(lang);
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

    it.each(LANGS)('%s matches the English guide block for block', async lang => {
        const [content, en] = await Promise.all([loadOpSecContent(lang), loadOpSecContent('en')]);
        expect(shape(content)).toEqual(shape(en));
    });

    it.each(LANGS)('%s is fully written in its own language, with no dashes or arrows', async lang => {
        const content = await loadOpSecContent(lang);
        for (const text of strings(content)) {
            expect(text.trim().length).toBeGreaterThan(0);
            expect(text).not.toMatch(/—|→/);
        }
        if (lang !== 'en') {
            const en = new Set(strings(await loadOpSecContent('en')));
            const copied = strings(content).filter(text => en.has(text) && /[a-z]{4,} [a-z]{4,}/.test(text));
            expect(copied).toEqual([]);
        }
    });

    it.each(LANGS)('%s has non-empty Mermaid diagrams', async lang => {
        const content = await loadOpSecContent(lang);
        const diagrams = content.sections
            .flatMap(section => section.blocks)
            .filter((block): block is Extract<OpSecBlock, { type: 'mermaid' }> => block.type === 'mermaid');

        expect(diagrams.length).toBeGreaterThan(0);
        for (const block of diagrams) {
            expect(block.code.trim().length).toBeGreaterThan(0);
            expect(block.code).toContain('flowchart');
            if (block.caption) expect(block.caption.trim().length).toBeGreaterThan(0);
        }
    });

    it('keeps section ids unique and ordered by reading level', async () => {
        const content = await loadOpSecContent('zh');
        const ids = content.sections.map(section => section.id);
        expect(new Set(ids).size).toBe(ids.length);

        const levels = content.sections.map(section => section.level);
        expect(levels.lastIndexOf('basic')).toBeLessThan(levels.indexOf('advanced'));
        expect(levels.lastIndexOf('advanced')).toBeLessThan(levels.indexOf('extended'));
    });
});
