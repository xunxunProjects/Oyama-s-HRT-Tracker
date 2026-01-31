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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-50 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-zinc-900 rounded-t-[32px] md:rounded-[24px] shadow-xl border border-zinc-200 dark:border-zinc-800 w-full max-w-lg md:max-w-2xl p-6 md:p-8 flex flex-col max-h-[90vh] animate-in slide-in-from-bottom duration-300 safe-area-pb transition-colors duration-300">
                <div className="flex justify-between items-center mb-6 shrink-0">
                    <h3 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">{t('import.title')}</h3>
                    <button onClick={onClose} className="p-2.5 bg-zinc-100 dark:bg-zinc-800 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 transition">
                        <X size={20} className="text-zinc-500 dark:text-zinc-400" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0">
                    <div className="space-y-6">
                        <div>
                            <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-3 pl-1">{t('import.text')}</label>
                            <textarea
                                className="w-full h-40 p-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 outline-none font-mono text-xs text-zinc-900 dark:text-white resize-none transition-all placeholder:text-zinc-400"
                                placeholder={t('import.paste_hint')}
                                value={text}
                                onChange={e => setText(e.target.value)}
                            />
                            <button
                                onClick={handleTextImport}
                                disabled={!text.trim()}
                                className="mt-4 w-full py-3.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold rounded-full hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg shadow-zinc-900/5 dark:shadow-zinc-100/5"
                            >
                                {t('drawer.import')}
                            </button>
                        </div>

                        <div className="relative flex py-2 items-center">
                            <div className="flex-grow border-t border-zinc-200 dark:border-zinc-800"></div>
                            <span className="flex-shrink-0 mx-4 text-zinc-400 text-xs uppercase font-bold tracking-widest">OR</span>
                            <div className="flex-grow border-t border-zinc-200 dark:border-zinc-800"></div>
                        </div>

                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full py-4 border-2 border-dashed border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 font-bold rounded-2xl hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:text-zinc-700 dark:hover:text-zinc-200 transition flex items-center justify-center gap-3 group"
                        >
                            <div className="p-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg group-hover:bg-white dark:group-hover:bg-zinc-700 transition-colors">
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
