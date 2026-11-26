import Tabs from '../../components/Tabs';
import { useTranslation } from '../../contexts/LanguageContext';
import { PAGE_COLUMN } from '../../components/PageHeader';

export type JournalPanel = 'history' | 'history-stats' | 'history-weight';

const ORDER: readonly JournalPanel[] = ['history', 'history-stats', 'history-weight'];

/**
 * The Journal's three panels as tabs straight under its title, as Oyama
 * Journal sets its Log, Stats and Weight: a strip across the column that the
 * form opening below never moves.
 */
export function JournalTabs({ value, onChange }: { value: JournalPanel; onChange: (v: JournalPanel) => void }) {
    const { t } = useTranslation();
    const label: Record<JournalPanel, string> = {
        history: t('journal.tab.log'),
        'history-stats': t('journal.tab.stats'),
        'history-weight': t('journal.tab.weight'),
    };
    return (
        <div className={`${PAGE_COLUMN} mt-3`}>
            <Tabs
                tabs={ORDER.map(id => ({ id, label: label[id] }))}
                value={value}
                onChange={onChange}
                className="mb-2"
            />
        </div>
    );
}

export default JournalTabs;
