import React, { useState, useRef } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { Upload } from 'lucide-react';

interface ImportSectionProps {
    onImportJson: (text: string) => boolean | Promise<boolean>;
}

const ImportSection: React.FC<ImportSectionProps> = ({ onImportJson }) => {
    const { t } = useTranslation();
    const [text, setText] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleJsonFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
            const content = reader.result as string;
            await onImportJson(content);
        };
        reader.readAsText(file);
        e.target.value = "";
    };

    const handleTextImport = async () => {
        await onImportJson(text);
        setText("");
    };

    return (
        <div className="flex flex-col space-y-4 pt-1 pb-1">
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 ml-1">
                        {t('import.text')}
                    </label>
                    <textarea
                        className="w-full h-24 p-3 text-sm bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 outline-none font-mono text-gray-900 dark:text-gray-100 placeholder:text-gray-400 resize-none transition-all"
                        placeholder={t('import.paste_hint')}
                        value={text}
                        onChange={e => setText(e.target.value)}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                    />
                    <button
                        onClick={handleTextImport}
                        disabled={!text.trim()}
                        className="mt-3 w-full py-2.5 text-sm bg-pink-500 hover:bg-pink-600 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
                    >
                        {t('drawer.import')}
                    </button>
                </div>

                <div className="relative flex items-center py-1">
                    <div className="flex-grow border-t border-gray-100 dark:border-neutral-800"></div>
                    <span className="flex-shrink-0 mx-3 text-gray-300 dark:text-gray-600 text-[10px] uppercase font-bold tracking-widest">OR</span>
                    <div className="flex-grow border-t border-gray-100 dark:border-neutral-800"></div>
                </div>

                <div className="pb-1">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-3.5 text-sm border-2 border-dashed border-gray-200 dark:border-neutral-700 text-gray-500 dark:text-gray-400 font-semibold rounded-lg hover:border-pink-500 dark:hover:border-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/10 hover:text-pink-600 dark:hover:text-pink-400 transition flex items-center justify-center gap-2 group"
                    >
                        <Upload size={18} className="transition-transform group-hover:-translate-y-0.5" />
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
    );
};

export default ImportSection;
