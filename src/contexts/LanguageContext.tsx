import React, { createContext, useContext, useState, useEffect } from 'react';
import { TRANSLATIONS, Lang } from '../i18n/translations';

const LanguageContext = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: string) => string } | null>(null);

export const useTranslation = () => {
    const ctx = useContext(LanguageContext);
    if (!ctx) throw new Error("useTranslation must be used within LanguageProvider");
    return ctx;
};

const RTL_LANGS: ReadonlySet<Lang> = new Set<Lang>();

const LANG_LOCALE: Record<Lang, string> = {
    'zh': 'zh-CN',
    'zh-TW': 'zh-TW',
    'yue': 'zh-HK',
    'en': 'en',
    'ja': 'ja',
    'ko': 'ko',
    'tr': 'tr',
};

/**
 * Where a key falls through to when its own pack hasn't got it.
 *
 * The old chain was zh then en for everyone, which put Simplified Chinese in
 * front of a Turkish or Korean reader — a script they may not read at all —
 * ahead of English, which most of them can at least muddle through. So the
 * script the reader is likeliest to recognise goes first: the Chinese packs
 * fall back among themselves, and everyone else takes English before Chinese.
 *
 * zh and en still point at each other last, because between them they carry
 * every key in the app, so nothing can fall all the way through to a raw
 * dotted key.
 */
const FALLBACK: Record<Lang, readonly Lang[]> = {
    'zh': ['en'],
    'zh-TW': ['zh', 'en'],
    'yue': ['zh-TW', 'zh', 'en'],
    'en': ['zh'],
    'ja': ['en', 'zh'],
    'ko': ['en', 'zh'],
    'tr': ['en', 'zh'],
};

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
    const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('hrt-lang') as Lang) || 'zh');

    useEffect(() => {
        localStorage.setItem('hrt-lang', lang);
        document.title = (lang.startsWith('zh') || lang === 'yue') ? "HRT 记录" : "HRT Tracker";
        document.documentElement.lang = LANG_LOCALE[lang] ?? lang;
        document.documentElement.dir = RTL_LANGS.has(lang) ? 'rtl' : 'ltr';
    }, [lang]);

    const t = (key: string) => {
        const packs = (TRANSLATIONS as Record<string, Record<string, string>>);
        const own = packs[lang]?.[key];
        if (own !== undefined) return own;
        for (const alt of FALLBACK[lang] ?? FALLBACK.zh) {
            const value = packs[alt]?.[key];
            if (value !== undefined) return value;
        }
        return key;
    };

    return (
        <LanguageContext.Provider value={{ lang, setLang, t }}>
            {children}
        </LanguageContext.Provider>
    );
};
