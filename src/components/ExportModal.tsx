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
            icon: <ShieldCheck size={18} className="text-[var(--color-m3-accent)]" />
        }
    ];

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center z-50 animate-in fade-in duration-200">
            <div className="bg-[var(--color-m3-surface-container-high)] dark:bg-[var(--color-m3-dark-surface-container-high)] rounded-[var(--radius-xl)] shadow-[var(--shadow-m3-3)] w-full max-w-sm flex flex-col max-h-[85vh] animate-m3-decelerate safe-area-pb transition-colors duration-300 overflow-hidden">

                {/* Header */}
                <div className="px-6 pt-6 pb-2 shrink-0 flex justify-between items-start">
                    <div>
                        <h3 className="font-display text-base font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] tracking-tight">{t('export.title')}</h3>
                        {hasData && (
                            <p className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] mt-1">
                                {t('export.summary').replace('{doses}', events.length.toString()).replace('{labs}', labResults.length.toString())}
                            </p>
                        )}
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-[var(--radius-full)] hover:bg-[var(--color-m3-surface-container-highest)] dark:hover:bg-[var(--color-m3-dark-surface-container-highest)] transition">
                        <X size={18} className="text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]" />
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto min-h-0 px-6 space-y-4 [&::-webkit-scrollbar]:hidden scrollbar-none">
                    {hasData ? (
                        <>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] ml-1">
                                    {t('export.format_label')}
                                </label>
                                <CustomSelect
                                    value={exportMode}
                                    onChange={(val) => setExportMode(val as 'json' | 'encrypted')}
                                    options={exportOptions}
                                />
                                <p className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] ml-1">
                                    {exportMode === 'json' ? t('drawer.save_hint') : t('export.encrypt_ask_desc')}
                                </p>
                            </div>

                            {exportMode === 'encrypted' && (
                                <div className="space-y-2 animate-m3-container pb-2">
                                    <label className="text-sm font-bold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] ml-1">
                                        {t('export.password_label')}
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder={t('export.password_placeholder')}
                                            className="w-full p-3 pl-10 text-sm bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container-low)] border border-[var(--color-m3-outline)] dark:border-[var(--color-m3-dark-outline)] rounded-[var(--radius-md)] outline-none focus:ring-2 focus:ring-[var(--color-m3-primary-container)] focus:border-[var(--color-m3-primary)] dark:focus:border-teal-400 transition-all text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] placeholder:text-[var(--color-m3-outline)]"
                                        />
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-m3-on-surface-variant)]" size={16} />
                                    </div>
                                    <p className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] ml-1 leading-relaxed">
                                        {t('export.password_hint_random')}
                                    </p>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] gap-4">
                            <div className="p-4 bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container-high)] rounded-[var(--radius-full)]">
                                <FileJson size={32} strokeWidth={1.5} />
                            </div>
                            <p className="font-medium">{t('drawer.empty_export')}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {hasData && (
                    <div className="px-6 pb-6 pt-3 shrink-0">
                        <button
                            onClick={handleExport}
                            className={`w-full py-2.5 px-5 rounded-[var(--radius-full)] font-bold text-sm flex items-center justify-center gap-2 transition-all duration-300 shadow-[var(--shadow-m3-1)]
                                ${exportMode === 'encrypted'
                                    ? 'bg-[var(--color-m3-accent)] hover:bg-[var(--color-m3-accent-light)] text-[var(--color-m3-on-accent)]'
                                    : 'bg-[var(--color-m3-primary)] dark:bg-teal-600 text-[var(--color-m3-on-primary)]'
                                }`}
                        >
                            <Download size={16} />
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
