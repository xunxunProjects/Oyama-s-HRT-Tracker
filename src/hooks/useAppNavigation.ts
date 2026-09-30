import { useState, useRef, useEffect } from 'react';
import { Home, ListTodo, Settings as SettingsIcon, UserCircle, ShieldCheck } from 'lucide-react';
import CalibrationCurveIcon from '../components/CalibrationCurveIcon';
import { useTranslation } from '../contexts/LanguageContext';

export type ViewKey = 'home' | 'share' | 'history' | 'lab' | 'lab-calibration' | 'settings' | 'account' | 'admin' | 'sessions' | 'two-factor' | 'change-password' | 'delete-account' | 'edit-profile' | 'edit-avatar' | 'pk-params' | 'settings-hrt-mode' | 'settings-language' | 'settings-appearance' | 'settings-weight' | 'settings-export' | 'settings-import' | 'settings-transparency' | 'settings-milk-tea' | 'settings-cat-states' | 'forecast' | 'supplies';

/**
 * Which top-level tab a view belongs to, so the sidebar and the bottom bar
 * both keep their section lit while a page inside it is open.
 */
const VIEW_TAB: Partial<Record<ViewKey, ViewKey>> = {
    'forecast': 'home',
    'share': 'home',
    'lab-calibration': 'lab',
    'settings-hrt-mode': 'settings',
    'settings-language': 'settings',
    'settings-appearance': 'settings',
    'settings-weight': 'settings',
    'settings-export': 'settings',
    'settings-import': 'settings',
    'settings-transparency': 'settings',
    'settings-milk-tea': 'settings',
    'settings-cat-states': 'settings',
    'pk-params': 'settings',
    'supplies': 'settings',
    'sessions': 'account',
    'two-factor': 'account',
    'change-password': 'account',
    'delete-account': 'account',
    'edit-profile': 'account',
    'edit-avatar': 'account',
};
export const tabForView = (view: ViewKey): ViewKey => VIEW_TAB[view] ?? view;

export const useAppNavigation = (user: any) => {
    const { t } = useTranslation();

    // --- State ---
    const [currentView, setCurrentView] = useState<ViewKey>('home');
    const [transitionDirection, setTransitionDirection] = useState<'forward' | 'backward'>('forward');
    const mainScrollRef = useRef<HTMLDivElement>(null);

    const viewOrder: ViewKey[] = ['home', 'forecast', 'share', 'history', 'lab', 'lab-calibration', 'settings', 'account', 'sessions', 'two-factor', 'change-password', 'delete-account', 'edit-profile', 'edit-avatar', 'pk-params', 'supplies', 'settings-hrt-mode', 'settings-language', 'settings-appearance', 'settings-weight', 'settings-export', 'settings-import', 'settings-transparency', 'settings-milk-tea', 'settings-cat-states', 'admin'];

    // --- Actions ---
    const handleViewChange = (view: ViewKey) => {
        if (view === currentView) return;
        const currentIndex = viewOrder.indexOf(currentView);
        const nextIndex = viewOrder.indexOf(view);
        setTransitionDirection(nextIndex >= currentIndex ? 'forward' : 'backward');
        setCurrentView(view);
    };

    // --- Effects ---
    // Reset scroll when switching tabs
    useEffect(() => {
        const el = mainScrollRef.current;
        if (el) el.scrollTo({ top: 0, behavior: 'smooth' });
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
        transitionDirection,
        handleViewChange,
        mainScrollRef,
        navItems
    };
};
