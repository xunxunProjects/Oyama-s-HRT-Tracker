import React, { ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

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
                        Something went wrong
                    </h2>
                    <p className="text-sm text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] mb-6 max-w-md leading-relaxed">
                        The application encountered an unexpected error.
                        Please try reloading the page.
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
                        Reload Application
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
