import { useEffect, useMemo, useRef, useState } from 'react';
import PixelCat from '../components/PixelCat';
import PageHeader, { PAGE_COLUMN, headerAction } from '../components/PageHeader';
import { SearchField, listKeys } from '../components/SearchField';
import { MedRow } from '../components/MedRow';
import { rowBleed } from '../components/SettingsListItem';
import { ChevronRight } from '../components/icons';
import { useTranslation } from '../contexts/LanguageContext';
import { useHRTMode } from '../contexts/HRTModeContext';
import { usePixelCats } from '../contexts/PixelCatContext';
import {
    KIND_ORDER,
    OFTEN,
    clearRecent,
    medName,
    medsFor,
    readRecent,
    searchMeds,
    type Med,
    type MedKind,
} from '../data/meds';
import { fill } from '../utils/regimenText';

/** The kinds as rows: what each is, and how many there are. */
export function KindList({ meds, onOpenKind }: { meds: Med[]; onOpenKind: (kind: MedKind) => void }) {
    const { t } = useTranslation();
    const counts = useMemo(() => {
        const m = new Map<MedKind, number>();
        meds.forEach(e => m.set(e.kind, (m.get(e.kind) ?? 0) + 1));
        return m;
    }, [meds]);
    return (
        <div className="settings-section">
            {KIND_ORDER.filter(k => counts.get(k)).map(k => (
                <button
                    key={k}
                    type="button"
                    onClick={() => onOpenKind(k)}
                    className={`w-full min-h-14 flex items-center gap-3 py-3 text-start text-[var(--text)] ${rowBleed}`}
                >
                    <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium">{t(`kind.${k}.many`)}</span>
                    </span>
                    <span className="text-xs text-[var(--text-muted)] tabular-nums">{counts.get(k)}</span>
                    <ChevronRight size={18} className="shrink-0 text-[var(--text-muted)] opacity-70 rtl:-scale-x-100" />
                </button>
            ))}
        </div>
    );
}

/**
 * Search, as Oyama Journal opens on it: the field, and under it what was
 * looked at lately (or the ones most looked up, before there is any), then
 * every kind of medicine. Typing replaces all that with answers, found by
 * name, by what a medicine is sold as, or by its code.
 */
const Search = ({ onOpenMed, onOpenKind }: { onOpenMed: (med: Med) => void; onOpenKind: (kind: MedKind) => void }) => {
    const { t } = useTranslation();
    const { mode } = useHRTMode();
    const { showCats } = usePixelCats();
    const meds = useMemo(() => medsFor(mode), [mode]);
    const [q, setQ] = useState('');
    const [active, setActive] = useState(0);
    const [recent, setRecent] = useState(readRecent);
    const input = useRef<HTMLInputElement>(null);

    const hits = useMemo(() => searchMeds(meds, q, t), [meds, q, t]);
    useEffect(() => setActive(0), [q]);

    // "/" or ⌘K puts the cursor in the field from anywhere on the page.
    useEffect(() => {
        const on = (e: KeyboardEvent) => {
            const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
            if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
                e.preventDefault();
                input.current?.focus();
            }
        };
        window.addEventListener('keydown', on);
        return () => window.removeEventListener('keydown', on);
    }, []);

    const byId = useMemo(() => new Map(meds.map(m => [m.id, m])), [meds]);
    const recentList = recent.map(id => byId.get(id)).filter((m): m is Med => !!m);
    const often = OFTEN[mode].map(id => byId.get(id)).filter((m): m is Med => !!m);

    return (
        <>
            <PageHeader
                title={t('nav.search')}
                subtitle={fill(t('search.subtitle'), { n: meds.length })}
                actions={
                    showCats ? (
                        // The cats sit by the page's title, as they sit by the reading on the journal.
                        <span className="flex items-end gap-1 pe-2" aria-hidden="true">
                            <PixelCat pose="donut" size={32} />
                            <PixelCat pose="loaf" size={32} />
                        </span>
                    ) : undefined
                }
            />
            <div className={`${PAGE_COLUMN} pt-1 pb-8 md:pb-32`}>
                <SearchField
                    ref={input}
                    value={q}
                    onChange={setQ}
                    label={t('search.label')}
                    placeholder={t('search.placeholder')}
                    listId="search-results"
                    activeId={hits[active] ? `hit-${hits[active].med.id}` : undefined}
                    onKeyDown={e => listKeys(e, hits.length, active, setActive, n => hits[n] && onOpenMed(hits[n].med))}
                />

                {q.trim() ? (
                    <section className="m-appear mt-6" aria-live="polite">
                        {hits.length === 0 ? (
                            <div className="py-8">
                                <p className="text-sm font-semibold">{fill(t('search.none'), { q: q.trim() })}</p>
                            </div>
                        ) : (
                            <>
                                <h2 className="group-heading mb-1">
                                    {hits.length === 1
                                        ? t('search.one_match')
                                        : fill(t('search.n_matches'), { n: hits.length })}
                                </h2>
                                <div className="settings-section" id="search-results" role="listbox">
                                    {hits.map((h, i) => (
                                        <MedRow
                                            key={h.med.id}
                                            id={`hit-${h.med.id}`}
                                            med={h.med}
                                            sub={h.via ? fill(t('search.also_called'), { name: h.via }) : undefined}
                                            active={i === active}
                                            onOpen={onOpenMed}
                                        />
                                    ))}
                                </div>
                            </>
                        )}
                    </section>
                ) : (
                    <>
                        {recentList.length > 0 ? (
                            <section className="mt-8">
                                <div className="flex items-center justify-between mb-1">
                                    <h2 className="group-heading">{t('search.lately')}</h2>
                                    <button
                                        type="button"
                                        className={`${headerAction} -me-2.5 text-[var(--text-muted)]`}
                                        onClick={() => {
                                            clearRecent();
                                            setRecent([]);
                                        }}
                                    >
                                        {t('search.clear')}
                                    </button>
                                </div>
                                <div className="settings-section">
                                    {recentList.map(m => (
                                        <MedRow key={m.id} med={m} onOpen={onOpenMed} />
                                    ))}
                                </div>
                            </section>
                        ) : (
                            <section className="mt-8">
                                <h2 className="group-heading mb-3">{t('search.often')}</h2>
                                <div className="flex flex-wrap gap-2">
                                    {often.map(m => (
                                        <button
                                            key={m.id}
                                            type="button"
                                            className="btn-secondary btn-sm"
                                            onClick={() => onOpenMed(m)}
                                        >
                                            {medName(m.id, t)}
                                        </button>
                                    ))}
                                </div>
                            </section>
                        )}
                        {/* Browsing by kind, under the search it narrows. */}
                        <section className="mt-10">
                            <h2 className="group-heading mb-1">{t('search.by_kind')}</h2>
                            <KindList meds={meds} onOpenKind={onOpenKind} />
                        </section>
                    </>
                )}
            </div>
        </>
    );
};

export default Search;
