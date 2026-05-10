import React from 'react';
import { ArrowLeft, Upload } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';
import ExportSection from '../components/ExportSection';
import { DoseEvent, LabResult } from '../../logic';

interface ExportSettingsProps {
    events: DoseEvent[];
    labResults: LabResult[];
    weight: number;
    onExport: (encrypt: boolean, password?: string) => Promise<string | null>;
    onBack: () => void;
}

const ExportSettings: React.FC<ExportSettingsProps> = ({ events, labResults, weight, onExport, onBack }) => {
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
                        <div className="p-2 rounded-md bg-pink-50 dark:bg-pink-900/20">
                            <Upload size={18} className="text-pink-500 dark:text-pink-400" />
                        </div>
                        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 leading-tight">
                            {t('export.title')}
                        </h2>
                    </div>
                </div>
            </div>

            <div className="mx-6 md:mx-8">
                <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 p-4 text-sm">
                    <ExportSection
                        events={events}
                        labResults={labResults}
                        weight={weight}
                        onExport={onExport}
                    />
                </div>
            </div>
        </div>
    );
};

export default ExportSettings;
