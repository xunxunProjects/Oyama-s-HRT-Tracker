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

    const on = 'text-[var(--text)]';
    const muted = 'text-[var(--text-muted)]';

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
                    <div className="p-3 text-[var(--danger)] text-sm rounded-lg">
                        {error}
                    </div>
                )}

                <div>
                    <label className={`block text-xs font-medium mb-1.5 ${muted}`}>{t('account.new_username')}</label>
                    <input
                        type="text"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        className={`w-full px-4 py-3 text-sm bg-[var(--field)] border border-[var(--border)] rounded-lg focus:border-[var(--accent-ink)] focus:ring-[3px] focus:ring-[var(--accent)]/20 outline-none transition-colors ${on} placeholder-[var(--text-muted)]`}
                        placeholder={t('account.new_username')}
                        autoFocus
                    />
                </div>

                <button
                    onClick={handleSubmit}
                    disabled={!username.trim() || isLoading || username === user?.username}
                    className="btn-primary w-full"
                >
                    {isLoading ? '...' : t('btn.save')}
                </button>
            </div>
        </div>
    );
};

export default EditProfile;
