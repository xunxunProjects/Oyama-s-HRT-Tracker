import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { Home, ListTodo, Settings as SettingsIcon, UserCircle, ShieldCheck } from 'lucide-react';
import CalibrationCurveIcon from '../components/CalibrationCurveIcon';
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

export type ViewKey =
    | 'home'
    | 'share'
    | 'history'
    | 'lab'
    | 'lab-calibration'
    | 'settings'
    | 'account'
    | 'admin'
    | 'sessions'
    | 'two-factor'
    | 'change-password'
    | 'delete-account'
    | 'edit-profile'
    | 'edit-avatar'
    | 'pk-params'
    | 'settings-hrt-mode'
    | 'settings-weight'
    | 'settings-age'
    | 'settings-export'
    | 'settings-import'
    | 'settings-transparency'
    | 'settings-credits'
    | 'settings-milk-tea'
    | 'settings-cat-states'
    | 'forecast'
    | 'supplies'
    | 'plan';

/**
 * Which top-level tab a view belongs to, so the sidebar and the bottom bar
 * both keep their section lit while a page inside it is open.
 */
const VIEW_TAB: Partial<Record<ViewKey, ViewKey>> = {
    forecast: 'home',
    plan: 'home',
    share: 'home',
    'lab-calibration': 'lab',
    'settings-hrt-mode': 'settings',
    'settings-weight': 'settings',
    'settings-age': 'settings',
    'settings-export': 'settings',
    'settings-import': 'settings',
    'settings-transparency': 'settings',
    'settings-credits': 'settings',
    'settings-milk-tea': 'settings',
    'settings-cat-states': 'settings',
    'pk-params': 'settings',
    supplies: 'settings',
    sessions: 'account',
    'two-factor': 'account',
    'change-password': 'account',
    'delete-account': 'account',
    'edit-profile': 'account',
    'edit-avatar': 'account',
};
export const tabForView = (view: ViewKey): ViewKey => VIEW_TAB[view] ?? view;

/**
 * Where Back leads from a page: its tab, as above. The admin area is a tab of
 * its own beside a wide screen's sidebar, but a phone opens it from Settings,
 * so opened from Settings it is a page of Settings and Back returns there.
 */
const parentOf = (view: ViewKey): ViewKey | undefined => (view === 'admin' ? 'settings' : VIEW_TAB[view]);

/**
 * Pages another tab's page also opens. Supplies lives under Settings, but the
 * Overview's running-low line opens it too, and opened from there it is a page
 * of the Overview: its tab stays lit and Back returns to the Overview, rather
 * than the jump landing on Settings, a tab nobody tapped.
 */
const ALSO_UNDER: Partial<Record<ViewKey, ViewKey>> = {
    supplies: 'home',
};

const VIEW_ORDER: ViewKey[] = [
    'home',
    'plan',
    'forecast',
    'share',
    'history',
    'lab',
    'lab-calibration',
    'settings',
    'account',
    'sessions',
    'two-factor',
    'change-password',
    'delete-account',
    'edit-profile',
    'edit-avatar',
    'pk-params',
    'supplies',
    'settings-hrt-mode',
    'settings-weight',
    'settings-age',
    'settings-export',
    'settings-import',
    'settings-transparency',
    'settings-credits',
    'settings-milk-tea',
    'settings-cat-states',
    'admin',
];

type Direction = 'forward' | 'backward';
const directionOf = (from: ViewKey, to: ViewKey): Direction =>
    VIEW_ORDER.indexOf(to) >= VIEW_ORDER.indexOf(from) ? 'forward' : 'backward';

export const useAppNavigation = (user: any) => {
    const { t } = useTranslation();

    // --- State ---
    const [currentView, setCurrentView] = useState<ViewKey>('home');
    const [transitionDirection, setTransitionDirection] = useState<Direction>('forward');
    // Set while a page from ALSO_UNDER is open under the other tab.
    const [openedUnder, setOpenedUnder] = useState<ViewKey | null>(null);
    const mainScrollRef = useRef<HTMLDivElement>(null);
    // The view on screen, for the history listener, which outlives renders.
    const viewRef = useRef<ViewKey>('home');
    // How far down each page was when it was last left, and whether the move
    // under way goes back to one, so Back lands where you were, not at the top.
    const scrollTops = useRef<Partial<Record<ViewKey, number>>>({});
    const restoreScroll = useRef(false);
    // A move waiting for history.go to step back to the base entry first: a
    // tab, or a jump to a page under another tab.
    const pending = useRef<{ view: ViewKey; direction: Direction } | null>(null);

    // --- Actions ---
    const show = useCallback((view: ViewKey, direction: Direction, restore: boolean, under?: ViewKey) => {
        const el = mainScrollRef.current;
        if (el) scrollTops.current[viewRef.current] = el.scrollTop;
        viewRef.current = view;
        restoreScroll.current = restore;
        setTransitionDirection(direction);
        setOpenedUnder(under ?? null);
        setCurrentView(view);
    }, []);

    // A fresh stack: the view's tab as the base entry, and the view above it
    // when it is a page inside that tab, so Back from it still has somewhere
    // to go. Only ever called with history at the base entry.
    const land = useCallback(
        (view: ViewKey, direction: Direction) => {
            const tab = tabForView(view);
            replaceNavEntry(tab, 0);
            if (tab !== view) pushNavEntry(view, 1);
            show(view, direction, false);
        },
        [show],
    );

    // While a step back is still on its way, the entry it leaves is still the
    // current one, so the move waits in `pending` and popstate carries it on.
    const jump = (view: ViewKey, direction: Direction) => {
        const depth = navDepth();
        if (depth > 0 || isSteppingBack()) {
            pending.current = { view, direction };
            stepBack(depth);
        } else {
            land(view, direction);
        }
    };

    /** Every way to another view from inside a page: a row that opens a page, a page's back arrow, a link across. */
    const handleViewChange = (view: ViewKey) => {
        const from = viewRef.current;
        if (view === from || isSteppingBack()) return;
        const depth = navDepth();
        // Up to the page this one was opened from: back through history, so
        // the entry pushed on the way in goes with it, and popstate shows it.
        if (depth > 0 && parentOf(from) === view) {
            stepBack();
            return;
        }
        if (parentOf(view) === from) {
            pushNavEntry(view, depth + 1);
            show(view, 'forward', false);
            return;
        }
        if (ALSO_UNDER[view] === from) {
            pushNavEntry(view, depth + 1, from);
            show(view, 'forward', false, from);
            return;
        }
        // A sibling page sits at the same level, so it takes over the entry.
        if (depth > 0 && parentOf(view) !== undefined && parentOf(view) === parentOf(from)) {
            replaceNavEntry(view, depth);
            show(view, directionOf(from, view), false);
            return;
        }
        jump(view, directionOf(from, view));
    };

    /**
     * The sidebar and the bottom bar. A tab opens on its own page, whatever was
     * open inside it before, the way a phone's tab bar behaves. Tapping the tab
     * already showing goes back to its top: the scroller, and through
     * TAB_RESELECT any level the page keeps of its own.
     */
    const handleTabSelect = (tab: ViewKey) => {
        if (tab !== viewRef.current) {
            jump(tab, directionOf(viewRef.current, tab));
            return;
        }
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        mainScrollRef.current?.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
        window.dispatchEvent(new CustomEvent(TAB_RESELECT, { detail: { view: tab } }));
    };

    // --- Effects ---
    // The app always opens on the Overview. A reload part-way down a stack
    // finds its pages still in history, so step back to the base entry rather
    // than leave them there for Back to replay. `pending` also keeps this from
    // stepping back twice should it ever run twice (a remount, or Strict Mode).
    useEffect(() => {
        if (pending.current) return;
        const depth = navDepth();
        if (depth > 0) {
            pending.current = { view: 'home', direction: 'forward' };
            stepBack(depth);
        } else {
            replaceNavEntry('home', 0);
        }
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
                land(next.view, next.direction);
                return;
            }
            if (entry.view === viewRef.current) return;
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
            show(entry.view, directionOf(viewRef.current, entry.view), true, entry.under);
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
    const navItems = [
        { id: 'home', label: t('nav.home'), icon: Home },
        { id: 'history', label: t('nav.history'), icon: ListTodo },
        { id: 'lab', label: t('nav.lab'), icon: CalibrationCurveIcon },
        { id: 'settings', label: t('nav.settings'), icon: SettingsIcon },
        { id: 'account', label: t('nav.account'), icon: UserCircle },
    ];

    if (user?.isAdmin) {
        navItems.push({ id: 'admin', label: t('nav.admin'), icon: ShieldCheck });
    }

    return {
        currentView,
        /** The tab to light: the view's own, or the one it was opened under. */
        currentTab: openedUnder ? tabForView(openedUnder) : tabForView(currentView),
        transitionDirection,
        handleViewChange,
        handleTabSelect,
        mainScrollRef,
        navItems,
    };
};
