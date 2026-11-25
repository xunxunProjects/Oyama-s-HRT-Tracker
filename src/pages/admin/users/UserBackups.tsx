import type { FC } from 'react';
import type { AdminUser } from '../../../services/admin';
import { formatBytes } from '../../../utils/helpers';
import { settingsSection } from '../../../components/SettingsListItem';
import { BusyState, dangerTextBtn, formatWhen, muted, on, rowBase, toLocalInput } from '../shared';
import type { UsersState } from './useUsers';

export const UserBackups: FC<{ user: AdminUser; state: UsersState }> = ({ user, state }) => {
    const { backups, backupsLoading, handleDeleteBackup, handlePurgeBackups } = state;

    if (backupsLoading) return <BusyState />;
    if (backups.length === 0) return <p className={`text-sm ${muted} py-4`}>No cloud backups</p>;

    return (
        <div>
            <div className={settingsSection}>
                {backups.map(b => (
                    <div key={b.id} className={`${rowBase} min-h-12 py-3`}>
                        <div className="min-w-0">
                            <p className={`text-sm ${on} tabular-nums`}>{formatWhen(toLocalInput(b.created_at))}</p>
                            <p className={`text-xs ${muted} mt-0.5 tabular-nums`}>{formatBytes(b.data_size)}</p>
                        </div>
                        {!user.memorial && (
                            <button
                                onClick={() => handleDeleteBackup(user, b.id)}
                                className={dangerTextBtn}
                                aria-label={`Delete the backup from ${formatWhen(toLocalInput(b.created_at))}`}
                            >
                                Delete
                            </button>
                        )}
                    </div>
                ))}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
                <span className={`text-xs ${muted} tabular-nums`}>
                    {formatBytes(backups.reduce((s, b) => s + b.data_size, 0))} in all
                </span>
                {!user.memorial && (
                    <button onClick={() => handlePurgeBackups(user)} className={dangerTextBtn}>
                        Delete all
                    </button>
                )}
            </div>
        </div>
    );
};
