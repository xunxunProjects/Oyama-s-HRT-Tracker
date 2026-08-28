import { Syringe, Pill, Droplet, Sticker, X, FlaskConical, Atom, Shield, Hexagon, Orbit, Dna, Shell } from 'lucide-react';
import { Route, DoseEvent, Ester, getBioavailabilityMultiplier, getToE2Factor, ExtraKey } from '../../logic';
import { Lang } from '../i18n/translations';

export const LOCALE_MAP: Record<Lang, string> = {
    'zh': 'zh-CN',
    'zh-TW': 'zh-TW',
    'yue': 'zh-HK',
    'en': 'en-US',
    'ja': 'ja-JP',
    'ko': 'ko-KR',
    'tr': 'tr-TR',
};

export const formatDate = (date: Date, lang: Lang, timeZone?: string) => {
    return date.toLocaleDateString(LOCALE_MAP[lang] || 'en-US', { month: 'short', day: 'numeric', timeZone });
};

/**
 * "3h ago", in the reader's language.
 *
 * Three pages grew their own copy of this and two of them hardcoded English,
 * so a translated label ended up sitting next to an untranslated time on the
 * same line. `nowSec` is passed in rather than read here so a list of rows all
 * measure against one instant.
 */
export const formatRelative = (unixSec: number, nowSec: number, t: (k: string) => string): string => {
    const diff = Math.max(0, nowSec - unixSec);
    if (diff < 60) return t('time.just_now');
    if (diff < 3600) return t('time.minutes').replace('{n}', String(Math.floor(diff / 60)));
    if (diff < 86400) return t('time.hours').replace('{n}', String(Math.floor(diff / 3600)));
    return t('time.days').replace('{n}', String(Math.floor(diff / 86400)));
};

// No locale: `hour12: false` with two-digit fields renders "14:05" identically
// in all seven of the app's locales, so threading `lang` through here would
// change three call sites and no pixels.
export const formatTime = (date: Date, timeZone?: string) => {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone });
};

const iconMuted = "w-5 h-5 text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]";

export const getRouteIcon = (route: Route) => {
    switch (route) {
        case Route.injection: return <Syringe className={iconMuted} />;
        case Route.oral: return <Pill className={iconMuted} />;
        case Route.sublingual: return <Pill className={iconMuted} />;
        case Route.gel: return <Droplet className={iconMuted} />;
        case Route.patchApply: return <Sticker className={iconMuted} />;
        case Route.patchRemove: return <X className={iconMuted} />;
    }
};

export const getEsterIcon = (ester: Ester) => {
    switch (ester) {
        case Ester.E2: return <Atom className={iconMuted} />;
        case Ester.CPA: return <Shield className={iconMuted} />;
        case Ester.EV: return <Shell className={iconMuted} />;
        case Ester.EB: return <Hexagon className={iconMuted} />;
        case Ester.EC: return <Orbit className={iconMuted} />;
        case Ester.EN: return <Dna className={iconMuted} />;
        case Ester.EU: return <FlaskConical className={iconMuted} />;
        default: return <FlaskConical className={iconMuted} />;
    }
};

export const getBioDoseMG = (event: DoseEvent) => {
    const multiplier = getBioavailabilityMultiplier(event.route, event.ester, event.extras || {});
    return multiplier * event.doseMG;
};

export const getRawDoseMG = (event: DoseEvent) => {
    if (event.route === Route.patchRemove) return null;
    if (event.extras[ExtraKey.releaseRateUGPerDay]) return null;
    const factor = getToE2Factor(event.ester);
    if (!factor) return event.doseMG;
    return event.doseMG / factor;
};
