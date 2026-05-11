import React from 'react';
import { Settings as SettingsIcon, Languages, Palette, Upload, Download, Trash2, Info, Github, AlertTriangle, Scale, Eye, User, SlidersHorizontal, ChevronRight, UploadCloud } from 'lucide-react';
import { Lang } from '../i18n/translations';
import { DoseEvent } from '../../logic';
import { PKCustomParams } from '../../logic';
import { useHRTMode } from '../contexts/HRTModeContext';

interface SettingsProps {
    t: (key: string) => string;
    lang: Lang;
    setLang: (lang: Lang) => void;
    theme: 'light' | 'dark' | 'system';
    setTheme: (theme: 'light' | 'dark' | 'system') => void;
    languageOptions: { value: string; label: string }[];
    onImportJson: (text: string) => boolean | Promise<boolean>;
    labResults: any[];
    onExport: (encrypt: boolean, password?: string) => Promise<string | null>;
    onQuickExport: () => void;
    onClearAllEvents: () => void;
    events: DoseEvent[];
    showDialog: (type: 'alert' | 'confirm', message: string, onConfirm?: () => void) => void;
    setIsDisclaimerOpen: (isOpen: boolean) => void;
    setIsTransparencyOpen: (isOpen: boolean) => void;
    appVersion: string;
    weight: number;
    setIsWeightModalOpen: (isOpen: boolean) => void;
    pkParams: PKCustomParams | null;
    onNavigateToPKParams: () => void;
    onNavigateToHRTMode: () => void;
    onNavigateToLanguage: () => void;
    onNavigateToAppearance: () => void;
    onNavigateToWeight: () => void;
    onNavigateToExport: () => void;
    onNavigateToImport: () => void;
    autoBackup: boolean;
    setAutoBackup: (v: boolean) => void;
    isLoggedIn: boolean;
}

const Settings: React.FC<SettingsProps> = ({
    t,
    lang,
    setLang,
    theme,
    setTheme,
    languageOptions,
    onImportJson,
    labResults,
    onExport,
    onQuickExport,
    onClearAllEvents,
    events,
    showDialog,
    setIsDisclaimerOpen,
    setIsTransparencyOpen,
    appVersion,
    weight,
    setIsWeightModalOpen,
    pkParams,
    onNavigateToPKParams,
    onNavigateToHRTMode,
    onNavigateToLanguage,
    onNavigateToAppearance,
    onNavigateToWeight,
    onNavigateToExport,
    onNavigateToImport,
    autoBackup,
    setAutoBackup,
    isLoggedIn,
}) => {
    const { mode } = useHRTMode();

    return (
        <>
        <div className="relative space-y-6 pt-6 pb-32">
            <div className="px-6 md:px-8">
                <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-lg flex items-center justify-between p-4 mb-6">
                    <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                        <div className="p-2 bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 rounded-lg">
                            <SettingsIcon size={20} />
                        </div>
                        {t('nav.settings')}
                    </h2>
                </div>
            </div>

            {/* General Settings */}
            <div className="space-y-2">
                <h3 className="px-8 text-xs font-semibold text-gray-500 dark:text-gray-400">{t('settings.group.general')}</h3>
                <div className="mx-6 md:mx-8 bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 divide-y divide-gray-100 dark:divide-neutral-800 overflow-hidden text-sm">
                    <button
                        onClick={onNavigateToHRTMode}
                        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors text-start"
                    >
                        <div className="flex items-center gap-3">
                            <User className="text-pink-500 dark:text-pink-400" size={18} />
                            <span className="font-semibold text-gray-900 dark:text-gray-100">{t('settings.hrt_mode')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500 dark:text-gray-400">{t(mode === 'transfem' ? 'mode.transfem' : 'mode.transmasc')}</span>
                            <ChevronRight size={16} className="text-gray-400" />
                        </div>
                    </button>

                    <button
                        onClick={onNavigateToLanguage}
                        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors text-start"
                    >
                        <div className="flex items-center gap-3">
                            <Languages className="text-pink-500 dark:text-pink-400" size={18} />
                            <span className="font-semibold text-gray-900 dark:text-gray-100">{t('drawer.lang')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500 dark:text-gray-400">{languageOptions.find(o => o.value === lang)?.label ?? lang}</span>
                            <ChevronRight size={16} className="text-gray-400" />
                        </div>
                    </button>

                    <button
                        onClick={onNavigateToAppearance}
                        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors text-start"
                    >
                        <div className="flex items-center gap-3">
                            <Palette className="text-pink-500 dark:text-pink-400" size={18} />
                            <span className="font-semibold text-gray-900 dark:text-gray-100">{t('settings.theme')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                                {theme === 'light' ? t('theme.light') : theme === 'dark' ? t('theme.dark') : t('theme.system')}
                            </span>
                            <ChevronRight size={16} className="text-gray-400" />
                        </div>
                    </button>

                    <button
                        onClick={onNavigateToWeight}
                        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors text-start"
                    >
                        <div className="flex items-center gap-3">
                            <Scale className="text-pink-500 dark:text-pink-400" size={18} />
                            <span className="font-semibold text-gray-900 dark:text-gray-100">{t('status.weight')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900 dark:text-gray-100">{weight} kg</span>
                            <ChevronRight size={16} className="text-gray-400" />
                        </div>
                    </button>

                    {isLoggedIn && (
                    <div className="w-full flex items-center justify-between p-4">
                        <div className="flex items-center gap-3">
                            <UploadCloud className="text-pink-500 dark:text-pink-400" size={18} />
                            <div>
                                <div className="font-semibold text-gray-900 dark:text-gray-100">{t('settings.auto_backup')}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('settings.auto_backup_desc')}</div>
                            </div>
                        </div>
                        <button
                            onClick={() => setAutoBackup(!autoBackup)}
                            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ${
                                autoBackup
                                    ? 'bg-[var(--color-m3-primary)]'
                                    : 'bg-gray-200 dark:bg-neutral-700'
                            }`}
                            role="switch"
                            aria-checked={autoBackup}
                        >
                            <span
                                className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
                                    autoBackup ? 'translate-x-6' : 'translate-x-1'
                                }`}
                            />
                        </button>
                    </div>
                    )}

                    <button
                        onClick={onNavigateToPKParams}
                        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors text-start"
                    >
                        <div className="flex items-center gap-3">
                            <SlidersHorizontal className="text-pink-500 dark:text-pink-400" size={18} />
                            <div>
                                <span className="font-semibold text-gray-900 dark:text-gray-100">{t('settings.pk_params')}</span>
                                {pkParams && (
                                    <span className="ml-2 text-xs text-amber-600 dark:text-amber-400 font-medium">{t('pk.customized')}</span>
                                )}
                            </div>
                        </div>
                        <ChevronRight size={16} className="text-gray-400" />
                    </button>
                </div>
            </div>

            {/* Data Management */}
            <div className="space-y-2">
                <h3 className="px-8 text-xs font-semibold text-gray-500 dark:text-gray-400">{t('settings.group.data')}</h3>
                <div className="mx-6 md:mx-8 bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 divide-y divide-gray-100 dark:divide-neutral-800 overflow-hidden text-sm">
                    <button
                        onClick={onNavigateToExport}
                        className="w-full flex items-center justify-between px-4 py-4 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors text-start"
                    >
                        <div className="flex items-center gap-3">
                            <Upload className="text-pink-500 dark:text-pink-400" size={18} />
                            <span className="font-semibold text-gray-900 dark:text-gray-100">{t('export.title')}</span>
                        </div>
                        <ChevronRight size={16} className="text-gray-400" />
                    </button>

                    <button
                        onClick={onNavigateToImport}
                        className="w-full flex items-center justify-between px-4 py-4 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors text-start"
                    >
                        <div className="flex items-center gap-3">
                            <Download className="text-violet-500 dark:text-violet-400" size={18} />
                            <span className="font-semibold text-gray-900 dark:text-gray-100">{t('import.title')}</span>
                        </div>
                        <ChevronRight size={16} className="text-gray-400" />
                    </button>

                    <button
                        onClick={onClearAllEvents}
                        disabled={!events.length}
                        className={`w-full flex items-center gap-3 px-4 py-4 text-start transition-colors ${events.length ? 'hover:bg-red-50 dark:hover:bg-red-900/10 text-gray-900 dark:text-gray-100' : 'bg-gray-50 dark:bg-neutral-800/50 cursor-not-allowed opacity-60 text-gray-500'}`}
                    >
                        <Trash2 className="text-red-500" size={18} />
                        <span className="font-semibold">{t('drawer.clear')}</span>
                    </button>
                </div>
            </div>

            {/* About */}
            <div className="space-y-2">
                <h3 className="px-8 text-xs font-semibold text-gray-500 dark:text-gray-400">{t('settings.group.about')}</h3>
                <div className="mx-6 md:mx-8 bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 divide-y divide-gray-100 dark:divide-neutral-800 overflow-hidden text-sm">
                    <button
                        onClick={() => {
                            showDialog('confirm', t('drawer.model_confirm'), () => {
                                window.open('https://mahiro.uk/articles/estrogen-model-summary', '_blank');
                            });
                        }}
                        className="w-full flex items-center gap-3 px-4 py-4 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors text-start"
                    >
                        <Info className="text-violet-500 dark:text-violet-400" size={18} />
                        <span className="font-semibold text-gray-900 dark:text-gray-100">{t('drawer.model_title')}</span>
                    </button>

                    <button
                        onClick={() => {
                            showDialog('confirm', t('drawer.github_confirm'), () => {
                                window.open('https://github.com/SmirnovaOyama/Oyama-s-HRT-recorder', '_blank');
                            });
                        }}
                        className="w-full flex items-center gap-3 px-4 py-4 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors text-start"
                    >
                        <Github className="text-gray-600 dark:text-gray-400" size={18} />
                        <span className="font-semibold text-gray-900 dark:text-gray-100">{t('drawer.github')}</span>
                    </button>

                    <button
                        onClick={() => setIsTransparencyOpen(true)}
                        className="w-full flex items-center gap-3 px-4 py-4 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors text-start"
                    >
                        <Eye className="text-emerald-500" size={18} />
                        <span className="font-semibold text-gray-900 dark:text-gray-100">{t('transparency.title')}</span>
                    </button>

                    <button
                        onClick={() => setIsDisclaimerOpen(true)}
                        className="w-full flex items-center gap-3 px-4 py-4 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors text-start"
                    >
                        <AlertTriangle className="text-amber-500" size={18} />
                        <span className="font-semibold text-gray-900 dark:text-gray-100">{t('drawer.disclaimer')}</span>
                    </button>
                </div>
            </div>

            {/* Version Footer */}
            <div className="pt-4 pb-6 flex justify-center">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500">
                    {appVersion}
                </p>
            </div>
        </div>

        </>
    );
};

export default Settings;
