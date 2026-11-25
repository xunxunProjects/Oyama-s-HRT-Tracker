import type { FC, ReactNode } from 'react';
import { ChevronLeft, Cloud, Flower, Password, Pencil, ShieldOff, Trash } from '../../../components/icons';
import { settingsSection } from '../../../components/SettingsListItem';
import type { AdminUser } from '../../../services/admin';
import { formatBytes } from '../../../utils/helpers';
import { ActionRow, muted, on, plural } from '../shared';
import type { UserTool } from '../types';
import type { UsersState } from './useUsers';
import { UserBackups } from './UserBackups';
import { UserPassword } from './UserPassword';
import { UserProfile } from './UserProfile';
import { UserTwoFactor } from './UserTwoFactor';

const toolTitle: Record<Exclude<UserTool, 'menu'>, string> = {
    backups: 'Cloud backups',
    '2fa': 'Two-step verification',
    password: 'Password',
    edit: 'Username and picture',
};

export const UserDetail: FC<{ user: AdminUser; state: UsersState }> = ({ user, state }) => {
    const { tool, setTool, openTool, setMemorial, handleDeleteUser } = state;

    if (tool === 'menu') {
        const twoFactorNote = [
            (user.has_totp ?? 0) > 0 && 'App',
            (user.passkey_count ?? 0) > 0 && plural(user.passkey_count ?? 0, 'passkey'),
        ]
            .filter(Boolean)
            .join(', ');
        // A memorial account is kept as it is: its backups can be looked
        // at, and the only thing left to do is to make it ordinary again.
        if (user.memorial) {
            return (
                <div className={settingsSection}>
                    <ActionRow
                        icon={Cloud}
                        label="Cloud backups"
                        note={(user.backup_count ?? 0) > 0 ? formatBytes(user.total_backup_size || 0) : 'None'}
                        onClick={() => openTool(user, 'backups')}
                    />
                    <ActionRow
                        icon={Flower}
                        label="Memorial account"
                        note="Make ordinary"
                        inPlace
                        onClick={() => setMemorial(user, false)}
                    />
                </div>
            );
        }
        return (
            <div className={settingsSection}>
                <ActionRow
                    icon={Cloud}
                    label="Cloud backups"
                    note={(user.backup_count ?? 0) > 0 ? formatBytes(user.total_backup_size || 0) : 'None'}
                    onClick={() => openTool(user, 'backups')}
                />
                <ActionRow
                    icon={ShieldOff}
                    label="Two-step verification"
                    note={twoFactorNote || 'Off'}
                    onClick={() => openTool(user, '2fa')}
                />
                <ActionRow icon={Password} label="Password" onClick={() => openTool(user, 'password')} />
                <ActionRow icon={Pencil} label="Username and picture" onClick={() => openTool(user, 'edit')} />
                <ActionRow icon={Flower} label="Keep as memorial" inPlace onClick={() => setMemorial(user, true)} />
                <ActionRow icon={Trash} label="Delete user" danger onClick={() => handleDeleteUser(user)} />
            </div>
        );
    }

    let body: ReactNode;
    if (tool === 'password') body = <UserPassword user={user} state={state} />;
    else if (tool === 'edit') body = <UserProfile user={user} state={state} />;
    else if (tool === '2fa') body = <UserTwoFactor user={user} state={state} />;
    else body = <UserBackups user={user} state={state} />;

    return (
        <div>
            <button
                type="button"
                onClick={() => setTool('menu')}
                className={`-ml-2 mb-1 inline-flex h-8 items-center gap-1 rounded-full px-2 text-sm font-medium ${on} hover:bg-[var(--surface-hover)]`}
            >
                <ChevronLeft size={18} className={`${muted} rtl:-scale-x-100`} />
                {toolTitle[tool]}
            </button>
            {body}
        </div>
    );
};
