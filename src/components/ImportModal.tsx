import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { X, Upload } from 'lucide-react';
import { useEscape } from '../hooks/useEscape';

const ImportModal = ({ isOpen, onClose, onImportJson }: { isOpen: boolean; onClose: () => void; onImportJson: (text: string) => boolean | Promise<boolean> }) => {
    const { t } = useTranslation();
    const [text, setText] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEscape(onClose, isOpen);

    useEffect(() => {
        if (isOpen) {
            setText("");
        }
    }, [isOpen]);

    const handleJsonFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
            const content = reader.result as string;
            if (await onImportJson(content)) {
                onClose();
            }
        };
        reader.readAsText(file);
        e.target.value = "";
    };

    const handleTextImport = async () => {
        if (await onImportJson(text)) {
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200 p-6">
            <div className="bg-[var(--color-m3-surface-container-high)] dark:bg-[var(--color-m3-dark-surface-container-high)] rounded-[var(--radius-xl)] shadow-[var(--shadow-m3-3)] w-full max-w-sm p-6 flex flex-col max-h-[85vh] animate-m3-decelerate safe-area-pb transition-colors duration-300">
                <div className="flex justify-between items-center mb-4 shrink-0">
                    <h3 className="font-display text-base font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] tracking-tight">{t('import.title')}</h3>
                    <button onClick={onClose} className="p-1.5 rounded-[var(--radius-full)] hover:bg-[var(--color-m3-surface-container-highest)] dark:hover:bg-[var(--color-m3-dark-surface-container-highest)] transition">
                        <X size={18} className="text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] uppercase tracking-wider mb-2 pl-1">{t('import.text')}</label>
                            <textarea
                                className="w-full h-28 p-3 text-sm bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] rounded-[var(--radius-md)] focus:ring-2 focus:ring-[var(--color-m3-primary-container)] focus:border-[var(--color-m3-primary)] dark:focus:border-teal-400 outline-none font-mono text-xs text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] resize-none transition-all placeholder:text-[var(--color-m3-outline)]"
                                placeholder={t('import.paste_hint')}
                                value={text}
                                onChange={e => setText(e.target.value)}
                            />
                            <button
                                onClick={handleTextImport}
                                disabled={!text.trim()}
                                className="mt-3 w-full py-2.5 text-sm bg-[var(--color-m3-primary)] dark:bg-teal-600 text-[var(--color-m3-on-primary)] font-bold rounded-[var(--radius-full)] disabled:opacity-50 disabled:cursor-not-allowed transition shadow-[var(--shadow-m3-1)]"
                            >
                                {t('drawer.import')}
                            </button>
                        </div>

                        <div className="relative flex py-2 items-center">
                            <div className="flex-grow border-t border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]"></div>
                            <span className="flex-shrink-0 mx-4 text-[var(--color-m3-outline)] dark:text-[var(--color-m3-dark-outline)] text-xs uppercase font-bold tracking-widest">OR</span>
                            <div className="flex-grow border-t border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]"></div>
                        </div>

                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full py-3 text-sm border-2 border-dashed border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] font-bold rounded-[var(--radius-md)] hover:border-[var(--color-m3-primary)] dark:hover:border-teal-400 hover:bg-[var(--color-m3-primary-container)]/30 dark:hover:bg-teal-900/20 hover:text-[var(--color-m3-primary)] dark:hover:text-teal-400 transition flex items-center justify-center gap-2 group"
                        >
                            <div className="p-1.5 bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container-high)] rounded-[var(--radius-sm)] group-hover:bg-[var(--color-m3-primary-container)] dark:group-hover:bg-teal-900/30 transition-colors">
                                <Upload size={18} />
                            </div>
                            {t('import.file_btn')}
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="application/json"
                            className="hidden"
                            onChange={handleJsonFileChange}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ImportModal;
