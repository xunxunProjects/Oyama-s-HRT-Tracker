import { useEffect, useRef, useState } from 'react';
import type { ViewKey } from '../hooks/useAppNavigation';
import type { User } from '../services/auth';

interface AccountFlowOptions {
    user: User | null;
    currentView: ViewKey;
    handleViewChange: (view: ViewKey) => void;
}

/**
 * The sign-in detour: a feature that needs an account sends people to Account,
 * remembers where they were going, and carries on once they are in.
 */
export const useAccountFlows = ({ user, currentView, handleViewChange }: AccountFlowOptions) => {
    const [afterSignIn, setAfterSignIn] = useState<ViewKey | null>(null);
    const [signInReason, setSignInReason] = useState<'share' | 'vote' | undefined>(undefined);
    // The vote page can be opened from Settings or from the Overview nudge;
    // its Back button returns to wherever it was opened from.
    const [communityVoteReturn, setCommunityVoteReturn] = useState<ViewKey>('settings');

    // Navigating to Account can be deferred while the history entry it was
    // opened from unwinds. Only clear the reason once Account was actually
    // reached and then left; otherwise this effect runs on the page that sent
    // the user there and wipes the reason before the form can show it.
    const accountVisited = useRef(false);

    const requireSignIn = (reason?: 'share' | 'vote', then?: ViewKey) => {
        setSignInReason(reason);
        setAfterSignIn(then ?? null);
        handleViewChange('account');
    };

    const openCommunityVote = (from: ViewKey) => {
        setCommunityVoteReturn(from);
        handleViewChange('settings-community');
    };

    const signInForCommunityVote = (from: ViewKey) => {
        setCommunityVoteReturn(from);
        requireSignIn('vote', 'settings-community');
    };

    useEffect(() => {
        if (!user || !afterSignIn) return;
        const next = afterSignIn;
        setAfterSignIn(null);
        setSignInReason(undefined);
        handleViewChange(next);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, afterSignIn]);

    // Left Account without signing in: the reason no longer applies.
    useEffect(() => {
        if (currentView === 'account') {
            accountVisited.current = true;
            return;
        }
        if (!accountVisited.current) return;
        accountVisited.current = false;
        setAfterSignIn(null);
        setSignInReason(undefined);
    }, [currentView]);

    return {
        signInReason,
        communityVoteReturn,
        setCommunityVoteReturn,
        requireSignIn,
        openCommunityVote,
        signInForCommunityVote,
    };
};
