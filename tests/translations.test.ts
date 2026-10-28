import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TRANSLATIONS } from '../src/i18n/translations';

// A language pack may start from another one with a spread, but a spread
// further down overwrites every key written above it. That is how the Turkish
// strings added in 1.5.1, the F2F how-to among them, reached readers in English.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(root, 'src/i18n/translations.ts'), 'utf8').split('\n');

describe('language packs', () => {
    it('spread a base pack only before their own strings', () => {
        const late = source.flatMap((line, i) => {
            if (!/^\s*\.\.\./.test(line)) return [];
            let before = i - 1;
            while (before >= 0 && source[before].trim() === '') before--;
            return source[before].trimEnd().endsWith('{') ? [] : [`line ${i + 1}: ${line.trim()}`];
        });
        expect(late).toEqual([]);
    });

    it('keep the Turkish strings written for the F2F how-to', () => {
        const tr = TRANSLATIONS.tr as Record<string, string>;
        const en = TRANSLATIONS.en as Record<string, string>;
        expect(tr['f2f.guide']).toBe('Nasıl kullanılır');
        for (const key of ['f2f.step_export_desc', 'f2f.step_import_hint', 'f2f.step_encrypt_hint']) {
            expect(tr[key]).not.toBe(en[key]);
        }
    });
});
