import { useEffect } from 'react';
import { tabForView, type ViewKey } from '../hooks/useAppNavigation';

interface ViewGoneGuardOptions {
    authToken: string | null;
    devMode: boolean;
    ageBeta: boolean;
    physiologyBeta: boolean;
    currentView: ViewKey;
    onLeave: (view: ViewKey) => void;
}

/**
 * A page whose guard below has gone false (signed out, developer mode off)
 * renders nothing, leaving a blank screen. The browser's Forward can land on
 * one after a sign-out, and an expired sign-in can leave one open, so step up
 * to the page it belongs to.
 */
export const isViewGone = ({
    authToken,
    devMode,
    ageBeta,
    physiologyBeta,
    currentView,
}: Omit<ViewGoneGuardOptions, 'onLeave'>): boolean =>
    (!authToken &&
        (currentView === 'share' ||
            currentView === 'sessions' ||
            currentView === 'two-factor' ||
            currentView === 'edit-avatar')) ||
    (!devMode &&
        (currentView === 'settings-milk-tea' ||
            currentView === 'settings-cat-states' ||
            currentView === 'settings-simulator')) ||
    (!ageBeta && currentView === 'settings-age') ||
    (!physiologyBeta && currentView === 'settings-hydration');

export const useViewGoneGuard = (options: ViewGoneGuardOptions) => {
    const gone = isViewGone(options);
    const { currentView, onLeave } = options;

    useEffect(() => {
        if (gone) onLeave(tabForView(currentView));
    }, [gone, currentView, onLeave]);
};
