import React from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import { useTranslation } from '../contexts/LanguageContext';

/**
 * What the estimates are and aren't, as a page of Settings. It used to open
 * as a dialog over Settings, the one piece of reading in the app that did.
 */
const Disclaimer: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { t } = useTranslation();
    return (
        <div className="md:pb-32">
            <PageHeader title={t('disclaimer.title')} onBack={onBack} />
            <div className={`${PAGE_COLUMN} mt-3 space-y-4 text-sm leading-relaxed`}>
                <p className="text-[var(--text)]">{t('disclaimer.text.intro')}</p>
                <ul className="list-disc ps-5 space-y-3 text-[var(--text-muted)] marker:text-[var(--border-strong)]">
                    <li>{t('disclaimer.text.point1')}</li>
                    <li>{t('disclaimer.text.point2')}</li>
                    <li>{t('disclaimer.text.point3')}</li>
                </ul>
            </div>
        </div>
    );
};

export default Disclaimer;
