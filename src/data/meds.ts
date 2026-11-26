import { Ester, GNRH_AGONISTS, Route, isUnmodelledDrug } from '../../logic';
import { PLAN_DRUGS, usualFor } from '../utils/plan';
import { drugLabel, esterName } from '../utils/regimenText';
import type { HRTMode } from '../domain/types';
import { TRANSLATIONS } from '../i18n/translations';

/*
 * The medicines this app logs, as a catalogue to look things up in: what
 * Oyama Journal's 3,000 substances are to it. Each is one compound (an ester,
 * or estradiol itself), by every route the plan offers it in the current
 * mode, filed under its kind. Nothing here is new data: the names, the
 * products sold, the routes and the usual amounts are the ones the dose form
 * and the plan already use.
 */

export type MedKind = 'estrogen' | 'antiandrogen' | 'progestogen' | 'gnrh' | 'serm' | 'androgen';

export const KIND_ORDER: readonly MedKind[] = ['estrogen', 'antiandrogen', 'progestogen', 'gnrh', 'serm', 'androgen'];

export const kindOf = (e: Ester): MedKind => {
    if (GNRH_AGONISTS.has(e)) return 'gnrh';
    switch (e) {
        case Ester.CPA:
        case Ester.SPIRO:
        case Ester.BICA:
            return 'antiandrogen';
        case Ester.MPA:
            return 'progestogen';
        case Ester.RLX:
            return 'serm';
        case Ester.T:
        case Ester.TC:
        case Ester.TE:
        case Ester.TU:
            return 'androgen';
        default:
            return 'estrogen';
    }
};

export interface Med {
    id: Ester;
    kind: MedKind;
    /** The routes the plan offers it by in this mode, in the order the dose form lists them. */
    routes: Route[];
    /** Whether the model draws a level for it. */
    modelled: boolean;
}

const ROUTE_ORDER = [Route.injection, Route.oral, Route.sublingual, Route.gel, Route.patchApply];

/** Every medicine in the mode, estrogens first, each kind in the dose form's order. */
export function medsFor(mode: HRTMode): Med[] {
    const byId = new Map<Ester, Route[]>();
    for (const route of ROUTE_ORDER) {
        for (const e of PLAN_DRUGS[mode][route] ?? []) {
            const list = byId.get(e) ?? [];
            if (!list.includes(route)) list.push(route);
            byId.set(e, list);
        }
    }
    const order = Object.values(Ester);
    return [...byId.entries()]
        .map(([id, routes]) => ({ id, kind: kindOf(id), routes, modelled: !isUnmodelledDrug(id) }))
        .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || order.indexOf(a.id) - order.indexOf(b.id));
}

/** The ones people look up most, for the search page's chips. */
export const OFTEN: Record<HRTMode, Ester[]> = {
    transfem: [Ester.EV, Ester.EC, Ester.E2, Ester.CPA, Ester.SPIRO, Ester.BICA, Ester.EB, Ester.LEUP],
    transmasc: [Ester.TC, Ester.TE, Ester.TU, Ester.T],
};

type T = (key: string) => string;

/** What it's sold as, by route, as the dose form says it ("补佳乐 Progynova、…"). */
export const productsOf = (med: Med, t: T): string[] =>
    med.routes
        .map(r => {
            const k = `products.${r}.${med.id}`;
            const v = t(k);
            return v === k ? '' : v;
        })
        .filter(Boolean);

/** A short line under the name: its kind and the ways it's taken. */
export const describeMed = (med: Med, t: T): string =>
    [t(`kind.${med.kind}.one`), med.routes.map(r => t(`regimen.route.${r}`)).join(t('list.sep'))].join(' · ');

/** The usual amount by its first route, as the plan starts it ("5 mg", "100 µg/d"). */
export const usualText = (med: Med, route: Route = med.routes[0]): string => {
    const { dose } = usualFor(route, med.id);
    return route === Route.patchApply ? `${dose} µg/d` : `${dose} mg`;
};

const norm = (s: string) =>
    s
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[\s()（）·,，、/-]+/g, ' ')
        .trim();

export interface MedHit {
    med: Med;
    /** The other name it was found by, when not its own (a product, a code). */
    via?: string;
}

/**
 * Looks a medicine up by its name in this language or in English, its code
 * (EV, CPA), what it's sold as in either, or its kind. The name's own match
 * comes first, then a product or a code, then a kind.
 */
export function searchMeds(meds: Med[], q: string, t: T): MedHit[] {
    const query = norm(q);
    if (!query) return [];
    const en = TRANSLATIONS.en as Record<string, string>;
    const tEn: T = k => en[k] ?? k;
    const scored: { hit: MedHit; score: number }[] = [];
    for (const med of meds) {
        const own = norm(drugLabel(med.id, t));
        const english = norm(drugLabel(med.id, tEn));
        const code = med.id.toLowerCase();
        let score = -1;
        let via: string | undefined;
        if (own.startsWith(query) || english.startsWith(query)) score = 0;
        else if (own.includes(query) || english.includes(query)) score = 1;
        else if (code === query) {
            score = 2;
            via = med.id;
        } else {
            const products = [...productsOf(med, t), ...productsOf(med, tEn)];
            const found = products
                .flatMap(p => p.split(/[、,，()（）]/))
                .map(p => p.trim())
                .find(p => p && norm(p).includes(query));
            if (found) {
                score = 3;
                via = found;
            } else if (norm(t(`kind.${med.kind}.many`)).includes(query) || norm(tEn(`kind.${med.kind}.many`)).includes(query)) {
                score = 4;
            }
        }
        if (score >= 0) scored.push({ hit: { med, via }, score });
    }
    return scored.sort((a, b) => a.score - b.score).map(s => s.hit);
}

/** The name without the code in brackets ("戊酸雌二醇"), for titles. */
export const medName = (id: Ester, t: T) => esterName(id, t);

// --- Looked at lately ------------------------------------------------------

const RECENT_KEY = 'hrt-recent-meds';
const RECENT_MAX = 8;

export function readRecent(): Ester[] {
    try {
        const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
        return Array.isArray(raw) ? raw.filter((x): x is Ester => typeof x === 'string') : [];
    } catch {
        return [];
    }
}

export function noteRecent(id: Ester) {
    const next = [id, ...readRecent().filter(x => x !== id)].slice(0, RECENT_MAX);
    try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
        /* private mode: it just isn't remembered */
    }
}

export function clearRecent() {
    try {
        localStorage.removeItem(RECENT_KEY);
    } catch {
        /* nothing to clear */
    }
}
