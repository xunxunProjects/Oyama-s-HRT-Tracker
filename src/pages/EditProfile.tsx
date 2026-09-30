import React, { useState } from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';

import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';

const EditProfile: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { t } = useTranslation();
    const { user, updateProfile } = useAuth();
    const [username, setUsername] = useState(user?.username || '');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const on = 'text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]';
    const muted = 'text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]';

    const handleSubmit = async () => {
        if (!username.trim()) return;
        setIsLoading(true);
        setError('');
        try {
            await updateProfile(username);
            onBack();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="relative pb-32">
            <PageHeader onBack={onBack} title={t('account.edit_profile')} />

            <div className={`${PAGE_COLUMN} mt-4 space-y-5 [&>*]:max-w-md`}>
                <p className={`text-sm leading-relaxed ${muted}`}>{t('account.edit_profile_desc')}</p>

                {error && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg">
                        {error}
                    </div>
                )}

                <div>
                    <label className={`block text-xs font-medium mb-1.5 ${muted}`}>{t('account.new_username')}</label>
                    <input
                        type="text"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        className={`w-full px-4 py-3 text-sm bg-white dark:bg-neutral-900 border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] rounded-lg focus:border-[var(--color-m3-primary)] focus:ring-1 focus:ring-[var(--color-m3-primary)] outline-none transition-colors ${on} placeholder-[var(--color-m3-outline)] dark:placeholder-[var(--color-m3-dark-outline)]`}
                        placeholder={t('account.new_username')}
                        autoFocus
                    />
                </div>

                <button
                    onClick={handleSubmit}
                    disabled={!username.trim() || isLoading || username === user?.username}
                    className="w-full py-3 text-sm font-medium bg-[var(--color-m3-primary)] hover:bg-[var(--color-m3-primary-light)] text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isLoading ? '...' : t('btn.save')}
                </button>
            </div>
        </div>
    );
};

export default EditProfile;
