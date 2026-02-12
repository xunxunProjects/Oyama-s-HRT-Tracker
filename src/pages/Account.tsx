import React from 'react';
import { UserCircle, UploadCloud, DownloadCloud, LogOut, User, BadgeCheck } from 'lucide-react';

interface AccountProps {
    t: (key: string) => string;
    user: any;
    onOpenAuth: () => void;
    onLogout: () => void;
    onCloudSave: () => void;
    onCloudLoad: () => void;
}

const Account: React.FC<AccountProps> = ({
    t,
    user,
    onOpenAuth,
    onLogout,
    onCloudSave,
    onCloudLoad
}) => {
    return (
        <div className="relative space-y-5 pt-6 pb-24">
            <div className="px-6 md:px-10">
                <div className="w-full p-5 rounded-[24px] bg-white dark:bg-zinc-900 flex items-center justify-between border border-zinc-200 dark:border-zinc-800 transition-colors duration-300">
                    <h2 className="text-xl font-semibold text-zinc-900 dark:text-white tracking-tight flex items-center gap-3">
                        <User size={22} className="text-indigo-400" /> {t('account.title')}
                    </h2>
                </div>
            </div>

            <div className="space-y-2">
                <div className="mx-6 md:mx-10 bg-white dark:bg-zinc-900 rounded-[24px] border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden transition-colors duration-300">
                    {user ? (
                        <>
                            <div className="px-6 py-4 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-800/30">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold overflow-hidden">
                                        {user.isAdmin ? (
                                            <img src="/favicon.ico" alt={t('account.admin_avatar')} className="w-full h-full object-cover" />
                                        ) : (
                                            user.username.charAt(0).toUpperCase()
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="font-bold text-zinc-900 dark:text-white text-sm">{user.username}</span>
                                        {user.isAdmin && (
                                            <BadgeCheck className="w-4 h-4 text-blue-500 fill-blue-500/10" strokeWidth={2.5} />
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={onLogout}
                                    className="flex items-center gap-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-1.5 rounded-lg transition-colors text-xs font-medium"
                                >
                                    <LogOut size={14} />
                                    {t('account.sign_out')}
                                </button>
                            </div>
                            <button
                                onClick={onCloudSave}
                                className="w-full flex items-center gap-3 px-6 py-4 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition text-left"
                            >
                                <UploadCloud className="text-indigo-500" size={20} />
                                <div className="text-left">
                                    <p className="font-bold text-zinc-900 dark:text-white text-sm">{t('account.backup_cloud')}</p>
                                    <p className="text-xs text-zinc-500">{t('account.backup_cloud_desc')}</p>
                                </div>
                            </button>
                            <button
                                onClick={onCloudLoad}
                                className="w-full flex items-center gap-3 px-6 py-4 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition text-left"
                            >
                                <DownloadCloud className="text-indigo-500" size={20} />
                                <div className="text-left">
                                    <p className="font-bold text-zinc-900 dark:text-white text-sm">{t('account.restore_cloud')}</p>
                                    <p className="text-xs text-zinc-500">{t('account.restore_cloud_desc')}</p>
                                </div>
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={onOpenAuth}
                            className="w-full flex items-center gap-3 px-6 py-4 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition text-left"
                        >
                            <UserCircle className="text-indigo-500" size={20} />
                            <div className="text-left">
                                <p className="font-bold text-zinc-900 dark:text-white text-sm">{t('account.sign_in_register')}</p>
                                <p className="text-xs text-zinc-500">{t('account.sign_in_register_desc')}</p>
                            </div>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Account;
