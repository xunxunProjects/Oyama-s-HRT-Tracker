import { Busy } from './icons';
import { useTranslation } from '../contexts/LanguageContext';

const PageLoading = () => {
    const { t } = useTranslation();
    return (
        <div role="status" className="flex-1 flex items-center justify-center p-8 text-[var(--text-muted)]">
            <Busy size={24} className="animate-spin" aria-hidden="true" />
            <span className="sr-only">{t('common.loading')}</span>
        </div>
    );
};

export default PageLoading;
