import { useEffect, useState, type ReactNode } from 'react';
import ErrorBoundary from '../components/ErrorBoundary';
import { AuthProvider } from '../contexts/AuthContext';
import { DialogProvider } from '../contexts/DialogContext';
import { HRTModeProvider } from '../contexts/HRTModeContext';
import { LanguageProvider } from '../contexts/LanguageContext';
import { PixelCatProvider } from '../contexts/PixelCatContext';
import PublicShare from '../pages/PublicShare';
import { parseShareFragment } from '../services/shareCrypto';

interface ShareRoute {
    isShareRoute: boolean;
    token: string | null;
    shareKey: string | null;
}

const getShareRoute = (): ShareRoute => {
    if (!/^\/share\/?$/.test(window.location.pathname)) {
        return { isShareRoute: false, token: null, shareKey: null };
    }

    // `#<token>.<key>`: the token finds the link on the server, the key
    // decrypts it and never leaves this page. Links made before share
    // encryption have a token only.
    const fragment = window.location.hash.slice(1).replace(/^\/+/, '').split(/[/?]/, 1)[0];
    const { token, key } = parseShareFragment(fragment);

    return { isShareRoute: true, token, shareKey: key };
};

/**
 * The provider stack, with the public share route kept outside the signed-in
 * app so it never mounts the account, sync or local-data layers.
 */
const AppProviders = ({ children }: { children: ReactNode }) => {
    const [shareRoute, setShareRoute] = useState(getShareRoute);

    useEffect(() => {
        const updateRoute = () => setShareRoute(getShareRoute());
        window.addEventListener('hashchange', updateRoute);
        window.addEventListener('popstate', updateRoute);
        return () => {
            window.removeEventListener('hashchange', updateRoute);
            window.removeEventListener('popstate', updateRoute);
        };
    }, []);

    return (
        <LanguageProvider>
            <HRTModeProvider>
                {shareRoute.isShareRoute ? (
                    <ErrorBoundary>
                        <PublicShare token={shareRoute.token} shareKey={shareRoute.shareKey} />
                    </ErrorBoundary>
                ) : (
                    <DialogProvider>
                        <AuthProvider>
                            <PixelCatProvider>
                                <ErrorBoundary>{children}</ErrorBoundary>
                            </PixelCatProvider>
                        </AuthProvider>
                    </DialogProvider>
                )}
            </HRTModeProvider>
        </LanguageProvider>
    );
};

export default AppProviders;
