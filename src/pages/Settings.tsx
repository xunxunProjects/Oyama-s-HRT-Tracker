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
                <div className="w-full p-5 rounded-[24px] bg-white dark:bg-zinc-900 flex items-center justify-between border border-zinc-200 dark:border-zinc-800 transition-colors duration-300">
                    <h2 className="text-xl font-semibold text-zinc-900 dark:text-white tracking-tight flex items-center gap-3">
                        <SettingsIcon size={22} className="text-pink-400" /> {t('nav.settings')}
                    </h2>
                </div>
            </div>



            {/* General Settings */}
            <div className="space-y-2">
                <h3 className="px-10 text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{t('settings.group.general')}</h3>
                <div className="mx-6 md:mx-10 w-auto p-4 rounded-[24px] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3 transition-colors duration-300">
                    <CustomSelect
                        icon={<Languages className="text-blue-500" size={20} />}
                        label={t('drawer.lang')}
                        value={lang}
                        onChange={(val) => setLang(val as Lang)}
                        options={languageOptions}
                    />

                    <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800">
                        <CustomSelect
                            icon={<Palette className="text-indigo-500" size={20} />}
                            label={t('settings.theme')}
                            value={theme}
                            onChange={(val) => setTheme(val as 'light' | 'dark' | 'system')}
                            options={[
                                { value: 'light', label: t('theme.light'), icon: <Sun size={20} className="text-amber-500" /> },
                                { value: 'dark', label: t('theme.dark'), icon: <Moon size={20} className="text-indigo-500" /> },
                                { value: 'system', label: t('theme.system'), icon: <Monitor size={20} className="text-zinc-500" /> },
                            ]}
                        />
                    </div>

                    <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800">
                        <button
                            onClick={() => setIsWeightModalOpen(true)}
                            className="w-full flex items-center justify-between group"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-emerald-500">
                                    <Scale size={20} />
                                </div>
                                <span className="font-medium text-zinc-700 dark:text-zinc-200 text-sm">{t('status.weight')}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-zinc-900 dark:text-white">{weight} kg</span>
                            </div>
                        </button>
                    </div>
                </div>
            </div>

            {/* Data Management */}
            <div className="space-y-2">
                <h3 className="px-10 text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{t('settings.group.data')}</h3>
                <div className="mx-6 md:mx-10 bg-white dark:bg-zinc-900 rounded-[24px] border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden transition-colors duration-300">
                    <button
                        onClick={onSaveDosages}
                        className="w-full flex items-center gap-3 px-6 py-4 hover:bg-pink-50 dark:hover:bg-pink-900/10 transition text-left"
                    >
                        <Upload className="text-pink-400" size={20} />
                        <div className="text-left">
                            <p className="font-bold text-zinc-900 dark:text-white text-sm">{t('export.title')}</p>
                        </div>
                    </button>

                    <button
                        onClick={() => setIsImportModalOpen(true)}
                        className="w-full flex items-center gap-3 px-6 py-4 hover:bg-teal-50 dark:hover:bg-teal-900/10 transition text-left"
                    >
                        <Download className="text-teal-500" size={20} />
                        <div className="text-left">
                            <p className="font-bold text-zinc-900 dark:text-white text-sm">{t('import.title')}</p>
                        </div>
                    </button>

                    <button
                        onClick={onQuickExport}
                        className="w-full flex items-center gap-3 px-6 py-4 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition text-left"
                    >
                        <Copy className="text-blue-400" size={20} />
                        <div className="text-left">
                            <p className="font-bold text-zinc-900 dark:text-white text-sm">{t('drawer.export_quick')}</p>
                        </div>
                    </button>

                    <button
                        onClick={onClearAllEvents}
                        disabled={!events.length}
                        className={`w-full flex items-center gap-3 px-6 py-4 text-left transition ${events.length ? 'hover:bg-red-50 dark:hover:bg-red-900/10' : 'bg-zinc-50 dark:bg-zinc-800/50 cursor-not-allowed opacity-60'}`}
                    >
                        <Trash2 className="text-red-400" size={20} />
                        <div className="text-left">
                            <p className="font-bold text-zinc-900 dark:text-white text-sm">{t('drawer.clear')}</p>
                        </div>
                    </button>
                </div>
            </div>

            {/* About */}
            <div className="space-y-2">
                <h3 className="px-10 text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('settings.group.about')}</h3>
                <div className="mx-6 md:mx-10 bg-white dark:bg-zinc-900 rounded-[24px] border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden transition-colors duration-300">
                    <button
                        onClick={() => {
                            showDialog('confirm', t('drawer.model_confirm'), () => {
                                window.open('https://mahiro.uk/articles/estrogen-model-summary', '_blank');
                            });
                        }}
                        className="w-full flex items-center gap-3 px-6 py-4 hover:bg-purple-50 dark:hover:bg-purple-900/10 transition text-left"
                    >
                        <Info className="text-purple-500" size={20} />
                        <div className="text-left">
                            <p className="font-bold text-zinc-900 dark:text-white text-sm">{t('drawer.model_title')}</p>
                        </div>
                    </button>

                    <button
                        onClick={() => {
                            showDialog('confirm', t('drawer.github_confirm'), () => {
                                window.open('https://github.com/SmirnovaOyama/Oyama-s-HRT-recorder', '_blank');
                            });
                        }}
                        className="w-full flex items-center gap-3 px-6 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition text-left"
                    >
                        <Github className="text-zinc-700 dark:text-zinc-300" size={20} />
                        <div className="text-left">
                            <p className="font-bold text-zinc-900 dark:text-white text-sm">{t('drawer.github')}</p>
                        </div>
                    </button>

                    <button
                        onClick={() => setIsDisclaimerOpen(true)}
                        className="w-full flex items-center gap-3 px-6 py-4 hover:bg-amber-50 dark:hover:bg-amber-900/10 transition text-left"
                    >
                        <AlertTriangle className="text-amber-500" size={20} />
                        <div className="text-left">
                            <p className="font-bold text-zinc-900 dark:text-white text-sm">{t('drawer.disclaimer')}</p>
                        </div>
                    </button>
                </div>
            </div>


            {/* Version Footer */}
            <div className="pt-4 pb-6 flex justify-center">
                <p className="text-xs font-bold text-zinc-300">
                    {appVersion}
                </p>
            </div>
        </div>
    );
};

export default Settings;
