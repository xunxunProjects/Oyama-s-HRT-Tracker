import type { ViewKey } from './useAppNavigation';
import type { Lang } from '../i18n/translations';
import { getShareCopy } from '../i18n/share';

/**
 * Every page's own address, so a reload stays where it was, Back and Forward
 * move through real pages, and a page can be opened from a link.
 *
 * The view keys stay the app's names for its pages; this only gives each one
 * a path. A page inside a tab sits under the tab's path, and the categories
 * Settings and Admin open as a level of their own on a phone get one too.
 *
 * Two rules for anything added here:
 * - Never `/share`: that path is the public, read-only share page
 *   (app/AppProviders.tsx, worker.ts), which never loads the app shell.
 * - Never a medication, a record or anything else about the person. The
 *   address lands in the browser's history, on a device that may be shared.
 */
export const VIEW_PATH: Record<ViewKey, string> = {
    home: '/',
    plan: '/plan',
    forecast: '/forecast',
    share: '/sharing',
    supplies: '/supplies',

    history: '/history',

    lab: '/lab',
    'lab-calibration': '/lab/calibration',
    'lab-calibration-guide': '/lab/calibration/guide',

    settings: '/settings',
    'settings-hrt-mode': '/settings/hrt-mode',
    'settings-language': '/settings/language',
    'settings-appearance': '/settings/appearance',
    'settings-weight': '/settings/weight',
    'settings-age': '/settings/age',
    'settings-export': '/settings/export',
    'settings-import': '/settings/import',
    'settings-transparency': '/settings/transparency',
    'settings-credits': '/settings/credits',
    'settings-community': '/settings/community',
    'settings-disclaimer': '/settings/disclaimer',
    'settings-opsec': '/settings/opsec',
    'settings-pk-viz': '/settings/pk-viz',
    'settings-model': '/settings/model',
    'settings-milk-tea': '/settings/milk-tea',
    'settings-cat-states': '/settings/cat-states',
    'settings-simulator': '/settings/simulator',
    'pk-params': '/settings/pk-params',

    account: '/account',
    sessions: '/account/sessions',
    'hrt-security': '/account/hrt-security',
    f2f: '/account/f2f',
    'two-factor': '/account/two-factor',
    'change-password': '/account/password',
    'delete-account': '/account/delete',
    'edit-profile': '/account/profile',
    'edit-avatar': '/account/avatar',

    admin: '/admin',
};

/** The levels Settings and Admin open on a phone (and show as tabs when wide). */
export const SETTINGS_CATS = ['general', 'data', 'about'] as const;
export const ADMIN_CATS = ['users', 'notice', 'donation', 'system'] as const;

const CATS_OF: Partial<Record<ViewKey, readonly string[]>> = {
    settings: SETTINGS_CATS,
    admin: ADMIN_CATS,
};

/** A page's address, with the category it has open when it has one. */
export const pathFor = (view: ViewKey, cat?: string): string => {
    const base = VIEW_PATH[view] ?? '/';
    return cat && CATS_OF[view]?.includes(cat) ? `${base}/${cat}` : base;
};

const BY_PATH = new Map<string, ViewKey>(
    (Object.entries(VIEW_PATH) as [ViewKey, string][]).map(([view, path]) => [path, view]),
);

/**
 * The page an address names, or null for one that names none. Case and a
 * trailing slash don't matter; anything after the path (a query, a fragment)
 * is not read.
 */
export const parsePath = (pathname: string): { view: ViewKey; cat?: string } | null => {
    const path = `/${pathname
        .toLowerCase()
        .split(/[?#]/, 1)[0]
        .replace(/^\/+|\/+$/g, '')}`;
    const view = BY_PATH.get(path);
    if (view) return { view };
    const cut = path.lastIndexOf('/');
    const parent = BY_PATH.get(path.slice(0, cut) || '/');
    const cat = path.slice(cut + 1);
    if (parent && CATS_OF[parent]?.includes(cat)) return { view: parent, cat };
    return null;
};

/**
 * What each page is called in the browser's tab and history, by the key its
 * own header uses. The Overview is the app's name alone.
 */
const TITLE_KEY: Partial<Record<ViewKey, string>> = {
    plan: 'plan.title',
    forecast: 'forecast.title',
    supplies: 'supplies.title',
    history: 'timeline.title',
    lab: 'lab.title',
    'lab-calibration': 'cal.settings',
    'lab-calibration-guide': 'cal_guide.title',
    settings: 'nav.settings',
    'settings-hrt-mode': 'settings.hrt_mode',
    'settings-language': 'drawer.lang',
    'settings-appearance': 'settings.theme',
    'settings-weight': 'status.weight',
    'settings-age': 'settings.age',
    'settings-export': 'export.title',
    'settings-import': 'import.title',
    'settings-transparency': 'transparency.title',
    'settings-community': 'vote.title',
    'settings-disclaimer': 'disclaimer.title',
    'settings-opsec': 'opsec.title',
    'settings-pk-viz': 'pk_demo.title',
    'settings-model': 'drawer.model_title',
    'settings-milk-tea': 'milktea.title',
    'settings-cat-states': 'settings.cat_states',
    'settings-simulator': 'settings.simulator',
    'pk-params': 'pk.title',
    account: 'account.title',
    sessions: 'account.sessions',
    'hrt-security': 'hrt.title',
    f2f: 'f2f.title',
    'two-factor': 'account.2fa',
    'change-password': 'account.change_password',
    'delete-account': 'account.delete_account',
    'edit-profile': 'account.edit_profile',
    'edit-avatar': 'avatar.title',
    admin: 'nav.admin',
};

/** The document title for a page: its name, then the app's. */
export const titleFor = (view: ViewKey, t: (key: string) => string, lang: Lang): string => {
    const app = t('app.title');
    const page =
        view === 'share'
            ? getShareCopy(lang).modalTitle
            : view === 'settings-credits'
              ? 'Credits'
              : TITLE_KEY[view] && t(TITLE_KEY[view]);
    return page && page !== app ? `${page} · ${app}` : app;
};
