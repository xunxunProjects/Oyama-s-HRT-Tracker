import React from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';

import { useTranslation } from '../contexts/LanguageContext';
import ImportSection from '../components/ImportSection';

interface ImportSettingsProps {
    onImportJson: (text: string) => boolean | Promise<boolean>;
    onBack: () => void;
    /** Opens Export, so a backup can be made before an import replaces things. */
    onNavigateToExport?: () => void;
}

const ImportSettings: React.FC<ImportSettingsProps> = ({ onImportJson, onBack, onNavigateToExport }) => {
    const { t } = useTranslation();

    return (
        <div className="relative space-y-4 pb-32">
            <PageHeader onBack={onBack} title={t('import.title')} />

            <div className={PAGE_COLUMN}>
                {/* Said before a file is chosen, not only in the confirm after:
                    an import replaces, it doesn't add, and the way to keep what
                    is here is to export it first. */}
                <div className="callout mt-1 mb-2">
                    {t('import.replace_note')}
                    {onNavigateToExport && (
                        <>
                            {' '}
                            <button
                                type="button"
                                onClick={onNavigateToExport}
                                className="tap-target font-medium text-[var(--accent-ink)] underline underline-offset-2"
                            >
                                {t('import.export_first')}
                            </button>
                        </>
                    )}
                </div>
                <ImportSection onImportJson={onImportJson} />
            </div>
        </div>
    );
};

export default ImportSettings;
