import React from 'react';
import { ArrowLeft, Download } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';
import ImportSection from '../components/ImportSection';

interface ImportSettingsProps {
    onImportJson: (text: string) => boolean | Promise<boolean>;
    onBack: () => void;
}

const ImportSettings: React.FC<ImportSettingsProps> = ({ onImportJson, onBack }) => {
    const { t } = useTranslation();

    return (
        <div className="relative space-y-4 pt-6 pb-32">
            <div className="px-6 md:px-8 mb-2">
                <div className="w-full p-4 rounded-lg bg-white dark:bg-neutral-900 flex items-center gap-3 border border-gray-200 dark:border-neutral-800">
                    <button
                        onClick={onBack}
                        className="p-1.5 rounded-lg transition-colors text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-800"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-md bg-violet-50 dark:bg-violet-900/20">
                            <Download size={18} className="text-violet-500 dark:text-violet-400" />
                        </div>
                        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 leading-tight">
                            {t('import.title')}
                        </h2>
                    </div>
                </div>
            </div>

            <div className="mx-6 md:mx-8">
                <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 p-4 text-sm">
                    <ImportSection onImportJson={onImportJson} />
                </div>
            </div>
        </div>
    );
};

export default ImportSettings;
