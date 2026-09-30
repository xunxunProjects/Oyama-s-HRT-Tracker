import React from 'react';
import { Ester, ExtraKey, Route } from '../../logic';
import { Pack, Supply, packUnitMG } from './regimen';
import { Lang } from '../i18n/translations';
import { LOCALE_MAP } from './helpers';

type T = (key: string) => string;

/** Fill `{name}` slots in a translated string. */
export const fill = (template: string, vars: Record<string, string | number>) =>
    template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

/** The same, with React nodes in the slots, so parts of one sentence can carry their own styling. */
export const fillNodes = (template: string, vars: Record<string, React.ReactNode>): React.ReactNode[] =>
    template.split(/(\{\w+\})/g).filter(Boolean).map((part, i) => {
        const m = part.match(/^\{(\w+)\}$/);
        return m && m[1] in vars ? React.createElement(React.Fragment, { key: i }, vars[m[1]]) : part;
    });

/** "5 mg", or "100 µg/天" for a patch. */
export const doseText = (r: { route: Route; doseMG: number; extras: Partial<Record<ExtraKey, number>> }, t: T) => {
    const rate = r.extras[ExtraKey.releaseRateUGPerDay];
    return r.route === Route.patchApply && rate ? `${trimNum(rate)} µg${t('regimen.per_day')}` : `${trimNum(r.doseMG)} mg`;
};

const trimNum = (n: number, maxDecimals = 2) => String(Number(n.toFixed(maxDecimals)));

/** "戊酸雌二醇": the ester's name without the code the settings lists carry ("戊酸雌二醇 (EV)"). */
export const esterName = (ester: Ester, t: T) => t(`ester.${ester}`).replace(/\s*\(.*$/, '').trim();

/** "戊酸雌二醇 5 mg 肌注", "雌二醇贴片 100 µg/天": the way a prescription line reads. */
export function regimenLabel(r: { route: Route; ester: Ester; doseMG: number; extras: Partial<Record<ExtraKey, number>> }, t: T): string {
    const route = t(`regimen.route.${r.route}`);
    const rate = r.extras[ExtraKey.releaseRateUGPerDay];
    if (r.route === Route.patchApply && rate) return `${esterName(r.ester, t)}${route} ${trimNum(rate)} µg${t('regimen.per_day')}`;
    return `${esterName(r.ester, t)} ${trimNum(r.doseMG)} mg ${route}`;
}

/** "戊酸雌二醇 肌注": a supply is a drug and a form, not a dose. */
export const supplyLabel = (s: { route: Route; ester: Ester }, t: T) => `${esterName(s.ester, t)} ${t(`regimen.route.${s.route}`)}`;

/** "每周", "每 3.5 天", "每 12 小时". */
export function intervalLabel(h: number, t: T): string {
    if (Math.abs(h - 168) < 0.5) return t('regimen.weekly');
    if (Math.abs(h - 24) < 0.5) return t('regimen.daily');
    if (h > 24 && Math.abs(h / 12 - Math.round(h / 12)) < 0.05) return fill(t('regimen.every_days'), { n: trimNum(h / 24, 1) });
    return fill(t('regimen.every_hours'), { n: trimNum(h, 1) });
}

/** "还有 4 天", "还有 5 小时", or "逾期 3 小时" once the moment has passed. Whole units only. */
export function relativeLabel(atH: number, nowH: number, t: T): string {
    const d = atH - nowH;
    const a = Math.abs(d);
    if (d >= 0) {
        if (a < 1) return fill(t('rel.in_minutes'), { n: Math.max(1, Math.round(a * 60)) });
        if (a < 24) return fill(t('rel.in_hours'), { n: Math.round(a) });
        return fill(t('rel.in_days'), { n: Math.round(a / 24) });
    }
    if (a < 24) return fill(t('rel.overdue_hours'), { n: Math.max(1, Math.round(a)) });
    return fill(t('rel.overdue_days'), { n: Math.round(a / 24) });
}

/**
 * When something is due, the way a person says it: "今天 21:00", "明天 21:00",
 * "周日 21:00" inside the week, "10月4日 周日 21:00" beyond it.
 */
export function dueLabel(atH: number, lang: Lang, withTime = true, nowH = Date.now() / 3600000): string {
    const locale = LOCALE_MAP[lang] ?? lang;
    const at = new Date(atH * 3600000);
    const now = new Date(nowH * 3600000);
    const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dayDiff = Math.round((dayStart(at) - dayStart(now)) / 86400000);
    const time = withTime ? ' ' + at.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
    const weekday = at.toLocaleDateString(locale, { weekday: 'short' });
    if (dayDiff === 0) return `${T_TODAY[lang] ?? T_TODAY.en}${time}`;
    if (dayDiff === 1) return `${T_TOMORROW[lang] ?? T_TOMORROW.en}${time}`;
    if (dayDiff > 1 && dayDiff < 7) return `${weekday}${time}`;
    // Past a year out the month alone misleads, so the year comes along.
    const date = at.toLocaleDateString(locale, Math.abs(dayDiff) > 300 ? { year: 'numeric', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' });
    return `${date} ${weekday}${time}`;
}

// Two words every language needs here and nowhere else.
const T_TODAY: Partial<Record<Lang, string>> & { en: string } = { zh: '今天', 'zh-TW': '今天', yue: '今日', en: 'Today', ja: '今日', ko: '오늘', tr: 'Bugün' };
const T_TOMORROW: Partial<Record<Lang, string>> & { en: string } = { zh: '明天', 'zh-TW': '明天', yue: '聽日', en: 'Tomorrow', ja: '明日', ko: '내일', tr: 'Yarın' };

/** The unit one item of a pack is counted in: 支, 片, 泵, 袋. */
export const packUnit = (p: Pack, t: T) => (p.kind === 'bulk' ? 'mg' : t(`supplies.unit.${p.kind}`));

/** What's left, the way it sits on the shelf: "1 支又 30 mg", "24 片", "3 片" for patches, plain mg for bulk. */
export function remainingLabel(s: Supply, remaining: number, t: T): string {
    const p = s.pack;
    if (p.kind === 'bulk') return `${trimNum(remaining)} mg`;
    if (p.kind === 'vial') {
        const perVial = packUnitMG(p);
        const whole = Math.floor(remaining / perVial + 1e-9);
        const rest = remaining - whole * perVial;
        if (rest < 0.05) return `${whole} ${packUnit(p, t)}`;
        return fill(t('supplies.vials_and_mg'), { n: whole, mg: trimNum(rest, 1) });
    }
    return `${trimNum(remaining / packUnitMG(p), 1)} ${packUnit(p, t)}`;
}
