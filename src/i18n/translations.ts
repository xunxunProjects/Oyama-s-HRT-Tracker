/**
 * Every interface string, one module per language under `locales/`.
 *
 * `TRANSLATIONS_BASE` holds the two packs that between them carry every key;
 * `TRANSLATIONS` adds the rest, with `yue` and `tr` building on `zh-TW` and
 * `en`. `LanguageContext` owns the fallback order at lookup time.
 */
import { EN, EN_BASE } from './locales/en';
import { JA } from './locales/ja';
import { KO } from './locales/ko';
import { RU } from './locales/ru';
import { TR } from './locales/tr';
import { UK } from './locales/uk';
import { YUE } from './locales/yue';
import { ZH } from './locales/zh';
import { ZH_TW } from './locales/zh-TW';
import { JOURNAL_STRINGS as J } from './locales/journal';

export type Lang = 'zh' | 'zh-TW' | 'yue' | 'en' | 'ja' | 'ko' | 'tr' | 'ru' | 'uk';

export const TRANSLATIONS_BASE = {
    zh: { ...ZH, ...J.zh },
    en: { ...EN_BASE, ...J.en },
} as const;

// Each pack with the Oyama Journal layout's words laid over it (locales/journal.ts).
export const TRANSLATIONS = {
    zh: TRANSLATIONS_BASE.zh,
    'zh-TW': { ...ZH_TW, ...J['zh-TW'] },
    yue: { ...YUE, ...J.yue },
    en: { ...EN, ...J.en },
    ja: { ...JA, ...J.ja },
    ko: { ...KO, ...J.ko },
    tr: { ...TR, ...J.tr },
    ru: { ...RU, ...J.ru },
    uk: { ...UK, ...J.uk },
} as const;
