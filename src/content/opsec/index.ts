import type { OpSecContent, OpSecLang } from './types';

export type { OpSecBlock, OpSecCalloutKind, OpSecContent, OpSecLang, OpSecSection } from './types';

/** Each language is its own chunk, so the guide's text (well over 100 kB a
 *  language) is fetched only when someone opens it, and only in the language
 *  they read. Cantonese readers get the Traditional Chinese text. */
const LOADERS: Record<OpSecLang, () => Promise<{ default: OpSecContent }>> = {
    zh: () => import('./zh'),
    'zh-TW': () => import('./zh-TW'),
    yue: () => import('./zh-TW'),
    en: () => import('./en'),
    ja: () => import('./ja'),
    ko: () => import('./ko'),
    tr: () => import('./tr'),
    ru: () => import('./ru'),
    uk: () => import('./uk'),
};

const loaded = new Map<string, OpSecContent>();

const keyFor = (lang: string): OpSecLang => (lang in LOADERS ? (lang as OpSecLang) : 'en');

/** The guide in this language if it has already been fetched. */
export function peekOpSecContent(lang: string): OpSecContent | null {
    return loaded.get(keyFor(lang)) ?? null;
}

export async function loadOpSecContent(lang: string): Promise<OpSecContent> {
    const key = keyFor(lang);
    const cached = loaded.get(key);
    if (cached) return cached;
    const content = (await LOADERS[key]()).default;
    loaded.set(key, content);
    return content;
}
