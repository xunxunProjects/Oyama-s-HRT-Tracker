import React, { useState } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { DoseEvent, LabResult } from '../../logic';
import { X, Download, ShieldCheck, FileJson, Lock } from 'lucide-react';
import CustomSelect from './CustomSelect';
import { useEscape } from '../hooks/useEscape';

const ExportModal = ({ isOpen, onClose, onExport, events, labResults, weight }: { isOpen: boolean, onClose: () => void, onExport: (encrypt: boolean, password?: string) => void, events: DoseEvent[], labResults: LabResult[], weight: number }) => {
    const { t } = useTranslation();
    const [exportMode, setExportMode] = useState<'json' | 'encrypted'>('json');
    const [password, setPassword] = useState('');

    useEscape(onClose, isOpen);

    if (!isOpen) return null;

    const hasData = events.length > 0 || labResults.length > 0;
    const totalRecords = events.length + labResults.length;

    const handleExport = () => {
        if (exportMode === 'encrypted') {
            onExport(true, password || undefined);
        } else {
            onExport(false);
        }
    };

    const exportOptions = [
        {
            value: 'json',
            label: 'JSON',
            icon: <FileJson size={18} className="text-blue-500" />
        },
        {
            value: 'encrypted',
            label: `JSON (${t('export.encrypt_label')})`,
            icon: <ShieldCheck size={18} className="text-pink-500" />
        }
    ];

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-50 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-zinc-900 rounded-t-[32px] md:rounded-[24px] shadow-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-lg md:max-w-2xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom duration-300 safe-area-pb transition-colors duration-300 overflow-hidden">

                {/* Header */}
                <div className="p-6 md:p-8 pb-4 shrink-0 flex justify-between items-start">
                    <div>
                        <h3 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">{t('export.title')}</h3>
                        {hasData && (
                            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                                {t('export.summary').replace('{doses}', events.length.toString()).replace('{labs}', labResults.length.toString())}
                            </p>
                        )}
                    </div>
                    <button onClick={onClose} className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 transition">
                        <X size={20} className="text-zinc-500 dark:text-zinc-400" />
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto min-h-0 px-6 md:px-8 space-y-6 [&::-webkit-scrollbar]:hidden scrollbar-none">
                    {hasData ? (
                        <>
                            {/* Dropdown for Export Type */}
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-zinc-500 dark:text-zinc-400 ml-1">
                                    {t('export.format_label')}
                                </label>
                                <CustomSelect
                                    value={exportMode}
                                    onChange={(val) => setExportMode(val as 'json' | 'encrypted')}
                                    options={exportOptions}
                                />
                                <p className="text-xs text-zinc-400 dark:text-zinc-500 ml-1">
                                    {exportMode === 'json' ? t('drawer.save_hint') : t('export.encrypt_ask_desc')}
                                </p>
                            </div>

                            {/* Password Input (Only if Encrypted) */}
                            {exportMode === 'encrypted' && (
                                <div className="space-y-2 animate-in slide-in-from-top-2 fade-in duration-300 pb-2">
                                    <label className="text-sm font-bold text-zinc-500 dark:text-zinc-400 ml-1">
                                        {t('export.password_label')}
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder={t('export.password_placeholder')}
                                            className="w-full p-4 pl-12 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-all text-zinc-900 dark:text-white placeholder:text-zinc-400"
                                        />
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                                    </div>
                                    <p className="text-xs text-zinc-400 dark:text-zinc-500 ml-1 leading-relaxed">
                                        {t('export.password_hint_random')}
                                    </p>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-zinc-400 dark:text-zinc-500 gap-4">
                            <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-full">
                                <FileJson size={32} strokeWidth={1.5} />
                            </div>
                            <p className="font-medium">{t('drawer.empty_export')}</p>
                        </div>
                    )}
                </div>

                {/* Footer with Button */}
                {hasData && (
                    <div className="p-6 md:p-8 pt-4 shrink-0 bg-white dark:bg-zinc-900 border-t border-zinc-50 dark:border-zinc-800/50">
                        <button
                            onClick={handleExport}
                            className={`w-full py-4 px-6 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]
                                ${exportMode === 'encrypted'
                                    ? 'bg-pink-600 hover:bg-pink-500 text-white shadow-pink-600/20'
                                    : 'bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-100 text-white dark:text-zinc-900 shadow-zinc-900/20 dark:shadow-white/10'
                                }`}
                        >
                            <Download size={22} className={exportMode === 'encrypted' ? 'text-pink-100' : 'text-zinc-400 dark:text-zinc-600'} />
                            <span>
                                {exportMode === 'encrypted' ? t('export.btn_encrypted') : t('export.btn_json')}
                            </span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ExportModal;
