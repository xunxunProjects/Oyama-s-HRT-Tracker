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

export type Lang = 'zh' | 'zh-TW' | 'yue' | 'en' | 'ja' | 'ko' | 'tr' | 'ru' | 'uk';

export const TRANSLATIONS_BASE = {
    zh: ZH,
    en: EN_BASE,
} as const;

export const TRANSLATIONS = {
    zh: TRANSLATIONS_BASE.zh,
    'zh-TW': ZH_TW,
    yue: YUE,
    en: EN,
    ja: JA,
    ko: KO,
    tr: TR,
    ru: RU,
    uk: UK,
} as const;
