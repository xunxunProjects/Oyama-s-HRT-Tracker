import { useState, useRef, useEffect } from 'react';
import { Home, ListTodo, Settings as SettingsIcon, UserCircle, ShieldCheck } from 'lucide-react';
import CalibrationCurveIcon from '../components/CalibrationCurveIcon';
import { useTranslation } from '../contexts/LanguageContext';

export type ViewKey = 'home' | 'history' | 'lab' | 'lab-calibration' | 'settings' | 'account' | 'admin' | 'sessions' | 'two-factor' | 'change-password' | 'delete-account' | 'edit-profile' | 'edit-avatar' | 'pk-params' | 'settings-hrt-mode' | 'settings-language' | 'settings-appearance' | 'settings-weight' | 'settings-export' | 'settings-import' | 'settings-transparency' | 'settings-milk-tea';

export const useAppNavigation = (user: any) => {
    const { t } = useTranslation();

    // --- State ---
    const [currentView, setCurrentView] = useState<ViewKey>('home');
    const [transitionDirection, setTransitionDirection] = useState<'forward' | 'backward'>('forward');
    const mainScrollRef = useRef<HTMLDivElement>(null);

    const viewOrder: ViewKey[] = ['home', 'history', 'lab', 'lab-calibration', 'settings', 'account', 'sessions', 'two-factor', 'change-password', 'delete-account', 'edit-profile', 'edit-avatar', 'pk-params', 'settings-hrt-mode', 'settings-language', 'settings-appearance', 'settings-weight', 'settings-export', 'settings-import', 'settings-transparency', 'settings-milk-tea', 'admin'];

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
        navItems.push({ id: 'admin', label: 'Admin', icon: ShieldCheck });
    }

    return {
        currentView,
        transitionDirection,
        handleViewChange,
        mainScrollRef,
        navItems
    };
};
