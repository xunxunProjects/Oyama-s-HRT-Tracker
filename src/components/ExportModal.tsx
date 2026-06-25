import React, { useState } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { DoseEvent, LabResult } from '../../logic';
import { X, Download, ShieldCheck, FileJson, Lock, FileText } from 'lucide-react';
import { exportToCSV, exportToPDF } from '../services/export';
import CustomSelect from './CustomSelect';
import { useEscape } from '../hooks/useEscape';

const ExportModal = ({ isOpen, onClose, onExport, events, labResults, weight }: { isOpen: boolean, onClose: () => void, onExport: (encrypt: boolean, password?: string) => void, events: DoseEvent[], labResults: LabResult[], weight: number }) => {
    const { t, lang } = useTranslation();
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
            icon: <FileJson size={18} className="text-muted" />
        },
        {
            value: 'encrypted',
            label: `JSON (${t('export.encrypt_label')})`,
            icon: <ShieldCheck size={18} className="text-muted" />
        }
    ];

    return (
        <div className="modal-overlay">
            <div className="modal-shell">
            <div className="modal-card overflow-hidden p-0 flex flex-col max-h-[85vh]">

                {/* Header */}
                <div className="px-5 pt-5 pb-2 shrink-0 flex justify-between items-start">
                    <div>
                        <h3 className="modal-title mb-0">{t('export.title')}</h3>
                        {hasData && (
                            <p className="text-xs text-muted mt-1">
                                {t('export.summary').replace('{doses}', events.length.toString()).replace('{labs}', labResults.length.toString())}
                            </p>
                        )}
                    </div>
                    <button onClick={onClose} className="p-1 text-muted hover:text-body">
                        <X size={18} />
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto min-h-0 px-5 space-y-4">
                    {hasData ? (
                        <>
                            <div className="space-y-2">
                                <label className="text-sm text-muted">
                                    {t('export.format_label')}
                                </label>
                                <CustomSelect
                                    value={exportMode}
                                    onChange={(val) => setExportMode(val as 'json' | 'encrypted')}
                                    options={exportOptions}
                                />
                                <p className="text-xs text-muted">
                                    {exportMode === 'json' ? t('drawer.save_hint') : t('export.encrypt_ask_desc')}
                                </p>
                            </div>

                            {exportMode === 'encrypted' && (
                                <div className="space-y-2 pb-2">
                                    <label className="text-sm text-muted">
                                        {t('export.password_label')}
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder={t('export.password_placeholder')}
                                            className="input-base pl-9"
                                        />
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
                                    </div>
                                    <p className="text-xs text-muted leading-relaxed">
                                        {t('export.password_hint_random')}
                                    </p>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-muted gap-3">
                            <FileJson size={28} strokeWidth={1.5} />
                            <p className="text-sm">{t('drawer.empty_export')}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {hasData && (
                    <div className="px-5 pb-5 pt-3 shrink-0">
                        <div className="grid grid-cols-2 gap-2 mb-3">
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
                                className="btn-secondary flex-col py-3 gap-1.5"
                            >
                                <FileText size={18} className="text-muted" />
                                <span className="text-xs">CSV</span>
                            </button>
                            <button
                                onClick={() => exportToPDF({ events, labResults, weight, lang, t })}
                                className="btn-secondary flex-col py-3 gap-1.5"
                            >
                                <FileText size={18} className="text-muted" />
                                <span className="text-xs">PDF</span>
                            </button>
                        </div>

                        <button onClick={handleExport} className="btn-primary w-full">
                            <Download size={16} />
                            <span>
                                {exportMode === 'encrypted' ? t('export.btn_encrypted') : t('export.btn_json')}
                            </span>
                        </button>
                    </div>
                )}
            </div>
            </div>
        </div>
    );
};

export default ExportModal;
