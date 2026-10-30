import React from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';

import { useTranslation } from '../contexts/LanguageContext';
import ImportSection from '../components/ImportSection';

interface ImportSettingsProps {
    onImportJson: (text: string) => boolean | Promise<boolean>;
    /** Replace the whole device from a complete bundle, through the crash journal. */
    onReplaceJson: (text: string) => boolean | Promise<boolean>;
    onBack: () => void;
    /** Opens Export, so a backup can be made before a regular import replaces things. */
    onNavigateToExport?: () => void;
}

// No space after a CJK full stop, which carries its own.
const gapAfter = (sentence: string) => (/[。！？]$/.test(sentence) ? '' : ' ');

const ImportSettings: React.FC<ImportSettingsProps> = ({ onImportJson, onReplaceJson, onBack, onNavigateToExport }) => {
    const { t } = useTranslation();
    const replaceNote = t('import.replace_note');
    const completeNote = t('import.complete_note');

    return (
        <div className="relative space-y-4 md:pb-32">
            <PageHeader onBack={onBack} title={t('import.title')} />

            <div className={PAGE_COLUMN}>
                {/* Said before a file is chosen, not only in the confirm after:
                    a regular record import replaces, while a complete backup
                    merges. The way to keep what is here is to export it first. */}
                <div className="callout mt-1 mb-2">
                    {replaceNote}
                    {gapAfter(replaceNote)}
                    {completeNote}
                    {onNavigateToExport && (
                        <>
                            {gapAfter(completeNote)}
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
                <ImportSection onImportJson={onImportJson} onReplaceJson={onReplaceJson} />
            </div>
        </div>
    );
};

export default ImportSettings;
