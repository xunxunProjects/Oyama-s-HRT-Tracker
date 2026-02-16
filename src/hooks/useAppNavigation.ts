import { useState, useRef, useEffect } from 'react';
import { Activity, Calendar, FlaskConical, Settings as SettingsIcon, UserCircle, ShieldCheck } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';

export type ViewKey = 'home' | 'history' | 'lab' | 'settings' | 'account' | 'admin';

export const useAppNavigation = (user: any) => {
    const { t } = useTranslation();

    // --- State ---
    const [currentView, setCurrentView] = useState<ViewKey>('home');
    const [transitionDirection, setTransitionDirection] = useState<'forward' | 'backward'>('forward');
    const mainScrollRef = useRef<HTMLDivElement>(null);

    const viewOrder: ViewKey[] = ['home', 'history', 'lab', 'settings', 'account', 'admin'];

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
        { id: 'home', label: t('nav.home'), icon: Activity },
        { id: 'history', label: t('nav.history'), icon: Calendar },
        { id: 'lab', label: t('nav.lab'), icon: FlaskConical },
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
