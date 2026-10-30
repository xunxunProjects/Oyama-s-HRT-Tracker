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
    /** Resolves to false when the clipboard write failed (see ExportSection). */
    onQuickExport: () => void | boolean | Promise<void | boolean>;
    /** Plaintext complete-device bundle; encryption belongs to the Tools workflow. */
    onExportCompleteBackup: () => void;
    onBack: () => void;
}

const ExportSettings: React.FC<ExportSettingsProps> = ({
    events,
    labResults,
    weight,
    onExport,
    onQuickExport,
    onExportCompleteBackup,
    onBack,
}) => {
    const { t } = useTranslation();

    return (
        <div className="relative space-y-4 md:pb-32">
            <PageHeader onBack={onBack} title={t('export.title')} />

            <div className={PAGE_COLUMN}>
                <ExportSection
                    events={events}
                    labResults={labResults}
                    weight={weight}
                    onExport={onExport}
                    onQuickExport={onQuickExport}
                    onExportCompleteBackup={onExportCompleteBackup}
                />
            </div>
        </div>
    );
};

export default ExportSettings;
