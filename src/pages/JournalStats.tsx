import { useMemo, useState } from 'react';
import { Route, type DoseEvent, type Ester } from '../../logic';
import PageHeader, { PAGE_COLUMN, headerActionAccent } from '../components/PageHeader';
import Segmented from '../components/Segmented';
import DoseHeatmap from '../components/DoseHeatmap';
import { StackedBars, type Bucket } from '../components/StackedBars';
import { rowBleed } from '../components/SettingsListItem';
import { ChevronRight, Plus } from '../components/icons';
import { useTranslation } from '../contexts/LanguageContext';
import { medName } from '../data/meds';
import { LOCALE_MAP } from '../utils/helpers';
import { fill } from '../utils/regimenText';
import { JournalTabs, type JournalPanel } from './journal/JournalTabs';

/*
 * The Journal's Stats, as Oyama Journal counts its sessions: how many doses
 * over a span, a column a day or a month in the colours of what they were,
 * the medicines used most, and each medicine's own line, which opens it.
 * The dose calendar the Overview used to carry closes the page.
 */

type Range = '30' | '365' | 'all';
const RANGE_DAYS: Record<Range, number> = { '30': 30, '365': 365, all: 0 };

/** The colours medicines are drawn in, most used first. */
export const PALETTE = [
    'oklch(62% 0.13 40)', // terracotta
    'oklch(60% 0.12 250)', // sky
    'oklch(62% 0.12 150)', // sage
    'oklch(70% 0.13 80)', // sand
    'oklch(58% 0.14 330)', // plum
    'oklch(62% 0.11 195)', // teal
    'oklch(58% 0.15 20)', // rose
    'oklch(64% 0.12 110)', // olive
];

const muted = 'text-[var(--text-muted)]';
const on = 'text-[var(--text)]';
const HOUR = 3600000;

const counted = (e: DoseEvent) => e.route !== Route.patchRemove;

function bucketsOf(
    doses: DoseEvent[],
    range: Range,
    nowMs: number,
    color: (e: string) => string,
    order: string[],
    locale: string,
    zh: boolean,
): Bucket[] {
    const spans: { start: number; end: number; label: string; title: string }[] = [];
    const today = new Date(nowMs);
    if (range === '30') {
        for (let k = 29; k >= 0; k--) {
            const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - k);
            const e = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
            spans.push({
                start: d.getTime(),
                end: e.getTime(),
                label: String(d.getDate()),
                title: d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' }),
            });
        }
    } else {
        const first =
            range === '365'
                ? new Date(today.getFullYear(), today.getMonth() - 11, 1)
                : new Date(Math.min(nowMs, ...doses.map(e => e.timeH * HOUR)));
        const months = (today.getFullYear() - first.getFullYear()) * 12 + today.getMonth() - first.getMonth() + 1;
        if (months > 24) {
            for (let y = first.getFullYear(); y <= today.getFullYear(); y++)
                spans.push({
                    start: new Date(y, 0, 1).getTime(),
                    end: new Date(y + 1, 0, 1).getTime(),
                    label: String(y),
                    title: String(y),
                });
        } else {
            for (let k = Math.max(months, 12) - 1; k >= 0; k--) {
                const d = new Date(today.getFullYear(), today.getMonth() - k, 1);
                const e = new Date(d.getFullYear(), d.getMonth() + 1, 1);
                spans.push({
                    start: d.getTime(),
                    end: e.getTime(),
                    label: zh ? String(d.getMonth() + 1) : d.toLocaleDateString(locale, { month: 'short' }).charAt(0),
                    title: d.toLocaleDateString(locale, { month: 'short', year: 'numeric' }),
                });
            }
        }
    }
    return spans.map(sp => {
        const inside = doses.filter(e => e.timeH * HOUR >= sp.start && e.timeH * HOUR < sp.end);
        const n = new Map<string, number>();
        inside.forEach(e => n.set(e.ester, (n.get(e.ester) ?? 0) + 1));
        const parts = order.filter(x => n.has(x)).map(x => ({ key: x, value: n.get(x)!, color: color(x) }));
        const counts = parts.map(p => ({ key: p.key, n: p.value, color: p.color }));
        return { label: sp.label, span: sp.title, parts, total: inside.length, counts };
    });
}

const JournalStats = ({
    events,
    isDarkMode,
    onPanel,
    onOpenMed,
    onLog,
}: {
    events: DoseEvent[];
    isDarkMode: boolean;
    onPanel: (p: JournalPanel) => void;
    onOpenMed: (id: Ester) => void;
    onLog: () => void;
}) => {
    const { t, lang } = useTranslation();
    const locale = LOCALE_MAP[lang] || 'en-US';
    const zh = lang === 'zh' || lang === 'zh-TW' || lang === 'yue' || lang === 'ja';
    const [range, setRange] = useState<Range>('365');
    const [nowMs] = useState(() => Date.now());
    const days = RANGE_DAYS[range];
    const fromMs = days ? nowMs - days * 24 * HOUR : 0;
    const doses = useMemo(
        () => events.filter(e => counted(e) && e.timeH * HOUR >= fromMs && e.timeH * HOUR <= nowMs + 24 * HOUR),
        [events, fromMs, nowMs],
    );

    // Each medicine: how many doses, how much (by mouth, by injection: mg
    // only, a patch has its rate instead), and when last.
    const rows = useMemo(() => {
        const m = new Map<string, { n: number; mg: number; last: number }>();
        for (const e of doses) {
            const r = m.get(e.ester) ?? { n: 0, mg: 0, last: 0 };
            r.n++;
            r.mg += e.doseMG > 0 ? e.doseMG : 0;
            r.last = Math.max(r.last, e.timeH);
            m.set(e.ester, r);
        }
        return [...m.entries()].sort((a, b) => b[1].n - a[1].n || b[1].last - a[1].last);
    }, [doses]);
    const order = useMemo(() => rows.map(([k]) => k), [rows]);
    const color = (k: string) => PALETTE[Math.max(0, order.indexOf(k)) % PALETTE.length];
    const buckets = useMemo(
        () =>
            bucketsOf(
                doses,
                range,
                nowMs,
                k => PALETTE[Math.max(0, order.indexOf(k)) % PALETTE.length],
                order,
                locale,
                zh,
            ),
        [doses, range, nowMs, order, locale, zh],
    );
    const top = rows.slice(0, 5);
    const most = top[0];
    const ago = (h: number) => {
        const d = Math.floor((nowMs / HOUR - h) / 24);
        return d <= 0 ? t('stats.today') : d === 1 ? t('stats.yesterday') : fill(t('stats.days_ago'), { n: d });
    };
    const fmtMg = (n: number) => (n >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10));
    const rangeWords: Record<Range, string> = {
        '30': t('stats.in_30d'),
        '365': t('stats.in_12m'),
        all: t('stats.in_all'),
    };

    return (
        <div className="md:pb-32">
            <PageHeader
                title={t('nav.journal')}
                subtitle={
                    events.length === 1
                        ? t('timeline.records_one')
                        : t('timeline.records_n').replace('{n}', String(events.length))
                }
                actions={
                    <button type="button" className={`${headerActionAccent} tap-target`} onClick={onLog}>
                        <Plus size={16} />
                        {t('med.log')}
                    </button>
                }
            />
            <JournalTabs value="history-stats" onChange={onPanel} />
            <div className={`${PAGE_COLUMN} pt-4 pb-10 view-enter-forward`}>
                <Segmented
                    className="mb-6"
                    aria-label={t('stats.range')}
                    options={[
                        { id: '30', label: t('stats.30d') },
                        { id: '365', label: t('stats.12m') },
                        { id: 'all', label: t('stats.all') },
                    ]}
                    value={range}
                    onChange={v => setRange(v as Range)}
                />

                <section className="mb-9">
                    <h2 className="group-heading mb-1">{t('stats.doses')}</h2>
                    <p className="flex items-baseline gap-2">
                        <span className="font-display font-light text-[2.5rem] leading-none tracking-[-0.03em] tabular-nums text-[var(--text)]">
                            {doses.length}
                        </span>
                        <span className={`text-sm ${muted}`}>{rangeWords[range]}</span>
                    </p>
                    <div className="mt-4">
                        <StackedBars
                            buckets={buckets}
                            names={k => medName(k as Ester, t)}
                            idle={range === '30' ? t('stats.bar_day') : t('stats.bar_month')}
                        />
                    </div>
                </section>

                {most && (
                    <section className="mb-9">
                        <h2 className="group-heading mb-1">{t('stats.most')}</h2>
                        <p className="font-display font-light text-[2rem] leading-tight tracking-[-0.02em] text-[var(--text)] truncate">
                            {medName(most[0] as Ester, t)}
                        </p>
                        <div className="mt-3 flex flex-col gap-2.5">
                            {top.map(([k, r]) => (
                                <button
                                    key={k}
                                    type="button"
                                    onClick={() => onOpenMed(k as Ester)}
                                    className="group -mx-2 flex items-center gap-3 rounded-[var(--radius-sm)] px-2 py-1 text-start hover:bg-[var(--surface-hover)]"
                                >
                                    <span
                                        className={`w-28 shrink-0 truncate text-xs ${muted} group-hover:text-[var(--text)]`}
                                    >
                                        {medName(k as Ester, t)}
                                    </span>
                                    <span className="flex-1 h-2.5 rounded-full bg-[var(--surface-muted)] overflow-hidden">
                                        <span
                                            className="block h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
                                            style={{ width: `${(r.n / most[1].n) * 100}%`, background: color(k) }}
                                        />
                                    </span>
                                    <span className={`w-8 shrink-0 text-end text-xs tabular-nums ${muted}`}>{r.n}</span>
                                </button>
                            ))}
                        </div>
                    </section>
                )}

                {rows.length ? (
                    <section className="mb-9">
                        <h2 className="group-heading mb-1">{t('stats.meds')}</h2>
                        <div className="settings-section">
                            {rows.map(([k, r]) => (
                                <button
                                    key={k}
                                    type="button"
                                    onClick={() => onOpenMed(k as Ester)}
                                    className={`w-full min-h-14 flex items-center gap-3 py-2.5 text-start ${rowBleed}`}
                                >
                                    <span
                                        className="size-2.5 shrink-0 rounded-full"
                                        style={{ background: color(k) }}
                                        aria-hidden="true"
                                    />
                                    <span className="flex-1 min-w-0">
                                        <span className={`block text-sm font-medium ${on} truncate`}>
                                            {medName(k as Ester, t)}
                                        </span>
                                        <span className={`block text-xs ${muted} mt-0.5`}>
                                            {fill(t('stats.row_line'), {
                                                n:
                                                    r.n === 1
                                                        ? t('stats.one_dose')
                                                        : fill(t('stats.n_doses'), { n: r.n }),
                                                when: ago(r.last),
                                            })}
                                        </span>
                                    </span>
                                    <span className={`text-sm tabular-nums ${on} shrink-0`}>
                                        {r.mg > 0 ? fill(t('stats.mg_in_all'), { n: fmtMg(r.mg) }) : ''}
                                    </span>
                                    <ChevronRight
                                        size={16}
                                        className={`${muted} shrink-0 opacity-70 rtl:-scale-x-100`}
                                    />
                                </button>
                            ))}
                        </div>
                    </section>
                ) : (
                    <p className={`text-sm ${muted} mb-9`}>{t('stats.nothing')}</p>
                )}

                {events.length > 0 && (
                    <section>
                        <h2 className="group-heading mb-3">{t('stats.calendar')}</h2>
                        <DoseHeatmap events={events} isDarkMode={isDarkMode} />
                    </section>
                )}
            </div>
        </div>
    );
};

export default JournalStats;
