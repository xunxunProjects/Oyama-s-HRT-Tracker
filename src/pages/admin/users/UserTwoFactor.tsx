import type { FC } from 'react';
import type { AdminUser } from '../../../services/admin';
import { settingsSection } from '../../../components/SettingsListItem';
import { BusyState, dangerTextBtn, FactorRow, muted, plural } from '../shared';
import type { UsersState } from './useUsers';

export const UserTwoFactor: FC<{ user: AdminUser; state: UsersState }> = ({ user, state }) => {
    const { twoFA, twoFALoading, clearTwoFA } = state;

    if (twoFALoading) return <BusyState />;
    if (!twoFA) return <p className={`text-sm ${muted} py-4`}>Could not load two-step verification</p>;

    return (
        <div>
            <div className={settingsSection}>
                <FactorRow label="Authenticator app" state={twoFA.totp ? 'Set up' : 'Not set up'}>
                    <button
                        onClick={() =>
                            clearTwoFA(
                                user,
                                'totp',
                                `Turn off the authenticator app for ${user.username}? They sign in with their password alone, and every session is signed out.`,
                            )
                        }
                        disabled={!twoFA.totp}
                        className={dangerTextBtn}
                    >
                        Turn off
                    </button>
                </FactorRow>
                <FactorRow label="Passkeys" state={twoFA.passkeys === 0 ? 'None' : plural(twoFA.passkeys, 'passkey')}>
                    <button
                        onClick={() =>
                            clearTwoFA(
                                user,
                                'passkeys',
                                `Remove all ${plural(twoFA.passkeys, 'passkey')} for ${user.username}? Every session is signed out.`,
                            )
                        }
                        disabled={twoFA.passkeys === 0}
                        className={dangerTextBtn}
                    >
                        Remove
                    </button>
                </FactorRow>
                <FactorRow
                    label="Backup codes"
                    state={twoFA.backupCodes === 0 ? 'None left' : `${twoFA.backupCodes} unused`}
                >
                    <button
                        onClick={() =>
                            clearTwoFA(
                                user,
                                'backup_codes',
                                `Erase the backup codes ${user.username} has left? Their sessions stay signed in.`,
                            )
                        }
                        disabled={twoFA.backupCodes === 0}
                        className={dangerTextBtn}
                    >
                        Erase
                    </button>
                </FactorRow>
            </div>
            <p className={`text-xs ${muted} mt-4`}>
                Removing these leaves the account with its password alone, so make sure who is asking
            </p>
            <div className="mt-3 flex justify-end">
                <button
                    onClick={() =>
                        clearTwoFA(
                            user,
                            'all',
                            `Remove all two-step verification for ${user.username}? The authenticator app, every passkey and every backup code go, and all their sessions are signed out.`,
                        )
                    }
                    disabled={!twoFA.enabled && twoFA.backupCodes === 0}
                    className={dangerTextBtn}
                >
                    Remove all
                </button>
            </div>
        </div>
    );
};
