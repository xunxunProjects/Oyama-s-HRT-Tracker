import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';
import ExportSection from '../components/ExportSection';
import { DoseEvent, LabResult } from '../../logic';

interface ExportSettingsProps {
    events: DoseEvent[];
    labResults: LabResult[];
    weight: number;
    onExport: (encrypt: boolean, password?: string) => Promise<string | null>;
    onQuickExport: () => void;
    onBack: () => void;
}

const ExportSettings: React.FC<ExportSettingsProps> = ({ events, labResults, weight, onExport, onQuickExport, onBack }) => {
    const { t } = useTranslation();

    return (
        <div className="relative space-y-4 pb-32">
            <div className="sticky top-0 z-20 bg-[var(--color-m3-surface-dim)] dark:bg-[var(--color-m3-dark-surface)] px-6 md:px-8 pt-8 pb-3">
                <button
                    onClick={onBack}
                    className="flex items-center gap-3 -ml-2 px-2 py-1.5 rounded-lg hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)]"
                >
                    <ArrowLeft size={18} className="text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] shrink-0" />
                    <span className="text-xl font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">
                        {t('export.title')}
                    </span>
                </button>
            </div>

            <div className="px-6 md:px-8 max-w-2xl">
                <ExportSection
                    events={events}
                    labResults={labResults}
                    weight={weight}
                    onExport={onExport}
                    onQuickExport={onQuickExport}
                />
            </div>
        </div>
    );
};

export default ExportSettings;
