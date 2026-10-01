import React, { useState, useRef } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface ImportSectionProps {
    onImportJson: (text: string) => boolean | Promise<boolean>;
}

const rowBase = "flex items-start justify-between py-[18px] border-b border-[var(--border)]";
const rowLabel = "text-[0.9375rem] text-[var(--text)]";
const rowDesc = "text-xs text-[var(--text-muted)] mt-0.5";
const actionBtn = "text-sm font-medium text-[var(--accent-ink)] shrink-0 ml-6 mt-0.5";

const ImportSection: React.FC<ImportSectionProps> = ({ onImportJson }) => {
    const { t } = useTranslation();
    const [showPaste, setShowPaste] = useState(false);
    const [text, setText] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
            await onImportJson(reader.result as string);
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const handleTextImport = async () => {
        await onImportJson(text);
        setText('');
        setShowPaste(false);
    };

    return (
        <div>
            {/* File import */}
            <div className={rowBase}>
                <div>
                    <p className={rowLabel}>{t('import.file')}</p>
                </div>
                <button onClick={() => fileInputRef.current?.click()} className={actionBtn}>
                    {t('import.file_btn')}
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={handleFileChange}
                />
            </div>

            {/* Paste JSON */}
            <div className="border-b border-[var(--border)] last:border-b-0">
                <button
                    onClick={() => { setShowPaste(v => !v); setText(''); }}
                    className="w-full flex items-start justify-between py-[18px] text-start"
                >
                    <div>
                        <p className={rowLabel}>{t('import.text')}</p>
                        <p className={rowDesc}>{t('import.paste_hint')}</p>
                    </div>
                    <span className="shrink-0 ml-6 mt-0.5 p-1 text-[var(--text-muted)]">
                        {showPaste ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </span>
                </button>

                {showPaste && (
                    <div className="pb-4 space-y-3">
                        <textarea
                            className="w-full h-28 p-3 bg-[var(--field)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--border-strong)] font-mono text-[var(--text)] placeholder:text-[var(--text-muted)] resize-none"
                            style={{ fontSize: '16px' }}
                            placeholder={t('import.paste_hint')}
                            value={text}
                            onChange={e => setText(e.target.value)}
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                        />
                        <div className="flex justify-end">
                            <button
                                onClick={handleTextImport}
                                disabled={!text.trim()}
                                className="btn-primary"
                            >
                                {t('drawer.import')}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ImportSection;
