import React from 'react';
import { Settings as SettingsIcon, Languages, Palette, Sun, Moon, Monitor, Upload, Download, Copy, Trash2, Info, Github, AlertTriangle, Scale, ChevronDown } from 'lucide-react';
import CustomSelect from '../components/CustomSelect';
import ExportSection from '../components/ExportSection';
import ImportSection from '../components/ImportSection';
import { Lang } from '../i18n/translations';
import { DoseEvent } from '../../logic';

interface SettingsProps {
    t: (key: string) => string;
    lang: Lang;
    setLang: (lang: Lang) => void;
    theme: 'light' | 'dark' | 'system';
    setTheme: (theme: 'light' | 'dark' | 'system') => void;
    languageOptions: { value: string; label: string }[];
    onImportJson: (text: string) => boolean | Promise<boolean>;
    labResults: any[];
    onExport: (encrypt: boolean, password?: string) => void;
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
    onImportJson,
    labResults,
    onExport,
    onQuickExport,
    onClearAllEvents,
    events,
    showDialog,
    setIsDisclaimerOpen,
    appVersion,
    weight,
    setIsWeightModalOpen,
}) => {
    const [openDataMenu, setOpenDataMenu] = React.useState<'export' | 'import' | null>(null);
    const hasExportData = events.length > 0 || labResults.length > 0;

    return (
        <div className="relative space-y-6 pt-6 pb-24">
            <div className="px-6 md:px-8">
                <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-lg flex items-center justify-between p-4 mb-6">
                    <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                        <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-lg">
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
                    <div className="p-4">
                        <CustomSelect
                            icon={<Languages className="text-emerald-500 dark:text-emerald-400" size={18} />}
                            label={t('drawer.lang')}
                            value={lang}
                            onChange={(val) => setLang(val as Lang)}
                            options={languageOptions}
                        />
                    </div>

                    <div className="p-4">
                        <CustomSelect
                            icon={<Palette className="text-emerald-500 dark:text-emerald-400" size={18} />}
                            label={t('settings.theme')}
                            value={theme}
                            onChange={(val) => setTheme(val as 'light' | 'dark' | 'system')}
                            options={[
                                { value: 'light', label: t('theme.light'), icon: <Sun size={18} className="text-amber-500" /> },
                                { value: 'dark', label: t('theme.dark'), icon: <Moon size={18} className="text-indigo-400" /> },
                                { value: 'system', label: t('theme.system'), icon: <Monitor size={18} className="text-gray-500" /> },
                            ]}
                        />
                    </div>

                    <button
                        onClick={() => setIsWeightModalOpen(true)}
                        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors text-start"
                    >
                        <div className="flex items-center gap-3">
                            <Scale className="text-emerald-500 dark:text-emerald-400" size={18} />
                            <span className="font-semibold text-gray-900 dark:text-gray-100">{t('status.weight')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900 dark:text-gray-100">{weight} kg</span>
                        </div>
                    </button>
                </div>
            </div>

            {/* Data Management */}
            <div className="space-y-2">
                <h3 className="px-8 text-xs font-semibold text-gray-500 dark:text-gray-400">{t('settings.group.data')}</h3>
                <div className="mx-6 md:mx-8 bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 divide-y divide-gray-100 dark:divide-neutral-800 overflow-hidden text-sm">
                    <div>
                        <button
                            onClick={() => setOpenDataMenu(openDataMenu === 'export' ? null : 'export')}
                            className="w-full flex items-center justify-between px-4 py-4 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors text-start"
                        >
                            <div className="flex items-center gap-3">
                                <Upload className="text-emerald-500 dark:text-emerald-400" size={18} />
                                <span className="font-semibold text-gray-900 dark:text-gray-100">{t('export.title')}</span>
                            </div>
                            <ChevronDown
                                size={16}
                                className={`text-gray-400 transition-transform ${openDataMenu === 'export' ? 'rotate-180' : ''}`}
                            />
                        </button>

                        {openDataMenu === 'export' && (
                            <div className="px-4 pb-3">
                                <ExportSection 
                                    events={events}
                                    labResults={labResults}
                                    weight={weight}
                                    onExport={onExport}
                                />
                            </div>
                        )}
                    </div>

                    <div>
                        <button
                            onClick={() => setOpenDataMenu(openDataMenu === 'import' ? null : 'import')}
                            className="w-full flex items-center justify-between px-4 py-4 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors text-start"
                        >
                            <div className="flex items-center gap-3">
                                <Download className="text-violet-500 dark:text-violet-400" size={18} />
                                <span className="font-semibold text-gray-900 dark:text-gray-100">{t('import.title')}</span>
                            </div>
                            <ChevronDown
                                size={16}
                                className={`text-gray-400 transition-transform ${openDataMenu === 'import' ? 'rotate-180' : ''}`}
                            />
                        </button>

                        {openDataMenu === 'import' && (
                            <div className="px-4 pb-3">
                                <ImportSection onImportJson={onImportJson} />
                            </div>
                        )}
                    </div>

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
    );
};

export default Settings;
