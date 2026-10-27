import React, { useState, useSyncExternalStore } from 'react';
import { Close } from './icons';
import { useTranslation } from '../contexts/LanguageContext';
import { applyAppUpdate, isAppUpdateReady, subscribeToAppUpdate } from '../utils/swUpdate';
import { PAGE_COLUMN, headerActionAccent } from './PageHeader';
import UpdateDoodle from './UpdateDoodle';

// A line under the operator notice, led by a cat climbing out of a parcel
// (UpdateDoodle) rather than a stock refresh icon. It never reloads on its
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
        <div role="status" className="shrink-0 pt-2 pb-1 text-xs text-[var(--text)]">
            <div className={`${PAGE_COLUMN} flex items-center gap-2.5`}>
                <UpdateDoodle size={2.5} leaping={refreshing} />
                <p className="flex-1 min-w-0 break-words">{t('update.ready')}</p>
                <button
                    onClick={() => {
                        setRefreshing(true);
                        applyAppUpdate();
                    }}
                    disabled={refreshing}
                    className={`${headerActionAccent} shrink-0 bg-[var(--accent-subtle)] disabled:opacity-60`}
                >
                    {t('update.refresh')}
                </button>
                <button
                    onClick={() => setHidden(true)}
                    aria-label={t('update.later')}
                    title={t('update.later')}
                    className="tap-target -me-1.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                >
                    <Close size={16} strokeWidth={1.75} />
                </button>
            </div>
        </div>
    );
};

export default UpdatePrompt;
