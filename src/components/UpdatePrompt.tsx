import React, { useState, useSyncExternalStore } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';
import { applyAppUpdate, isAppUpdateReady, subscribeToAppUpdate } from '../utils/swUpdate';
import { PAGE_COLUMN } from './PageHeader';

// Same plain-text line as the operator notice above it. It never reloads on its
// own: someone may be halfway through a dose or a lab result, so the new
// version waits until they tap refresh. Closing it only hides it for this
// visit; the next launch loads the new version anyway.

const UpdatePrompt: React.FC = () => {
    const { t } = useTranslation();
    const ready = useSyncExternalStore(subscribeToAppUpdate, isAppUpdateReady, () => false);
    const [hidden, setHidden] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    if (!ready || hidden) return null;

    return (
        <div role="status" className="shrink-0 pt-2.5 pb-1.5 text-xs text-[var(--accent-ink)]">
            <div className={`${PAGE_COLUMN} flex items-start gap-2`}>
                <span className="icon-line">
                    <RefreshCw size={16} strokeWidth={1.75} className={refreshing ? 'animate-spin' : undefined} />
                </span>
                <p className="flex-1 min-w-0 break-words">
                    {t('update.ready')}{' '}
                    <button
                        onClick={() => {
                            setRefreshing(true);
                            applyAppUpdate();
                        }}
                        disabled={refreshing}
                        className="font-semibold underline decoration-current/35 underline-offset-[3px] hover:decoration-current disabled:opacity-60"
                    >
                        {t('update.refresh')}
                    </button>
                </p>
                <button
                    onClick={() => setHidden(true)}
                    aria-label={t('update.later')}
                    title={t('update.later')}
                    className="tap-target -mt-[3px] -me-1.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                >
                    <X size={16} strokeWidth={1.75} />
                </button>
            </div>
        </div>
    );
};

export default UpdatePrompt;
