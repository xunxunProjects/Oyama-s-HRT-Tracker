import { useMemo } from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import { MedRow } from '../components/MedRow';
import { useTranslation } from '../contexts/LanguageContext';
import { useHRTMode } from '../contexts/HRTModeContext';
import { KIND_ORDER, medsFor, type Med, type MedKind } from '../data/meds';
import { fill } from '../utils/regimenText';

/** One kind of medicine, as Oyama Journal lists one kind of substance: what
 *  the kind is, then each in it as a row. */
const Kind = ({
    kind,
    onOpenMed,
    onBack,
}: {
    kind: string | undefined;
    onOpenMed: (med: Med) => void;
    onBack: () => void;
}) => {
    const { t } = useTranslation();
    const { mode } = useHRTMode();
    const known = KIND_ORDER.find(k => k === kind) as MedKind | undefined;
    const list = useMemo(() => (known ? medsFor(mode).filter(m => m.kind === known) : []), [mode, known]);

    return (
        <>
            <PageHeader
                title={known ? t(`kind.${known}.many`) : t('nav.search')}
                subtitle={known ? fill(t('kind.count'), { n: list.length }) : undefined}
                onBack={onBack}
            />
            <div className={`${PAGE_COLUMN} pb-8 md:pb-32`}>
                {known && <p className="text-sm text-[var(--text-muted)] mb-4">{t(`kind.${known}.blurb`)}</p>}
                {list.length ? (
                    <div className="settings-section">
                        {list.map(m => (
                            <MedRow key={m.id} med={m} onOpen={onOpenMed} />
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-[var(--text-muted)]">{t('kind.none')}</p>
                )}
            </div>
        </>
    );
};

export default Kind;
