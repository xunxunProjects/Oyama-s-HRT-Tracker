import React, { useState } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { DoseEvent, LabResult } from '../../logic';
import { Download, ShieldCheck, FileJson, Lock, FileText, Table, Copy, Check } from 'lucide-react';
import { exportToCSV, exportToPDF } from '../services/export';
import CustomSelect from './CustomSelect';

interface ExportSectionProps {
    events: DoseEvent[];
    labResults: LabResult[];
    weight: number;
    onExport: (encrypt: boolean, password?: string) => Promise<string | null>;
}

const ExportSection: React.FC<ExportSectionProps> = ({ events, labResults, weight, onExport }) => {
    const { t, lang } = useTranslation();
    const [exportMode, setExportMode] = useState<'json' | 'encrypted'>('json');
    const [password, setPassword] = useState('');
    const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const hasData = events.length > 0 || labResults.length > 0;

    const handleExport = async () => {
        if (exportMode === 'encrypted') {
            const pw = await onExport(true, password || undefined);
            if (pw) setGeneratedPassword(pw);
        } else {
            await onExport(false);
        }
    };

    const handleCopyPassword = () => {
        if (!generatedPassword) return;
        navigator.clipboard.writeText(generatedPassword);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const exportOptions = [
        {
            value: 'json',
            label: 'JSON',
            icon: <FileJson size={18} className="text-[var(--color-m3-primary)]" />
        },
        {
            value: 'encrypted',
            label: `JSON (${t('export.encrypt_label')})`,
            icon: <ShieldCheck size={18} className="text-violet-500" />
        }
    ];

    return (
        <div className="flex flex-col space-y-4 pt-1 pb-1">
            {hasData ? (
                <>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">
                                {t('export.title') || 'Format'}
                            </label>
                            <CustomSelect
                                value={exportMode}
                                onChange={(val) => setExportMode(val as 'json' | 'encrypted')}
                                options={exportOptions}
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                                {exportMode === 'json' ? t('drawer.save_hint') : t('export.encrypt_ask_desc')}
                            </p>
                        </div>

                        {exportMode === 'encrypted' && (
                            <div className="space-y-2 pb-1 relative transition-all duration-300">
                                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">
                                    {t('export.password_label')}
                                </label>
                                <div className="relative">
                                    <input
                                        type="password"
                                        name="export-encryption-password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder={t('export.password_placeholder')}
                                        className="w-full py-2.5 px-3 pl-10 text-sm bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-lg outline-none focus:ring-2 focus:ring-[var(--color-m3-primary)]/20 focus:border-[var(--color-m3-primary)] transition-all text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
                                        autoComplete="new-password"
                                        autoCorrect="off"
                                        autoCapitalize="off"
                                        spellCheck={false}
                                    />
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                                    {t('export.password_hint_random')}
                                </p>
                            </div>
                        )}

                        <button
                            onClick={handleExport}
                            className={`w-full py-2.5 px-4 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-sm
                                    ${exportMode === 'encrypted'
                                    ? 'bg-violet-500 hover:bg-violet-600 text-white'
                                    : 'bg-[var(--color-m3-primary)] hover:bg-[var(--color-m3-primary-light)] text-white'
                                }`}
                        >
                            <Download size={16} />
                            <span>
                                {exportMode === 'encrypted' ? t('export.btn_encrypted') : t('export.btn_json')}
                            </span>
                        </button>
                    </div>

                    {/* Inline generated password display */}
                    <div className={`grid transition-all duration-300 ease-in-out ${generatedPassword ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                        <div className="overflow-hidden">
                            <div className="pt-2 space-y-2">
                                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-lg p-3 space-y-2">
                                    <p className="text-xs font-bold text-amber-700 dark:text-amber-400">{t('export.password_title')}</p>
                                    <p className="text-[10px] text-amber-600/80 dark:text-amber-400/70 leading-relaxed">{t('export.password_desc')}</p>
                                    <div className="flex items-center gap-2 bg-white dark:bg-neutral-900 border border-amber-200 dark:border-amber-800/40 rounded-md p-2.5">
                                        <span className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100 tracking-widest flex-1 select-all break-all">{generatedPassword}</span>
                                        <button
                                            onClick={handleCopyPassword}
                                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-md transition-colors shrink-0"
                                        >
                                            {copied
                                                ? <Check size={14} className="text-emerald-500" />
                                                : <Copy size={14} className="text-gray-400" />
                                            }
                                        </button>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setGeneratedPassword(null)}
                                    className="w-full py-2 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                                >
                                    {t('btn.ok')}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="relative flex items-center py-1">
                        <div className="flex-grow border-t border-gray-100 dark:border-neutral-800"></div>
                        <span className="flex-shrink-0 mx-3 text-gray-300 dark:text-gray-600 text-[10px] uppercase font-bold tracking-widest">OR</span>
                        <div className="flex-grow border-t border-gray-100 dark:border-neutral-800"></div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => {
                                const csv = exportToCSV({ events, labResults, weight, lang, t });
                                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                                const url = URL.createObjectURL(blob);
                                const link = document.createElement('a');
                                link.href = url;
                                link.download = `hrt-data-${new Date().toISOString().split('T')[0]}.csv`;
                                link.click();
                                URL.revokeObjectURL(url);
                            }}
                            className="flex items-center justify-center py-2 px-3 rounded-lg border border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800 transition py-3 text-gray-700 dark:text-gray-200"
                        >
                            <Table className="text-blue-500 mr-2" size={16} />
                            <span className="text-sm font-semibold">CSV</span>
                        </button>
                        <button
                            onClick={() => exportToPDF({ events, labResults, weight, lang, t })}
                            className="flex items-center justify-center py-2 px-3 rounded-lg border border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800 transition py-3 text-gray-700 dark:text-gray-200"
                        >
                            <FileText className="text-red-500 mr-2" size={16} />
                            <span className="text-sm font-semibold">PDF</span>
                        </button>
                    </div>
                </>
            ) : (
                <div className="flex flex-col items-center justify-center py-8 text-gray-500 dark:text-gray-400 gap-3">
                    <div className="p-3 bg-gray-100 dark:bg-neutral-800 rounded-full">
                        <FileJson size={24} />
                    </div>
                    <p className="font-medium text-sm">{t('drawer.empty_export')}</p>
                </div>
            )}
        </div>
    );
};

export default ExportSection;
