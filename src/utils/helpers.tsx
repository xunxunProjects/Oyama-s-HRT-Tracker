import React from 'react';
import { Syringe, Pill, Droplet, Sticker, X, FlaskConical, Atom, Shield, Hexagon, Orbit, Dna, Shell, Triangle, Pentagon, Gem, Activity } from 'lucide-react';
import { Route, DoseEvent, Ester, getBioavailabilityMultiplier, getToE2Factor, ExtraKey } from '../../logic';
import { Lang } from '../i18n/translations';

export const formatDate = (date: Date, lang: Lang) => {
    const localeMap: Record<Lang, string> = {
        'zh': 'zh-CN',
        'zh-TW': 'zh-TW',
        'yue': 'zh-HK',
        'en': 'en-US',
        'ja': 'ja-JP',
        'ko': 'ko-KR',
        'tr': 'tr-TR',
    };
    return date.toLocaleDateString(localeMap[lang] || 'en-US', { month: 'short', day: 'numeric' });
};

export const formatTime = (date: Date) => {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
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
        case Ester.E2: return <Atom className="w-5 h-5 text-zinc-400" />;
        case Ester.CPA: return <Shield className="w-5 h-5 text-zinc-400" />;
        case Ester.EV: return <Shell className="w-5 h-5 text-zinc-400" />;
        case Ester.EB: return <Hexagon className="w-5 h-5 text-zinc-400" />;
        case Ester.EC: return <Orbit className="w-5 h-5 text-zinc-400" />;
        case Ester.EN: return <Dna className="w-5 h-5 text-zinc-400" />;
        case Ester.EU: return <FlaskConical className="w-5 h-5 text-zinc-400" />;
        default: return <FlaskConical className="w-5 h-5 text-zinc-400" />;
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
