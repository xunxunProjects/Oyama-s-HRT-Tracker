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

describe('age model copy', () => {
    const locales = ['en', 'zh', 'zh-TW', 'yue', 'ja', 'ko', 'tr', 'ru', 'uk'] as const;

    for (const lang of locales) {
        it(`${lang} has age band and warning copy`, () => {
            const pack = TRANSLATIONS[lang] as Record<string, string>;
            expect(pack['age.band']).toContain('{range}');
            expect(pack['age.warning.minor']).toBeTruthy();
            expect(pack['age.warning.prepubertal']).toBeTruthy();
            if (lang === 'en') {
                expect(pack['age.warning.prepubertal']).toContain('not a dosing recommendation');
            }
            expect(pack['age.warning.extrapolated']).toBeTruthy();
            expect(pack['age.explain']).toContain('{ref}');
        });
    }
});

describe('safety reminder copy', () => {
    const locales = ['en', 'zh', 'zh-TW', 'yue', 'ja', 'ko', 'tr', 'ru', 'uk'] as const;
    const keys = [
        'settings.section.safety',
        'settings.safety_reminder',
        'settings.safety_reminder_desc',
        'safety.modal.title_extreme',
        'safety.modal.title_cumulative',
        'safety.modal.body',
        'safety.modal.disable_hint',
        'safety.modal.close',
        'safety.notice.critical',
        'safety.notice.high',
        'safety.notice.notice',
        'safety.notice.settings',
    ] as const;

    for (const lang of locales) {
        it(`${lang} has every safety reminder key`, () => {
            const pack = TRANSLATIONS[lang] as Record<string, string>;
            for (const key of keys) {
                expect(Object.prototype.hasOwnProperty.call(pack, key), `${lang} missing ${key}`).toBe(true);
                expect(pack[key]).toBeTruthy();
            }
        });
    }
});

describe('hydration beta copy', () => {
    const locales = ['en', 'zh', 'zh-TW', 'yue', 'ja', 'ko', 'tr', 'ru', 'uk'] as const;
    const keys = [
        'settings.section.physiology',
        'settings.physiology_beta',
        'settings.physiology_beta_desc',
        'settings.hydration',
        'hydration.title',
        'hydration.subtitle',
        'hydration.weight',
        'hydration.body_fat',
        'hydration.alpha',
        'hydration.alpha_desc',
        'hydration.add_cup',
        'hydration.cups',
        'hydration.remove',
        'hydration.urine_color',
        'hydration.urine_level',
        'hydration.note',
        'hydration.empty',
        'chart.hydration_adjusted',
        'chart.hydration_delta',
    ] as const;

    for (const lang of locales) {
        it(`${lang} has every hydration key`, () => {
            const pack = TRANSLATIONS[lang] as Record<string, string>;
            for (const key of keys) {
                expect(Object.prototype.hasOwnProperty.call(pack, key), `${lang} missing ${key}`).toBe(true);
                expect(pack[key]).toBeTruthy();
            }
        });
    }

    it('keeps the cup and level placeholders', () => {
        for (const lang of locales) {
            const pack = TRANSLATIONS[lang] as Record<string, string>;
            expect(pack['hydration.cups']).toContain('{n}');
            expect(pack['hydration.urine_level']).toContain('{level}');
        }
    });
});

describe('Russian and Ukrainian', () => {
    const en = TRANSLATIONS.en as Record<string, string>;
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

    for (const lang of ['ru', 'uk'] as const) {
        const pack = TRANSLATIONS[lang] as Record<string, string>;

        it(`${lang} has every English key and no others`, () => {
            expect(Object.keys(en).filter(k => !(k in pack))).toEqual([]);
            expect(Object.keys(pack).filter(k => !(k in en))).toEqual([]);
        });

        it(`${lang} keeps each string's placeholders`, () => {
            const off = Object.keys(en).filter(k => placeholders(en[k]).join() !== placeholders(pack[k] ?? '').join());
            expect(off).toEqual([]);
        });
    }
});
