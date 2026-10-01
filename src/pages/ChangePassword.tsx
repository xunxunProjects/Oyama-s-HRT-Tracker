import React, { useState } from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import { Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import { settingsMuted, settingsOn } from '../components/SettingsListItem';

const ChangePassword: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { t } = useTranslation();
    const { changePassword } = useAuth();
    const [current, setCurrent] = useState('');
    const [newPass, setNewPass] = useState('');
    const [confirm, setConfirm] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const on = settingsOn;
    const muted = settingsMuted;
    const inputCls = `w-full px-4 py-3 text-sm bg-[var(--field)] border border-[var(--border)] rounded-md focus:border-[var(--text)] outline-none ${on} placeholder:text-[var(--text-muted)]`;

    const handleSubmit = async () => {
        if (!current || !newPass || !confirm) return;
        if (newPass !== confirm) { setError(t('pw.mismatch')); return; }
        if (newPass.length < 8) { setError(t('pw.too_short')); return; }

        setIsLoading(true);
        setError('');
        try {
            await changePassword(current, newPass);
            onBack();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="relative pb-32">
            <PageHeader onBack={onBack} title={t('account.change_password')} />

            <div className={`${PAGE_COLUMN} mt-4 space-y-5 [&>*]:max-w-md`}>
                <div className="flex items-start gap-3">
                    <span className="icon-line text-sm leading-relaxed"><Lock size={18} className={muted} /></span>
                    <p className={`text-sm leading-relaxed ${muted}`}>{t('account.change_password_desc')}</p>
                </div>

                {error && (
                    <p className="text-sm text-[var(--danger)]">{error}</p>
                )}

                <div className="space-y-4">
                    <div>
                        <label className={`block text-xs font-medium mb-1.5 ${muted}`}>{t('account.current_password')}</label>
                        <input type="password" value={current} onChange={e => setCurrent(e.target.value)} className={inputCls} autoFocus />
                    </div>
                    <div>
                        <label className={`block text-xs font-medium mb-1.5 ${muted}`}>{t('account.new_password')}</label>
                        <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                        <label className={`block text-xs font-medium mb-1.5 ${muted}`}>{t('account.confirm_password')}</label>
                        <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} className={inputCls} />
                    </div>
                </div>

                <button
                    onClick={handleSubmit}
                    disabled={!current || !newPass || !confirm || isLoading}
                    className="btn-primary w-full"
                >
                    {isLoading ? '...' : t('btn.save')}
                </button>
            </div>
        </div>
    );
};

export default ChangePassword;
