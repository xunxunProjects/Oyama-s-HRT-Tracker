import React from 'react';
import { UserCircle, UploadCloud, DownloadCloud, LogOut, User, BadgeCheck } from 'lucide-react';
import { AvatarUpload } from '../components/AvatarUpload';

interface AccountProps {
    t: (key: string) => string;
    user: any;
    token: string | null;
    onOpenAuth: () => void;
    onLogout: () => void;
    onCloudSave: () => void;
    onCloudLoad: () => void;
}

const Account: React.FC<AccountProps> = ({
    t,
    user,
    token,
    onOpenAuth,
    onLogout,
    onCloudSave,
    onCloudLoad
}) => {
    return (
        <div className="relative space-y-5 pt-6 pb-24">
            <div className="px-6 md:px-10">
                <div className="w-full p-5 rounded-[var(--radius-xl)] bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] flex items-center justify-between border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] shadow-[var(--shadow-m3-1)] transition-all duration-300 m3-surface-tint">
                    <h2 className="font-display text-xl font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] tracking-tight flex items-center gap-3">
                        <div className="p-2 bg-[var(--color-m3-primary-container)] dark:bg-teal-900/20 rounded-[var(--radius-md)]">
                            <User size={20} className="text-[var(--color-m3-primary)] dark:text-teal-400" />
                        </div>
                        {t('account.title')}
                    </h2>
                </div>
            </div>

            <div className="space-y-2">
                <div className="mx-6 md:mx-10 bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] rounded-[var(--radius-xl)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] divide-y divide-[var(--color-m3-surface-container)] dark:divide-[var(--color-m3-dark-outline-variant)] overflow-hidden transition-colors duration-300">
                    {user ? (
                        <>
                            <div className="px-6 py-6 flex flex-col items-center justify-center bg-[var(--color-m3-surface-container-low)] dark:bg-[var(--color-m3-dark-surface-container-high)]/30 gap-4">
                                {token && (
                                    <AvatarUpload
                                        username={user.username}
                                        token={token}
                                    />
                                )}

                                <div className="flex items-center gap-1.5">
                                    <span className="font-display font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] text-xl">{user.username}</span>
                                    {user.isAdmin && (
                                        <BadgeCheck className="w-5 h-5 text-[var(--color-m3-primary)] fill-[var(--color-m3-primary-container)]" strokeWidth={2.5} />
                                    )}
                                </div>

                                <button
                                    onClick={onLogout}
                                    className="flex items-center gap-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 px-4 py-2 rounded-[var(--radius-full)] transition-colors text-sm font-medium border border-transparent hover:border-red-200 dark:hover:border-red-900/50"
                                >
                                    <LogOut size={16} />
                                    {t('account.sign_out')}
                                </button>
                            </div>
                            <button
                                onClick={onCloudSave}
                                className="w-full flex items-center gap-3 px-6 py-4 hover:bg-[var(--color-m3-surface-container-low)] dark:hover:bg-[var(--color-m3-dark-surface-container-high)]/50 transition text-left m3-state-layer"
                            >
                                <div className="p-1.5 bg-[var(--color-m3-primary-container)] dark:bg-teal-900/20 rounded-[var(--radius-sm)]">
                                    <UploadCloud className="text-[var(--color-m3-primary)] dark:text-teal-400" size={18} />
                                </div>
                                <div className="text-left">
                                    <p className="font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] text-sm">{t('account.backup_cloud')}</p>
                                    <p className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">{t('account.backup_cloud_desc')}</p>
                                </div>
                            </button>
                            <button
                                onClick={onCloudLoad}
                                className="w-full flex items-center gap-3 px-6 py-4 hover:bg-[var(--color-m3-surface-container-low)] dark:hover:bg-[var(--color-m3-dark-surface-container-high)]/50 transition text-left m3-state-layer"
                            >
                                <div className="p-1.5 bg-[var(--color-m3-primary-container)] dark:bg-teal-900/20 rounded-[var(--radius-sm)]">
                                    <DownloadCloud className="text-[var(--color-m3-primary)] dark:text-teal-400" size={18} />
                                </div>
                                <div className="text-left">
                                    <p className="font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] text-sm">{t('account.restore_cloud')}</p>
                                    <p className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">{t('account.restore_cloud_desc')}</p>
                                </div>
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={onOpenAuth}
                            className="w-full flex items-center gap-3 px-6 py-4 hover:bg-[var(--color-m3-surface-container-low)] dark:hover:bg-[var(--color-m3-dark-surface-container-high)]/50 transition text-left m3-state-layer"
                        >
                            <div className="p-1.5 bg-[var(--color-m3-primary-container)] dark:bg-teal-900/20 rounded-[var(--radius-sm)]">
                                <UserCircle className="text-[var(--color-m3-primary)] dark:text-teal-400" size={18} />
                            </div>
                            <div className="text-left">
                                <p className="font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] text-sm">{t('account.sign_in_register')}</p>
                                <p className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">{t('account.sign_in_register_desc')}</p>
                            </div>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Account;
