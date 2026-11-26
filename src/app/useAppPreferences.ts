import { useEffect, useMemo, useState } from 'react';
import type { AppTheme } from '../constants';
import type { Lang } from '../i18n/translations';
import type { PortablePreferences } from '../utils/backupBundle';

/**
 * Display and sync preferences owned by the app shell. They are all local
 * settings, so they read and write localStorage directly instead of travelling
 * through the data layer.
 */
export const useAppPreferences = (setLang: (lang: Lang) => void) => {
    // --- Prediction curve: the Overview chart carried on past "now", dashed,
    // on the plan's doses. Off unless switched on in Settings; a display
    // preference, so it stays on the device. ---
    const [showPrediction, setShowPrediction] = useState<boolean>(
        () => localStorage.getItem('app-show-prediction') === 'true',
    );
    useEffect(() => {
        localStorage.setItem('app-show-prediction', String(showPrediction));
    }, [showPrediction]);

    // How far ahead a supply counts as running low. A preference, so it stays on the device.
    const [supplyLeadDays, setSupplyLeadDaysState] = useState(
        () => Number(localStorage.getItem('hrt-supply-lead-days')) || 14,
    );
    const setSupplyLeadDays = (days: number) => {
        setSupplyLeadDaysState(days);
        localStorage.setItem('hrt-supply-lead-days', String(days));
    };

    // --- Auto-sync preference ---
    // Storage key kept from when this only ever uploaded, so an existing
    // preference carries over rather than silently resetting to on.
    const [autoSync, setAutoSync] = useState<boolean>(() => localStorage.getItem('app-auto-backup') !== 'false');
    useEffect(() => {
        localStorage.setItem('app-auto-backup', String(autoSync));
    }, [autoSync]);

    // --- Developer mode (unlocks the milk tea easter egg) ---
    const [devMode, setDevMode] = useState<boolean>(() => localStorage.getItem('app-dev-mode') === 'true');
    useEffect(() => {
        localStorage.setItem('app-dev-mode', String(devMode));
    }, [devMode]);

    // --- Site label: the host name strip above the mobile view. Switched off
    // from Settings while developer mode is on, and kept off after that. ---
    const [hideSiteLabel, setHideSiteLabel] = useState<boolean>(
        () => localStorage.getItem('app-hide-site-label') === 'true',
    );
    useEffect(() => {
        localStorage.setItem('app-hide-site-label', String(hideSiteLabel));
    }, [hideSiteLabel]);

    const [theme, setTheme] = useState<AppTheme>(() => {
        const saved = localStorage.getItem('app-theme');
        return (saved as AppTheme) || 'system';
    });

    // --- Theme Effect ---
    useEffect(() => {
        localStorage.setItem('app-theme', theme);
        const root = window.document.documentElement;

        const applyTheme = (isDark: boolean) => {
            root.classList.remove('light', 'dark');
            root.classList.add(isDark ? 'dark' : 'light');
            // The browser's own bar takes this colour: Android's status bar
            // and toolbar, an installed app's title bar. index.html's white is
            // right until the theme is applied (and for the shared view,
            // which applies none), but it stayed white over a dark page.
            // --bg of each theme, as hex because not every browser reads
            // oklch() in this tag.
            document
                .querySelectorAll('meta[name="theme-color"]')
                .forEach(meta => meta.setAttribute('content', isDark ? '#181714' : '#ffffff'));
        };

        // Mono renders as light with a grayscale filter (see html.mono in index.css)
        root.classList.toggle('mono', theme === 'mono');

        if (theme === 'system') {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            applyTheme(mediaQuery.matches);
            const handleChange = (e: MediaQueryListEvent) => applyTheme(e.matches);
            mediaQuery.addEventListener('change', handleChange);
            return () => mediaQuery.removeEventListener('change', handleChange);
        } else {
            applyTheme(theme === 'dark');
        }
    }, [theme]);

    // Imported complete bundles carry only the confirmed preference keys. The
    // data layer returns them; the app owns the React state and storage effects.
    const applyPortablePreferences = (prefs: PortablePreferences) => {
        if (prefs['app-theme'] !== undefined) setTheme(prefs['app-theme']);
        if (prefs['hrt-lang'] !== undefined) setLang(prefs['hrt-lang']);
        if (prefs['app-show-prediction'] !== undefined) setShowPrediction(prefs['app-show-prediction']);
        if (prefs['app-hide-site-label'] !== undefined) setHideSiteLabel(prefs['app-hide-site-label']);
        if (prefs['hrt-supply-lead-days'] !== undefined) setSupplyLeadDays(prefs['hrt-supply-lead-days']);
    };

    // Same reading as the Overview's: an explicit dark theme, or the system's under "system".
    const isDarkMode =
        theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    const languageOptions = useMemo(
        () => [
            { value: 'zh', label: '简体中文' },
            { value: 'zh-TW', label: '正體中文' },
            { value: 'yue', label: '廣東話' },
            { value: 'en', label: 'English' },
            { value: 'ja', label: '日本語' },
            { value: 'ko', label: '한국어' },
            { value: 'tr', label: 'Türkçe' },
            { value: 'ru', label: 'Русский' },
            { value: 'uk', label: 'Українська' },
        ],
        [],
    );

    return {
        showPrediction,
        setShowPrediction,
        supplyLeadDays,
        setSupplyLeadDays,
        autoSync,
        setAutoSync,
        devMode,
        setDevMode,
        hideSiteLabel,
        setHideSiteLabel,
        theme,
        setTheme,
        isDarkMode,
        languageOptions,
        applyPortablePreferences,
    };
};
