import React, { ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Lang, TRANSLATIONS } from '../i18n/translations';

/**
 * The crash screen reads the language straight out of storage rather than out
 * of the LanguageProvider.
 *
 * This boundary wraps the whole app shell, so the render it is catching may be
 * the provider's own. Taking a dependency on a context that might be the thing
 * that just failed would mean the error screen can fail too, and the one screen
 * that has to survive anything would be the most fragile in the app. localStorage
 * and the raw pack cannot throw here.
 */
const tr = (key: string): string => {
    let lang: string | null = null;
    try { lang = localStorage.getItem('hrt-lang'); } catch { /* private mode */ }
    const packs = TRANSLATIONS as unknown as Record<string, Record<string, string>>;
    return packs[lang as Lang]?.[key] ?? packs.en[key] ?? packs.zh[key] ?? key;
};

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center">
                    <AlertTriangle size={32} strokeWidth={1.5} className="text-red-500 dark:text-red-400 mb-4" />
                    <h2 className="text-lg font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] mb-2">
                        {tr('error.title')}
                    </h2>
                    <p className="text-sm text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] mb-6 max-w-md leading-relaxed">
                        {tr('error.body')}
                    </p>
                    {this.state.error && (
                        <div className="callout mb-6 text-left w-full max-w-md overflow-x-auto">
                            <code className="text-xs text-red-600 dark:text-red-400 font-mono">
                                {this.state.error.toString()}
                            </code>
                        </div>
                    )}
                    <button
                        onClick={this.handleReload}
                        className="btn-primary"
                    >
                        <RefreshCw size={15} strokeWidth={1.5} />
                        {tr('error.reload')}
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
