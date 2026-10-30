import React, { useState, useId } from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';

import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import { isValidUsername } from '../utils/username';
import { BusyLabel } from '../components/StableLabel';

const EditProfile: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { t } = useTranslation();
    const { user, updateProfile } = useAuth();
    const [username, setUsername] = useState(user?.username || '');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const id = useId();

    const muted = 'text-[var(--text-muted)]';

    const trimmedUsername = username.trim();
    const usernameValid = isValidUsername(trimmedUsername);
    const showRules = username.length > 0 && !usernameValid;
    const canSave = usernameValid && !isLoading && trimmedUsername !== user?.username;

    // A form, so Enter in the field saves.
    const handleSubmit = async (ev: React.FormEvent) => {
        ev.preventDefault();
        if (!canSave) return;
        setIsLoading(true);
        setError('');
        try {
            await updateProfile(trimmedUsername);
            onBack();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="relative md:pb-32">
            <PageHeader onBack={onBack} title={t('account.edit_profile')} />

            <div className={`${PAGE_COLUMN} mt-4 space-y-5 [&>*]:max-w-md`}>
                <p className={`text-sm leading-relaxed ${muted}`}>{t('account.edit_profile_desc')}</p>

                <form onSubmit={handleSubmit} className="space-y-5">
                    {error && (
                        <p id={`${id}-error`} role="alert" className="text-sm text-[var(--danger)]">
                            {error}
                        </p>
                    )}

                    <div>
                        <label htmlFor={`${id}-username`} className={`block text-xs font-medium mb-1.5 ${muted}`}>
                            {t('account.new_username')}
                        </label>
                        <input
                            id={`${id}-username`}
                            type="text"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            className="input-base"
                            placeholder={t('account.new_username')}
                            autoComplete="username"
                            aria-describedby={
                                [error ? `${id}-error` : '', showRules ? `${id}-rules` : '']
                                    .filter(Boolean)
                                    .join(' ') || undefined
                            }
                            aria-invalid={showRules || undefined}
                            autoFocus
                        />
                        {showRules && (
                            <p id={`${id}-rules`} className="mt-1.5 text-xs text-[var(--danger)]">
                                {t('account.username_rules')}
                            </p>
                        )}
                    </div>

                    <button type="submit" disabled={!canSave} className="btn-primary w-full">
                        <BusyLabel busy={isLoading}>{t('btn.save')}</BusyLabel>
                    </button>
                </form>
            </div>
        </div>
    );
};

export default EditProfile;
