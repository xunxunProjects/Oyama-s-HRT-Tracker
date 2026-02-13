import React from 'react';
import { Settings as SettingsIcon, Languages, Palette, Sun, Moon, Monitor, Upload, Download, Copy, Trash2, Info, Github, AlertTriangle, Scale } from 'lucide-react';
import CustomSelect from '../components/CustomSelect';
import { Lang } from '../i18n/translations';
import { DoseEvent } from '../../logic';

interface SettingsProps {
    t: (key: string) => string;
    lang: Lang;
    setLang: (lang: Lang) => void;
    theme: 'light' | 'dark' | 'system';
    setTheme: (theme: 'light' | 'dark' | 'system') => void;
    languageOptions: { value: string; label: string }[];
    setIsImportModalOpen: (isOpen: boolean) => void;
    onSaveDosages: () => void;
    onQuickExport: () => void;
    onClearAllEvents: () => void;
    events: DoseEvent[];
    showDialog: (type: 'alert' | 'confirm', message: string, onConfirm?: () => void) => void;
    setIsDisclaimerOpen: (isOpen: boolean) => void;
    appVersion: string;
    weight: number;
    setIsWeightModalOpen: (isOpen: boolean) => void;
}

const Settings: React.FC<SettingsProps> = ({
    t,
    lang,
    setLang,
    theme,
    setTheme,
    languageOptions,
    setIsImportModalOpen,
    onSaveDosages,
    onQuickExport,
    onClearAllEvents,
    events,
    showDialog,
    setIsDisclaimerOpen,
    appVersion,
    weight,
    setIsWeightModalOpen,
}) => {
    return (
        <div className="relative space-y-5 pt-6 pb-24">
            <div className="px-6 md:px-10">
                <div className="w-full p-5 rounded-[var(--radius-xl)] bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] flex items-center justify-between border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] shadow-[var(--shadow-m3-1)] transition-all duration-300 m3-surface-tint">
                    <h2 className="font-display text-xl font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] tracking-tight flex items-center gap-3">
                        <div className="p-2 bg-[var(--color-m3-primary-container)] dark:bg-teal-900/20 rounded-[var(--radius-md)]">
                            <SettingsIcon size={20} className="text-[var(--color-m3-primary)] dark:text-teal-400" />
                        </div>
                        {t('nav.settings')}
                    </h2>
                </div>
            </div>

            {/* General Settings */}
            <div className="space-y-2">
                <h3 className="px-10 text-xs font-bold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] uppercase tracking-wider">{t('settings.group.general')}</h3>
                <div className="mx-6 md:mx-10 w-auto p-4 rounded-[var(--radius-xl)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] space-y-3 transition-colors duration-300">
                    <CustomSelect
                        icon={<Languages className="text-[var(--color-m3-primary)] dark:text-teal-400" size={20} />}
                        label={t('drawer.lang')}
                        value={lang}
                        onChange={(val) => setLang(val as Lang)}
                        options={languageOptions}
                    />

                    <div className="pt-3 border-t border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]">
                        <CustomSelect
                            icon={<Palette className="text-[var(--color-m3-primary)] dark:text-teal-400" size={20} />}
                            label={t('settings.theme')}
                            value={theme}
                            onChange={(val) => setTheme(val as 'light' | 'dark' | 'system')}
                            options={[
                                { value: 'light', label: t('theme.light'), icon: <Sun size={20} className="text-amber-500" /> },
                                { value: 'dark', label: t('theme.dark'), icon: <Moon size={20} className="text-indigo-400" /> },
                                { value: 'system', label: t('theme.system'), icon: <Monitor size={20} className="text-[var(--color-m3-on-surface-variant)]" /> },
                            ]}
                        />
                    </div>

                    <div className="pt-3 border-t border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]">
                        <button
                            onClick={() => setIsWeightModalOpen(true)}
                            className="w-full flex items-center justify-between group"
                        >
                            <div className="flex items-center gap-3">

                                <span className="font-medium text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] text-sm">{t('status.weight')}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">{weight} kg</span>
                            </div>
                        </button>
                    </div>
                </div>
            </div>

            {/* Data Management */}
            <div className="space-y-2">
                <h3 className="px-10 text-xs font-bold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] uppercase tracking-wider">{t('settings.group.data')}</h3>
                <div className="mx-6 md:mx-10 bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] rounded-[var(--radius-xl)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] divide-y divide-[var(--color-m3-surface-container)] dark:divide-[var(--color-m3-dark-outline-variant)] overflow-hidden transition-colors duration-300">
                    <button
                        onClick={onSaveDosages}
                        className="w-full flex items-center gap-3 px-6 py-4 hover:bg-[var(--color-m3-surface-container-low)] dark:hover:bg-[var(--color-m3-dark-surface-container-high)]/50 transition text-left m3-state-layer"
                    >
                        <div className="p-1.5">
                            <Upload className="text-[var(--color-m3-accent)] dark:text-rose-400" size={18} />
                        </div>
                        <div className="text-left">
                            <p className="font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] text-sm">{t('export.title')}</p>
                        </div>
                    </button>

                    <button
                        onClick={() => setIsImportModalOpen(true)}
                        className="w-full flex items-center gap-3 px-6 py-4 hover:bg-[var(--color-m3-surface-container-low)] dark:hover:bg-[var(--color-m3-dark-surface-container-high)]/50 transition text-left m3-state-layer"
                    >
                        <div className="p-1.5">
                            <Download className="text-[var(--color-m3-primary)] dark:text-teal-400" size={18} />
                        </div>
                        <div className="text-left">
                            <p className="font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] text-sm">{t('import.title')}</p>
                        </div>
                    </button>

                    <button
                        onClick={onQuickExport}
                        className="w-full flex items-center gap-3 px-6 py-4 hover:bg-[var(--color-m3-surface-container-low)] dark:hover:bg-[var(--color-m3-dark-surface-container-high)]/50 transition text-left m3-state-layer"
                    >
                        <div className="p-1.5">
                            <Copy className="text-blue-500 dark:text-blue-400" size={18} />
                        </div>
                        <div className="text-left">
                            <p className="font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] text-sm">{t('drawer.export_quick')}</p>
                        </div>
                    </button>

                    <button
                        onClick={onClearAllEvents}
                        disabled={!events.length}
                        className={`w-full flex items-center gap-3 px-6 py-4 text-left transition m3-state-layer ${events.length ? 'hover:bg-red-50/50 dark:hover:bg-red-900/10' : 'bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container-high)]/50 cursor-not-allowed opacity-60'}`}
                    >
                        <div className="p-1.5">
                            <Trash2 className="text-red-400" size={18} />
                        </div>
                        <div className="text-left">
                            <p className="font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] text-sm">{t('drawer.clear')}</p>
                        </div>
                    </button>
                </div>
            </div>

            {/* About */}
            <div className="space-y-2">
                <h3 className="px-10 text-xs font-bold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] uppercase tracking-wider">{t('settings.group.about')}</h3>
                <div className="mx-6 md:mx-10 bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] rounded-[var(--radius-xl)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] divide-y divide-[var(--color-m3-surface-container)] dark:divide-[var(--color-m3-dark-outline-variant)] overflow-hidden transition-colors duration-300">
                    <button
                        onClick={() => {
                            showDialog('confirm', t('drawer.model_confirm'), () => {
                                window.open('https://mahiro.uk/articles/estrogen-model-summary', '_blank');
                            });
                        }}
                        className="w-full flex items-center gap-3 px-6 py-4 hover:bg-[var(--color-m3-surface-container-low)] dark:hover:bg-[var(--color-m3-dark-surface-container-high)]/50 transition text-left m3-state-layer"
                    >
                        <div className="p-1.5">
                            <Info className="text-violet-500 dark:text-violet-400" size={18} />
                        </div>
                        <div className="text-left">
                            <p className="font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] text-sm">{t('drawer.model_title')}</p>
                        </div>
                    </button>

                    <button
                        onClick={() => {
                            showDialog('confirm', t('drawer.github_confirm'), () => {
                                window.open('https://github.com/SmirnovaOyama/Oyama-s-HRT-recorder', '_blank');
                            });
                        }}
                        className="w-full flex items-center gap-3 px-6 py-4 hover:bg-[var(--color-m3-surface-container-low)] dark:hover:bg-[var(--color-m3-dark-surface-container-high)]/50 transition text-left m3-state-layer"
                    >
                        <div className="p-1.5">
                            <Github className="text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]" size={18} />
                        </div>
                        <div className="text-left">
                            <p className="font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] text-sm">{t('drawer.github')}</p>
                        </div>
                    </button>

                    <button
                        onClick={() => setIsDisclaimerOpen(true)}
                        className="w-full flex items-center gap-3 px-6 py-4 hover:bg-[var(--color-m3-surface-container-low)] dark:hover:bg-[var(--color-m3-dark-surface-container-high)]/50 transition text-left m3-state-layer"
                    >
                        <div className="p-1.5">
                            <AlertTriangle className="text-amber-500" size={18} />
                        </div>
                        <div className="text-left">
                            <p className="font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] text-sm">{t('drawer.disclaimer')}</p>
                        </div>
                    </button>
                </div>
            </div>

            {/* Version Footer */}
            <div className="pt-4 pb-6 flex justify-center">
                <p className="text-xs font-bold text-[var(--color-m3-outline)] dark:text-[var(--color-m3-dark-outline)]">
                    {appVersion}
                </p>
            </div>
        </div>
    );
};

export default Settings;
