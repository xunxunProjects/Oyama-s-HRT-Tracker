import React from 'react';
import { Syringe, Pill, Droplet, Sticker, X } from 'lucide-react';
import { Route, DoseEvent, Ester, getBioavailabilityMultiplier, getToE2Factor, ExtraKey } from '../../logic';
import { Lang } from '../i18n/translations';

export const formatDate = (date: Date, lang: Lang) => {
    const localeMap: Record<Lang, string> = {
        'zh': 'zh-CN',
        'zh-TW': 'zh-TW',
        'yue': 'zh-HK',
        'en': 'en-US',
        'ru': 'ru-RU',
        'uk': 'uk-UA',
        'ja': 'ja-JP'
    };
    return date.toLocaleDateString(localeMap[lang] || 'en-US', { month: 'short', day: 'numeric' });
};

export const formatTime = (date: Date) => {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
};

export const getRouteIcon = (route: Route) => {
    switch (route) {
        case Route.injection: return <Syringe className="w-5 h-5 text-pink-400" />;
        case Route.oral: return <Pill className="w-5 h-5 text-blue-500" />;
        case Route.sublingual: return <Pill className="w-5 h-5 text-teal-500" />;
        case Route.gel: return <Droplet className="w-5 h-5 text-cyan-500" />;
        case Route.patchApply: return <Sticker className="w-5 h-5 text-orange-500" />;
        case Route.patchRemove: return <X className="w-5 h-5 text-gray-400" />;
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
