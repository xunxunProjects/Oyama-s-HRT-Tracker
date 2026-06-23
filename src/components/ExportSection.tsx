import React, { useState } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { DoseEvent, LabResult } from '../../logic';
import { Lock, Copy, Check } from 'lucide-react';
import { exportToCSV, exportToPDF } from '../services/export';

interface ExportSectionProps {
    events: DoseEvent[];
    labResults: LabResult[];
    weight: number;
    onExport: (encrypt: boolean, password?: string) => Promise<string | null>;
    onQuickExport?: () => void;
}

const rowBase = "flex items-start justify-between py-[18px] border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]";
const rowLabel = "text-[15px] text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]";
const rowDesc = "text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] mt-0.5";
const actionBtn = "text-sm font-medium text-[var(--color-m3-primary)] dark:text-[var(--color-m3-primary-light)] shrink-0 ml-6 mt-0.5";

const ExportSection: React.FC<ExportSectionProps> = ({ events, labResults, weight, onExport, onQuickExport }) => {
    const { t, lang } = useTranslation();
    const [showEncrypted, setShowEncrypted] = useState(false);
    const [password, setPassword] = useState('');
    const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [jsonCopied, setJsonCopied] = useState(false);

    const hasData = events.length > 0 || labResults.length > 0;

    const handleJsonExport = async () => {
        await onExport(false);
    };

    const handleEncryptedExport = async () => {
        const pw = await onExport(true, password || undefined);
        if (pw) setGeneratedPassword(pw);
    };

    const handleCopyPassword = () => {
        if (!generatedPassword) return;
        navigator.clipboard.writeText(generatedPassword);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleCopyJson = () => {
        if (onQuickExport) {
            onQuickExport();
            setJsonCopied(true);
            setTimeout(() => setJsonCopied(false), 2000);
        }
    };

    const handleCsvExport = () => {
        const csv = exportToCSV({ events, labResults, weight, lang, t });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `hrt-data-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    if (!hasData) {
        return (
            <p className="py-8 text-sm text-center text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                {t('drawer.empty_export')}
            </p>
        );
    }

    return (
        <div>
            {/* JSON */}
            <div className={rowBase}>
                <div>
                    <p className={rowLabel}>JSON</p>
                    <p className={rowDesc}>{t('drawer.save_hint')}</p>
                </div>
                <button onClick={handleJsonExport} className={actionBtn}>
                    {t('export.btn_json')}
                </button>
            </div>

            {/* Copy JSON */}
            {onQuickExport && (
                <div className={rowBase}>
                    <div>
                        <p className={rowLabel}>{t('export.btn_copy_json')}</p>
                        <p className={rowDesc}>{t('export.copy_desc')}</p>
                    </div>
                    <button onClick={handleCopyJson} className={`${actionBtn} flex items-center gap-1`}>
                        {jsonCopied
                            ? <><Check size={13} />{t('export.copied')}</>
                            : <><Copy size={13} />{t('btn.copy')}</>
                        }
                    </button>
                </div>
            )}

            {/* Encrypted JSON */}
            <div className={rowBase}>
                <div className="flex-1">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className={rowLabel}>{`JSON (${t('export.encrypt_label')})`}</p>
                            <p className={rowDesc}>{t('export.encrypt_ask_desc')}</p>
                        </div>
                        <button
                            onClick={() => { setShowEncrypted(v => !v); setGeneratedPassword(null); }}
                            className={actionBtn}
                        >
                            {showEncrypted ? t('btn.cancel') : t('export.btn_encrypted')}
                        </button>
                    </div>

                    {showEncrypted && (
                        <div className="mt-4 space-y-3">
                            <div className="relative">
                                <input
                                    type="password"
                                    name="export-encryption-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder={t('export.password_placeholder')}
                                    className="w-full py-2.5 px-3 pl-9 text-sm bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container-low)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] rounded-lg outline-none focus:border-[var(--color-m3-primary)] text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] placeholder:text-[var(--color-m3-on-surface-variant)]"
                                    autoComplete="new-password"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                />
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-m3-on-surface-variant)]" size={14} />
                            </div>
                            <p className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                                {t('export.password_hint_random')}
                            </p>
                            <button
                                onClick={handleEncryptedExport}
                                className="w-full py-2.5 text-sm font-medium bg-[var(--color-m3-primary)] hover:opacity-90 text-white rounded-lg"
                            >
                                {t('export.btn_encrypted')}
                            </button>

                            {generatedPassword && (
                                <div className="mt-2 border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] rounded-lg p-3 space-y-2">
                                    <p className="text-xs font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">
                                        {t('export.password_title')}
                                    </p>
                                    <p className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                                        {t('export.password_desc')}
                                    </p>
                                    <div className="flex items-center gap-2 bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container)] rounded-md px-3 py-2">
                                        <span className="font-mono text-sm text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] flex-1 select-all break-all">
                                            {generatedPassword}
                                        </span>
                                        <button onClick={handleCopyPassword} className="shrink-0 p-1">
                                            {copied
                                                ? <Check size={14} className="text-emerald-500" />
                                                : <Copy size={14} className="text-[var(--color-m3-on-surface-variant)]" />}
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => { setGeneratedPassword(null); setShowEncrypted(false); }}
                                        className="w-full py-1.5 text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]"
                                    >
                                        {t('btn.ok')}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* CSV */}
            <div className={rowBase}>
                <div>
                    <p className={rowLabel}>CSV</p>
                    <p className={rowDesc}>{t('export.csv_desc')}</p>
                </div>
                <button onClick={handleCsvExport} className={actionBtn}>
                    {t('export.btn_csv')}
                </button>
            </div>

            {/* PDF */}
            <div className={`${rowBase} border-b-0`}>
                <div>
                    <p className={rowLabel}>PDF</p>
                    <p className={rowDesc}>{t('export.pdf_desc')}</p>
                </div>
                <button
                    onClick={() => exportToPDF({ events, labResults, weight, lang, t })}
                    className={actionBtn}
                >
                    {t('export.btn_pdf')}
                </button>
            </div>
        </div>
    );
};

export default ExportSection;
