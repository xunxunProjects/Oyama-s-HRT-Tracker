import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import type { ElementType } from 'react';
import { Search, Log, Labs, Gear, Heart, Shield, Users } from '../components/icons';
import { voteStatusAt } from '../../communityVote';
import { runViewMove, type ViewMove } from '../motion/viewMove';
import { useTranslation } from '../contexts/LanguageContext';
import {
    depthLeft,
    isSteppingBack,
    navDepth,
    pushNavEntry,
    readNavEntry,
    replaceNavEntry,
    stepBack,
    TAB_RESELECT,
} from './navHistory';
import { parsePath } from './viewPaths';

export type ViewKey =
    | 'home'
    | 'share'
    | 'history'
    | 'lab'
    | 'lab-calibration'
    | 'lab-calibration-guide'
    | 'settings'
    | 'account'
    | 'admin'
    | 'sessions'
    | 'hrt-security'
    | 'f2f'
    | 'two-factor'
    | 'change-password'
    | 'delete-account'
    | 'edit-profile'
    | 'edit-avatar'
    | 'pk-params'
    | 'settings-hrt-mode'
    | 'settings-language'
    | 'settings-appearance'
    | 'settings-weight'
    | 'settings-age'
    | 'settings-export'
    | 'settings-import'
    | 'settings-transparency'
    | 'settings-credits'
    | 'settings-community'
    | 'settings-disclaimer'
    | 'settings-opsec'
    | 'settings-pk-viz'
    | 'settings-model'
    | 'settings-milk-tea'
    | 'settings-cat-states'
    | 'settings-simulator'
    | 'forecast'
    | 'supplies'
    | 'plan'
    | 'med'
    | 'kind'
    | 'history-stats'
    | 'history-weight';

/**
 * The page each page is opened from, laid out as Oyama Journal lays out its
 * own: five tabs (Search, the Journal, Labs where the journal keeps its mix,
 * the Plan where it keeps what's saved, Settings), each with its pages under
 * it. The account lives in Settings, as the journal's does, with its own
 * pages under it. Back from a page returns to the page above it.
 */
const PARENT: Partial<Record<ViewKey, ViewKey>> = {
    // Search: a medicine, and a kind of medicine.
    med: 'home',
    kind: 'home',
    // The journal: the forecast and sharing hang off what it shows now.
    forecast: 'history',
    share: 'history',
    // Labs.
    'lab-calibration': 'lab',
    'lab-calibration-guide': 'lab',
    // The plan, and what's on hand for it.
    supplies: 'plan',
    // Settings.
    'settings-hrt-mode': 'settings',
    'settings-language': 'settings',
    'settings-appearance': 'settings',
    'settings-weight': 'settings',
    'settings-age': 'settings',
    'settings-export': 'settings',
    'settings-import': 'settings',
    'settings-transparency': 'settings',
    'settings-opsec': 'settings',
    'settings-pk-viz': 'settings',
    'settings-model': 'settings',
    'settings-credits': 'settings',
    'settings-community': 'settings',
    'settings-disclaimer': 'settings',
    'settings-milk-tea': 'settings',
    'settings-cat-states': 'settings',
    'settings-simulator': 'settings',
    'pk-params': 'settings',
    account: 'settings',
    // The account's own pages.
    sessions: 'account',
    'hrt-security': 'account',
    f2f: 'account',
    'two-factor': 'account',
    'change-password': 'account',
    'delete-account': 'account',
    'edit-profile': 'account',
    'edit-avatar': 'account',
};

/** The tab a page sits under: up through its parents to the top. */
export const tabForView = (view: ViewKey): ViewKey => {
    let v = view;
    for (let i = 0; i < 4 && PARENT[v]; i++) v = PARENT[v]!;
    return v;
};

/**
 * Where Back leads from a page: the page above it. The admin area is a tab of
 * its own beside a wide screen's sidebar, but a phone opens it from Settings,
 * so opened from Settings it is a page of Settings and Back returns there.
 */
const parentOf = (view: ViewKey): ViewKey | undefined => (view === 'admin' ? 'settings' : PARENT[view]);

/**
 * Pages other tabs' pages also open, and keep under themselves: a medicine
 * opened from the plan or from the journal's stats is a page of that tab,
 * which stays lit, and Back returns there rather than to Search. The supplies
 * a running-low line in the journal opens are the journal's too.
 */
const ALSO_UNDER: Partial<Record<ViewKey, readonly ViewKey[]>> = {
    med: ['plan', 'history', 'history-stats', 'lab'],
    supplies: ['history'],
};
const alsoUnder = (view: ViewKey, from: ViewKey) => !!ALSO_UNDER[view]?.includes(from);

/**
 * The journal's three panels (Log, Stats, Weight): one page, switched by the
 * tabs under its title. Choosing one takes over the entry rather than adding
 * one, and lights the Journal tab.
 */
const PANELS: readonly ViewKey[] = ['history', 'history-stats', 'history-weight'];
const isPanel = (v: ViewKey) => PANELS.includes(v);
const litTab = (tab: ViewKey): ViewKey => (isPanel(tab) ? 'history' : tab);

const VIEW_ORDER: ViewKey[] = [
    'history',
    'history-stats',
    'history-weight',
    'forecast',
    'share',
    'home',
    'kind',
    'med',
    'lab',
    'lab-calibration',
    'lab-calibration-guide',
    'plan',
    'supplies',
    'settings',
    'account',
    'sessions',
    'hrt-security',
    'f2f',
    'two-factor',
    'change-password',
    'delete-account',
    'edit-profile',
    'edit-avatar',
    'pk-params',
    'settings-hrt-mode',
    'settings-language',
    'settings-appearance',
    'settings-weight',
    'settings-age',
    'settings-export',
    'settings-import',
    'settings-model',
    'settings-transparency',
    'settings-opsec',
    'settings-pk-viz',
    'settings-credits',
    'settings-community',
    'settings-disclaimer',
    'settings-milk-tea',
    'settings-cat-states',
    'settings-simulator',
    'admin',
];

type Direction = 'forward' | 'backward';
const directionOf = (from: ViewKey, to: ViewKey): Direction =>
    VIEW_ORDER.indexOf(to) >= VIEW_ORDER.indexOf(from) ? 'forward' : 'backward';

/**
 * Where the app opens: the page a reload left on screen (its history entry
 * survives the reload), else the page the address names (a link, a bookmark,
 * an address typed in), else the Journal.
 */
const openingPage = (): { view: ViewKey; under?: ViewKey; param?: string } => {
    const entry = readNavEntry();
    if (entry) return { view: entry.view, under: entry.under, param: entry.cat };
    const named = parsePath(window.location.pathname);
    return named ? { view: named.view, param: named.cat } : { view: 'history' };
};

/** A sidebar destination. The badge is the quiet dot that marks an open vote. */
interface NavItem {
    id: string;
    label: string;
    icon: ElementType;
    badge?: boolean;
}

export const useAppNavigation = (user: any) => {
    const { t } = useTranslation();

    // --- State ---
    const [opening] = useState(openingPage);
    const [currentView, setCurrentView] = useState<ViewKey>(opening.view);
    const [transitionDirection, setTransitionDirection] = useState<Direction>('forward');
    // How the view on screen arrived, for browsers that animate it themselves
    // only on the page's side (see motion/viewMove.ts).
    const [move, setMove] = useState<ViewMove>('fade');
    // Set while a page from ALSO_UNDER is open under the other tab.
    const [openedUnder, setOpenedUnder] = useState<ViewKey | null>(opening.under ?? null);
    // What the page is of, for the pages that show one thing of many: the
    // medicine on a medicine's page, the kind on a kind's. Kept in the page's
    // history entry, so Back and a reload bring the same one back.
    const [viewParam, setViewParam] = useState<string | undefined>(opening.param);
    // Whether the funding vote still has an open door in the sidebar. It
    // closes on its own at the deadline, without waiting for a reload.
    const [voteOpen, setVoteOpen] = useState(() => voteStatusAt(Math.floor(Date.now() / 1000)) !== 'closed');
    useEffect(() => {
        const id = window.setInterval(() => {
            setVoteOpen(voteStatusAt(Math.floor(Date.now() / 1000)) !== 'closed');
        }, 60_000);
        return () => window.clearInterval(id);
    }, []);
    const mainScrollRef = useRef<HTMLDivElement>(null);
    // The view on screen, for the history listener, which outlives renders.
    const viewRef = useRef<ViewKey>(opening.view);
    // How far down each page was when it was last left, and whether the move
    // under way goes back to one, so Back lands where you were, not at the top.
    const scrollTops = useRef<Partial<Record<ViewKey, number>>>({});
    const restoreScroll = useRef(false);
    // A move waiting for history.go to step back to the base entry first: a
    // tab, or a jump to a page under another tab.
    const pending = useRef<{ view: ViewKey; direction: Direction; how: ViewMove; param?: string } | null>(null);

    // --- Actions ---
    const show = useCallback(
        (
            view: ViewKey,
            direction: Direction,
            restore: boolean,
            under?: ViewKey,
            how: ViewMove = 'fade',
            param?: string,
        ) => {
            const el = mainScrollRef.current;
            if (el) scrollTops.current[viewRef.current] = el.scrollTop;
            viewRef.current = view;
            restoreScroll.current = restore;
            runViewMove(
                how,
                () => {
                    setTransitionDirection(direction);
                    setMove(how);
                    setOpenedUnder(under ?? null);
                    setViewParam(param);
                    setCurrentView(view);
                },
                // Inside a move the frame-later retry below comes too late:
                // the page is already on its way in. By here it has its
                // full height, so the scroll lands before the first frame.
                () => {
                    const top = scrollTops.current[view] ?? 0;
                    const page = mainScrollRef.current;
                    if (restore && page && page.scrollTop < top) page.scrollTop = top;
                },
            );
        },
        [],
    );

    // A fresh stack: the view's tab as the base entry, and the view above it
    // when it is a page inside that tab, so Back from it still has somewhere
    // to go. Only ever called with history at the base entry.
    const land = useCallback(
        (view: ViewKey, direction: Direction, how: ViewMove = 'fade', param?: string) => {
            const tab = tabForView(view);
            replaceNavEntry(tab, 0);
            if (tab !== view) pushNavEntry(view, 1, param);
            show(view, direction, false, undefined, how, param);
        },
        [show],
    );

    // While a step back is still on its way, the entry it leaves is still the
    // current one, so the move waits in `pending` and popstate carries it on.
    const jump = (view: ViewKey, direction: Direction, how: ViewMove = 'fade', param?: string) => {
        const depth = navDepth();
        if (depth > 0 || isSteppingBack()) {
            pending.current = { view, direction, how, param };
            stepBack(depth);
        } else {
            land(view, direction, how, param);
        }
    };

    /**
     * Every way to another view from inside a page: a row that opens a page, a
     * page's back arrow, a link across. `param` names the one thing a page
     * shows when it shows one of many (a medicine, a kind).
     */
    const handleViewChange = (view: ViewKey, param?: string) => {
        const from = viewRef.current;
        if ((view === from && param === viewParam) || isSteppingBack()) return;
        const depth = navDepth();
        // The journal's panels are tabs of one page: the entry is taken over,
        // and the page itself slides its panel in.
        if (isPanel(view) && isPanel(from)) {
            replaceNavEntry(view, depth);
            show(view, directionOf(from, view), false, undefined, 'none');
            return;
        }
        // Up to the page this one was opened from: back through history, so
        // the entry pushed on the way in goes with it, and popstate shows it.
        if (depth > 0 && (parentOf(from) === view || readNavEntry()?.under === view) && param === undefined) {
            stepBack();
            return;
        }
        if (parentOf(view) === from) {
            pushNavEntry(view, depth + 1, param);
            show(view, 'forward', false, undefined, 'push', param);
            return;
        }
        if (alsoUnder(view, from)) {
            pushNavEntry(view, depth + 1, param, from);
            show(view, 'forward', false, from, 'push', param);
            return;
        }
        // A sibling page sits at the same level, so it takes over the entry.
        if (depth > 0 && parentOf(view) !== undefined && parentOf(view) === parentOf(from)) {
            replaceNavEntry(view, depth, param, readNavEntry()?.under);
            show(view, directionOf(from, view), false, readNavEntry()?.under, 'fade', param);
            return;
        }
        jump(view, directionOf(from, view), 'fade', param);
    };

    /**
     * The sidebar and the bottom bar. A tab opens on its own page, whatever was
     * open inside it before, the way a phone's tab bar behaves. Tapping the tab
     * already showing goes back to its top: the scroller, and through
     * TAB_RESELECT any level the page keeps of its own.
     */
    const handleTabSelect = (tab: ViewKey) => {
        // A menu switches at once: no cross-fade, nothing slides.
        if (tab !== viewRef.current) {
            jump(tab, directionOf(viewRef.current, tab), 'none');
            return;
        }
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        mainScrollRef.current?.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
        window.dispatchEvent(new CustomEvent(TAB_RESELECT, { detail: { view: tab } }));
    };

    // --- Effects ---
    // Opening the app. A reload finds its own entry still in history, with the
    // pages it was opened from under it, so it stays where it was; the entry
    // only has its address brought up to date when it names another page (one
    // written before pages had addresses reads `/`). An address on its own (a link, a bookmark) gets
    // the stack a tap would have built: its tab as the base entry, and the
    // page above it, so Back from it lands on the tab. Anything else opens the
    // Overview, at `/`. Running twice (a remount, or Strict Mode) finds the
    // entries it wrote the first time and leaves them be.
    useEffect(() => {
        const entry = readNavEntry();
        if (entry) {
            // A wide window's Settings keeps its tab in the address alone
            // (/settings/data on the Settings entry), so only an address that
            // names another page is rewritten.
            if (parsePath(window.location.pathname)?.view !== entry.view)
                replaceNavEntry(entry.view, entry.depth, entry.cat, entry.under);
            return;
        }
        const named = parsePath(window.location.pathname);
        if (!named) {
            replaceNavEntry('history', 0);
            return;
        }
        const tab = tabForView(named.view);
        replaceNavEntry(tab, 0);
        if (tab !== named.view) pushNavEntry(named.view, 1, named.cat);
        else if (named.cat) pushNavEntry(tab, 1, named.cat);
    }, []);

    useEffect(() => {
        const onPop = () => {
            const entry = readNavEntry();
            // Not an entry the app wrote: left to the /share route check in App.
            if (!entry) return;
            const next = pending.current;
            if (next) {
                // A tab tapped while a single step back was landing is still
                // above the base entry; carry on down before landing it.
                if (entry.depth > 0) {
                    stepBack(entry.depth);
                    return;
                }
                pending.current = null;
                land(next.view, next.direction, next.how, next.param);
                return;
            }
            if (entry.view === viewRef.current) {
                // The same page, of another thing (one medicine, then another).
                setViewParam(entry.cat);
                return;
            }
            // A Forward lands only on a page opened from the one showing. Any
            // other was left above the base entry before a tab took its place
            // (Overview > What-if, Back, then the History tab), so shown here
            // it would light its own tab while its back arrow led to this one.
            // Step back over it to where this Forward started.
            const left = depthLeft();
            if (entry.depth > left && parentOf(entry.view) !== viewRef.current && entry.under !== viewRef.current) {
                stepBack(entry.depth - left);
                return;
            }
            // Back up to the page this one was opened from, or Forward into one.
            const from = viewRef.current;
            const how: ViewMove =
                parentOf(from) === entry.view || alsoUnder(from, entry.view)
                    ? 'pop'
                    : parentOf(entry.view) === from || entry.under === from
                      ? 'push'
                      : 'fade';
            show(entry.view, directionOf(from, entry.view), true, entry.under, how, entry.cat);
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, [land, show]);

    // The scroller is keyed on the view, so every page mounts at the top, which
    // is right for a page opened or a tab switched to. Coming back, the page
    // returns to where it was left. One that grows after its first layout (the
    // Overview's chart measures itself) gets a second try a frame later.
    useLayoutEffect(() => {
        const el = mainScrollRef.current;
        if (!el || !restoreScroll.current) return;
        restoreScroll.current = false;
        const top = scrollTops.current[currentView] ?? 0;
        el.scrollTop = top;
        if (el.scrollTop < top)
            requestAnimationFrame(() => {
                el.scrollTop = top;
            });
    }, [currentView]);

    // --- Derived Data ---
    // The Journal first, where the app opens, then Search, the flask (labs),
    // the heart (the plan) and Settings.
    const navItems: NavItem[] = [
        { id: 'history', label: t('nav.journal'), icon: Log },
        { id: 'home', label: t('nav.search'), icon: Search },
        { id: 'lab', label: t('nav.lab'), icon: Labs },
        { id: 'plan', label: t('nav.plan'), icon: Heart },
        { id: 'settings', label: t('nav.settings'), icon: Gear },
    ];

    // The funding vote is a page of Settings, but while ballots are open it
    // gets a door of its own. The dot goes when the box closes with it.
    if (voteOpen) {
        navItems.push({ id: 'settings-community', label: t('settings.community'), icon: Users, badge: true });
    }

    if (user?.isAdmin) {
        navItems.push({ id: 'admin', label: t('nav.admin'), icon: Shield });
    }

    return {
        currentView,
        /** The tab to light: the view's own, or the one it was opened under. */
        currentTab: litTab(openedUnder ? tabForView(openedUnder) : tabForView(currentView)),
        /** What the page on screen is of (a medicine, a kind), when it is one of many. */
        viewParam,
        transitionDirection,
        move,
        handleViewChange,
        handleTabSelect,
        mainScrollRef,
        navItems,
    };
};
