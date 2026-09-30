import React from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';

import { useTranslation } from '../contexts/LanguageContext';
import ImportSection from '../components/ImportSection';

interface ImportSettingsProps {
    onImportJson: (text: string) => boolean | Promise<boolean>;
    onBack: () => void;
}

const ImportSettings: React.FC<ImportSettingsProps> = ({ onImportJson, onBack }) => {
    const { t } = useTranslation();

    return (
        <div className="relative space-y-4 pb-32">
            <PageHeader onBack={onBack} title={t('import.title')} />

            <div className={PAGE_COLUMN}>
                <ImportSection onImportJson={onImportJson} />
            </div>
        </div>
    );
};

export default ImportSettings;
