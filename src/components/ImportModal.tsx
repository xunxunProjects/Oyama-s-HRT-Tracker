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
        <div className="modal-overlay p-4">
            <div className="modal-shell">
                <div className="modal-card flex flex-col max-h-[85vh]">
                    <div className="flex justify-between items-center mb-4 shrink-0">
                        <h3 className="modal-title mb-0">{t('import.title')}</h3>
                        <button onClick={onClose} className="p-1 text-muted hover:text-body">
                            <X size={18} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto min-h-0">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs text-muted mb-2">{t('import.text')}</label>
                                <textarea
                                    className="input-base h-28 font-mono text-xs resize-none"
                                    placeholder={t('import.paste_hint')}
                                    value={text}
                                    onChange={e => setText(e.target.value)}
                                />
                                <button
                                    onClick={handleTextImport}
                                    disabled={!text.trim()}
                                    className="btn-primary w-full mt-3"
                                >
                                    {t('drawer.import')}
                                </button>
                            </div>

                            <div className="relative flex py-1 items-center">
                                <div className="flex-grow border-t border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]" />
                                <span className="flex-shrink-0 mx-3 text-xs text-muted uppercase">or</span>
                                <div className="flex-grow border-t border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]" />
                            </div>

                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="btn-secondary w-full py-3 border-dashed"
                            >
                                <Upload size={16} />
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
        </div>
    );
};

export default ImportModal;
