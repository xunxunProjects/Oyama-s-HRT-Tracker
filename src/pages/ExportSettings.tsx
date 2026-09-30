import React from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';

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
            <PageHeader onBack={onBack} title={t('export.title')} />

            <div className={PAGE_COLUMN}>
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
