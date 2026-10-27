import React, { useState, useRef } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { ChevronDown, ChevronUp } from './icons';
import { settingsSection, rowBleed } from './SettingsListItem';

interface ImportSectionProps {
    onImportJson: (text: string) => boolean | Promise<boolean>;
    /** Replace every record and the calibration, not merge. */
    onReplaceJson: (text: string) => boolean | Promise<boolean>;
}

// Each row is one button, so the whole row takes the tap (as on Export).
const rowBase = 'w-full flex items-start justify-between py-[18px] text-start';
const rowLabel = 'block text-[0.9375rem] text-[var(--text)]';
const rowDesc = 'block text-xs text-[var(--text-muted)] mt-0.5';
const action = 'text-sm font-medium text-[var(--accent-ink)] shrink-0 ml-6 mt-0.5';

const ImportSection: React.FC<ImportSectionProps> = ({ onImportJson, onReplaceJson }) => {
    const { t } = useTranslation();
    const [showPaste, setShowPaste] = useState(false);
    const [text, setText] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const replaceFileInputRef = useRef<HTMLInputElement>(null);

    const readFile = (e: React.ChangeEvent<HTMLInputElement>, run: (text: string) => unknown) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
            await run(reader.result as string);
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        void readFile(e, onImportJson);
    };

    const handleReplaceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        void readFile(e, onReplaceJson);
    };

    // The pasted text stays when the import doesn't go through (a Cancel at
    // "replace your records?", or a file it can't read), so it can be fixed
    // or tried again without pasting it all over.
    const handleTextImport = async () => {
        if (!(await onImportJson(text))) return;
        setText('');
        setShowPaste(false);
    };

    const handleTextReplace = async () => {
        if (!(await onReplaceJson(text))) return;
        setText('');
        setShowPaste(false);
    };

    return (
        <div className={settingsSection}>
            {/* File import */}
            <button onClick={() => fileInputRef.current?.click()} className={`${rowBase} ${rowBleed}`}>
                <span className={rowLabel}>{t('import.file')}</span>
                <span className={action}>{t('import.file_btn')}</span>
            </button>

            {/* Replace from a complete backup. Deliberately separate from the
                merge import: this is the only action that clears categories. */}
            <button onClick={() => replaceFileInputRef.current?.click()} className={`${rowBase} ${rowBleed}`}>
                <span>
                    <span className="block text-[0.9375rem] text-[var(--danger)]">
                        {t('import.replace_complete_row')}
                    </span>
                    <span className={rowDesc}>{t('import.replace_complete_desc')}</span>
                </span>
                <span className="text-sm font-medium text-[var(--danger)] shrink-0 ml-6 mt-0.5">
                    {t('import.replace_complete_file_btn')}
                </span>
            </button>

            {/* Paste JSON */}
            <div>
                <button
                    onClick={() => {
                        setShowPaste(v => !v);
                        setText('');
                    }}
                    aria-expanded={showPaste}
                    className={`${rowBase} ${rowBleed}`}
                >
                    <span>
                        <span className={rowLabel}>{t('import.text')}</span>
                        <span className={rowDesc}>{t('import.paste_hint')}</span>
                    </span>
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
                        <div className="flex justify-end gap-2">
                            {/* Red is for the confirm that follows, not the way to it. */}
                            <button onClick={handleTextReplace} disabled={!text.trim()} className="btn-secondary">
                                {t('import.replace_complete_paste_btn')}
                            </button>
                            <button onClick={handleTextImport} disabled={!text.trim()} className="btn-primary">
                                {/* Plain "Import": the text can hold labs, weight and
                                    parameters as well as doses. */}
                                {t('import.btn')}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Never shown, so it draws no divider of its own. */}
            <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={handleFileChange}
            />
            <input
                ref={replaceFileInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={handleReplaceFileChange}
            />
        </div>
    );
};

export default ImportSection;
