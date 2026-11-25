import type { FC } from 'react';
import { useState } from 'react';
import { BusyLabel } from '../../components/StableLabel';
import { settingsSection } from '../../components/SettingsListItem';
import { useAuth } from '../../contexts/AuthContext';
import { adminService, StorageReport } from '../../services/admin';
import { formatBytes } from '../../utils/helpers';
import { errorMessage, muted, on, plural, rowBase, textBtn, timeAgo } from './shared';

export function useStorage() {
    const { token } = useAuth();

    const [storage, setStorage] = useState<StorageReport | null>(null);
    const [storageLoading, setStorageLoading] = useState(false);
    const [storageError, setStorageError] = useState<string | null>(null);

    const loadStorage = async () => {
        if (!token) return;
        setStorageLoading(true);
        setStorageError(null);
        try {
            setStorage(await adminService.getStorage(token));
        } catch (e: unknown) {
            setStorageError(errorMessage(e) || 'Could not measure storage.');
        } finally {
            setStorageLoading(false);
        }
    };

    return { storage, storageLoading, storageError, loadStorage };
}

export type StorageState = ReturnType<typeof useStorage>;

export const SystemPanel: FC<{ state: StorageState }> = ({ state }) => {
    const { storage, storageLoading, storageError, loadStorage } = state;

    return (
        <div>
            <div className={settingsSection}>
                <div className={rowBase}>
                    <div className="min-w-0">
                        <p className={`text-sm ${on}`}>Storage</p>
                        <p className={`text-xs ${muted} mt-0.5 tabular-nums`}>
                            {storage
                                ? `${formatBytes(storage.payload_bytes)} in all, measured ${timeAgo(storage.measured_at)}`
                                : 'Compare with the D1 plan limit'}
                        </p>
                    </div>
                    <button onClick={loadStorage} disabled={storageLoading} className={textBtn}>
                        <BusyLabel busy={storageLoading} size={16}>
                            {storage ? 'Refresh' : 'Measure'}
                        </BusyLabel>
                    </button>
                </div>
                {storage?.tables.map(t => (
                    <div key={t.table} className={`${rowBase} min-h-11 py-2.5`}>
                        <span className={`min-w-0 truncate text-sm ${on}`}>{t.table}</span>
                        <span className={`shrink-0 text-sm ${muted} tabular-nums`}>
                            {plural(t.rows, 'row')}
                            {t.payload_bytes > 0 ? `, ${formatBytes(t.payload_bytes)}` : ''}
                        </span>
                    </div>
                ))}
                <div className={rowBase}>
                    <span className={`text-sm ${on}`}>Status</span>
                    <span className={`text-sm ${muted}`}>Operational</span>
                </div>
                <div className={rowBase}>
                    <span className={`text-sm ${on}`}>Backend</span>
                    <span className={`text-sm ${muted}`}>
                        {window.location.hostname === 'localhost' ? 'Local' : 'Remote'}
                    </span>
                </div>
            </div>
            {storageError && <p className="field-hint is-error">{storageError}</p>}
        </div>
    );
};
