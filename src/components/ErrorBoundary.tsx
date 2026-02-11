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
                    <div className="bg-red-50 dark:bg-red-900/10 p-4 rounded-full mb-4">
                        <AlertTriangle size={48} className="text-red-500 dark:text-red-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">
                        Something went wrong
                    </h2>
                    <p className="text-zinc-500 dark:text-zinc-400 mb-6 max-w-md">
                        The application encountered an unexpected error.
                        Please try reloading the page.
                    </p>
                    {this.state.error && (
                        <div className="mb-6 p-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-left w-full max-w-md overflow-x-auto">
                            <code className="text-xs text-red-600 dark:text-red-400 font-mono">
                                {this.state.error.toString()}
                            </code>
                        </div>
                    )}
                    <button
                        onClick={this.handleReload}
                        className="flex items-center gap-2 px-6 py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold rounded-full hover:bg-zinc-800 dark:hover:bg-zinc-200 transition"
                    >
                        <RefreshCw size={18} />
                        Reload Application
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
