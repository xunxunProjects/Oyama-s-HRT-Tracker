import React, { useState } from 'react';
import { UserCircle, UploadCloud, DownloadCloud, LogOut, User, BadgeCheck, Edit2, Lock, Trash2, Shield, Key } from 'lucide-react';
import { AvatarUpload } from '../components/AvatarUpload';
import EditProfileModal from '../components/EditProfileModal';
import ChangePasswordModal from '../components/ChangePasswordModal';
import DeleteAccountModal from '../components/DeleteAccountModal';

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
    const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
    const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
    const [isDeleteAccountOpen, setIsDeleteAccountOpen] = useState(false);

    return (
        <div className="relative space-y-5 pt-6 pb-24">
            <div className="px-6 md:px-10">
                <div className="w-full p-5 rounded-lg bg-white dark:bg-neutral-900 flex items-center justify-between border border-gray-200 dark:border-neutral-800 transition-all duration-300">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight flex items-center gap-3">
                        <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-md">
                            <User size={20} className="text-emerald-600 dark:text-emerald-400" />
                        </div>
                        {t('account.title')}
                    </h2>
                </div>
            </div>

            <div className="space-y-4 px-6 md:px-10">
                {user ? (
                    <>
                        {/* Profile Section */}
                        <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 overflow-hidden transition-colors duration-300">
                            <div className="p-6 flex flex-col items-center justify-center gap-4 bg-gray-50/50 dark:bg-neutral-800/30">
                                {token && (
                                    <AvatarUpload
                                        username={user.username}
                                        token={token}
                                    />
                                )}
                                <div className="flex flex-col items-center gap-1">
                                    <div className="flex items-center gap-1.5">
                                        <span className="font-bold text-gray-900 dark:text-gray-100 text-xl">{user.username}</span>
                                        {user.isAdmin && (
                                            <BadgeCheck className="w-5 h-5 text-emerald-600 fill-emerald-100 dark:fill-emerald-900/30" strokeWidth={2.5} />
                                        )}
                                    </div>
                                    <button
                                        onClick={() => setIsEditProfileOpen(true)}
                                        className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                                    >
                                        <Edit2 size={12} />
                                        {t('account.edit_profile')}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Security Section */}
                        <div className="space-y-2">
                            <h3 className="px-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Security</h3>
                            <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 divide-y divide-gray-100 dark:divide-neutral-800 overflow-hidden">
                                <button
                                    onClick={() => setIsChangePasswordOpen(true)}
                                    className="w-full flex items-center gap-3 px-6 py-4 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition text-start"
                                >
                                    <div className="p-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-md">
                                        <Key className="text-blue-600 dark:text-blue-400" size={18} />
                                    </div>
                                    <div className="text-start">
                                        <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">{t('account.change_password')}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{t('account.change_password_desc')}</p>
                                    </div>
                                </button>
                            </div>
                        </div>

                        {/* Data Section */}
                        <div className="space-y-2">
                            <h3 className="px-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('settings.group.data')}</h3>
                            <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 divide-y divide-gray-100 dark:divide-neutral-800 overflow-hidden">
                                <button
                                    onClick={onCloudSave}
                                    className="w-full flex items-center gap-3 px-6 py-4 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition text-start"
                                >
                                    <div className="p-1.5 bg-emerald-50 dark:bg-emerald-900/20 rounded-md">
                                        <UploadCloud className="text-emerald-600 dark:text-emerald-400" size={18} />
                                    </div>
                                    <div className="text-start">
                                        <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">{t('account.backup_cloud')}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{t('account.backup_cloud_desc')}</p>
                                    </div>
                                </button>
                                <button
                                    onClick={onCloudLoad}
                                    className="w-full flex items-center gap-3 px-6 py-4 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition text-start"
                                >
                                    <div className="p-1.5 bg-emerald-50 dark:bg-emerald-900/20 rounded-md">
                                        <DownloadCloud className="text-emerald-600 dark:text-emerald-400" size={18} />
                                    </div>
                                    <div className="text-start">
                                        <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">{t('account.restore_cloud')}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{t('account.restore_cloud_desc')}</p>
                                    </div>
                                </button>
                            </div>
                        </div>

                        {/* Danger Zone */}
                        <div className="space-y-2">
                            <h3 className="px-4 text-xs font-bold text-red-500 uppercase tracking-wider">Danger Zone</h3>
                            <div className="bg-white dark:bg-neutral-900 rounded-lg border border-red-200 dark:border-red-900/30 overflow-hidden">
                                <button
                                    onClick={() => setIsDeleteAccountOpen(true)}
                                    className="w-full flex items-center gap-3 px-6 py-4 hover:bg-red-50 dark:hover:bg-red-900/10 transition text-start"
                                >
                                    <div className="p-1.5 bg-red-100 dark:bg-red-900/30 rounded-md">
                                        <Trash2 className="text-red-600 dark:text-red-400" size={18} />
                                    </div>
                                    <div className="text-start">
                                        <p className="font-medium text-red-600 dark:text-red-400 text-sm">{t('account.delete_account')}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{t('account.delete_account_desc')}</p>
                                    </div>
                                </button>
                            </div>
                        </div>

                        {/* Logout */}
                        <div className="flex justify-center pt-4">
                            <button
                                onClick={onLogout}
                                className="flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-800 px-6 py-2 rounded-md transition-colors text-sm font-medium"
                            >
                                <LogOut size={16} />
                                {t('account.sign_out')}
                            </button>
                        </div>

                        <EditProfileModal
                            isOpen={isEditProfileOpen}
                            onClose={() => setIsEditProfileOpen(false)}
                        />
                        <ChangePasswordModal
                            isOpen={isChangePasswordOpen}
                            onClose={() => setIsChangePasswordOpen(false)}
                        />
                        <DeleteAccountModal
                            isOpen={isDeleteAccountOpen}
                            onClose={() => setIsDeleteAccountOpen(false)}
                        />
                    </>
                ) : (
                    <div className="mx-6 md:mx-10 bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 overflow-hidden transition-colors duration-300">
                        <button
                            onClick={onOpenAuth}
                            className="w-full flex items-center gap-3 px-6 py-4 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition text-start"
                        >
                            <div className="p-1.5 bg-emerald-50 dark:bg-emerald-900/20 rounded-md">
                                <UserCircle className="text-emerald-600 dark:text-emerald-400" size={18} />
                            </div>
                            <div className="text-start">
                                <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">{t('account.sign_in_register')}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">{t('account.sign_in_register_desc')}</p>
                            </div>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Account;
