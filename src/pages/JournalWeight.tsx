import { useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { BODY_WEIGHT_KG_MAX, BODY_WEIGHT_KG_MIN, isPlausibleBodyWeightKG } from '../../logic';
import PageHeader, { PAGE_COLUMN, headerActionAccent } from '../components/PageHeader';
import Odometer from '../components/Odometer';
import Doodle from '../components/Doodle';
import { useScrub } from '../components/scrub';
import { Close, Plus } from '../components/icons';
import { useTranslation } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { nsFor } from '../utils/backupState';
import { LOCALE_MAP } from '../utils/helpers';
import { fill } from '../utils/regimenText';
import { JournalTabs, type JournalPanel } from './journal/JournalTabs';

/*
 * Body weight, beside the log and the stats, as Oyama Journal keeps it: a
 * line of every weighing, the latest and how far it has moved, a form to log
 * one, and each one listed, newest first, to delete. Logging the newest also
 * sets the body weight the model reads, as Settings does. The weighings stay
 * on this device under the account's own keys (removed on sign-out, as every
 * other health record is).
 */

interface Weighing {
    id: string;
    kg: number;
    /** epoch ms */
    t: number;
}

const keyFor = (owner: string) => nsFor(owner, 'weight-log');

function read(owner: string): Weighing[] {
    try {
        const raw = JSON.parse(localStorage.getItem(keyFor(owner)) ?? '[]');
        return Array.isArray(raw)
            ? raw.filter(w => w && Number.isFinite(w.kg) && Number.isFinite(w.t)).sort((a, b) => b.t - a.t)
            : [];
    } catch {
        return [];
    }
}

const muted = 'text-[var(--text-muted)]';
const H = 150;
const PAD = { l: 16, r: 16, t: 16, b: 22 };

function toLocalInput(t: number) {
    const d = new Date(t);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const JournalWeight = ({
    weight,
    onSetWeight,
    onPanel,
}: {
    weight: number;
    onSetWeight: (kg: number) => void;
    onPanel: (p: JournalPanel) => void;
}) => {
    const { t, lang } = useTranslation();
    const { user } = useAuth();
    const owner = user?.id ? String(user.id) : 'local';
    const locale = LOCALE_MAP[lang] || 'en-US';
    const [log, setLog] = useState<Weighing[]>(() => read(owner));
    useEffect(() => setLog(read(owner)), [owner]);
    const save = (next: Weighing[]) => {
        const sorted = [...next].sort((a, b) => b.t - a.t);
        setLog(sorted);
        try {
            localStorage.setItem(keyFor(owner), JSON.stringify(sorted));
        } catch {
            /* full or private: it lives for this visit */
        }
        // The newest weighing is the body weight the model reads.
        if (sorted[0] && sorted[0].kg !== weight) onSetWeight(sorted[0].kg);
    };

    const [adding, setAdding] = useState(false);
    const [text, setText] = useState('');
    const [time, setTime] = useState(() => Date.now());
    const n = Number(text.replace(',', '.'));
    const ok = text.trim() !== '' && isPlausibleBodyWeightKG(n);

    const latest = log[0]?.kg ?? weight;
    const prev = log[1]?.kg;
    const change = prev !== undefined ? Math.round((latest - prev) * 10) / 10 : null;

    // The line of every weighing, oldest on the left.
    const box = useRef<HTMLDivElement>(null);
    const [W, setW] = useState(640);
    useEffect(() => {
        const el = box.current;
        if (!el) return;
        const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
        ro.observe(el);
        return () => ro.disconnect();
    }, [log.length]);
    const scrub = useScrub();
    const pts = useMemo(() => [...log].reverse(), [log]);
    const t0 = pts[0]?.t ?? 0;
    const t1 = pts[pts.length - 1]?.t ?? 1;
    const lo = Math.min(...pts.map(p => p.kg)) - 1;
    const hi = Math.max(...pts.map(p => p.kg)) + 1;
    const x = (tm: number) => PAD.l + ((tm - t0) / Math.max(1, t1 - t0)) * (W - PAD.l - PAD.r);
    const y = (kg: number) => PAD.t + (1 - (kg - lo) / Math.max(0.1, hi - lo)) * (H - PAD.t - PAD.b);
    const near =
        scrub.x === null || pts.length < 2
            ? null
            : pts.reduce(
                  (best, p) => (Math.abs(x(p.t) - scrub.x!) < Math.abs(x(best.t) - scrub.x!) ? p : best),
                  pts[0],
              );
    const when = (tm: number) =>
        new Date(tm).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });

    return (
        <div className="md:pb-32">
            <PageHeader
                title={t('nav.journal')}
                subtitle={fill(t('weight.count'), { n: log.length })}
                actions={
                    <button
                        type="button"
                        className={`${headerActionAccent} tap-target`}
                        aria-expanded={adding}
                        onClick={() => {
                            setAdding(a => !a);
                            setTime(Date.now());
                        }}
                    >
                        <Plus size={16} />
                        {adding ? t('btn.cancel') : t('weight.log')}
                    </button>
                }
            />
            <JournalTabs value="history-weight" onChange={onPanel} />
            <div className={`${PAGE_COLUMN} pt-4 pb-10 view-enter-forward`}>
                <div className="disclosure" data-open={adding} {...(adding ? {} : { inert: '' })}>
                    <div className="disclosure-inner">
                        <form
                            className="flex flex-col gap-5 pb-8"
                            onSubmit={e => {
                                e.preventDefault();
                                if (!ok) return;
                                save([...log, { id: uuidv4(), kg: Math.round(n * 10) / 10, t: time }]);
                                setText('');
                                setAdding(false);
                            }}
                        >
                            <div>
                                <label
                                    className="block text-xs font-medium text-[var(--text-muted)] mb-1.5"
                                    htmlFor="weight-amount"
                                >
                                    {t('status.weight')}
                                </label>
                                <div className="flex items-end gap-3">
                                    <input
                                        id="weight-amount"
                                        className={`input-base flex-1 text-lg tabular-nums ${text ? 'is-inked' : ''}`}
                                        inputMode="decimal"
                                        autoComplete="off"
                                        placeholder={String(weight)}
                                        value={text}
                                        onChange={e => setText(e.target.value)}
                                        aria-invalid={text !== '' && !ok}
                                    />
                                    <span className={`pb-2 text-sm ${muted}`}>kg</span>
                                </div>
                                {text !== '' && !ok && (
                                    <p className="mt-1.5 text-xs text-[var(--danger)]">
                                        {fill(t('weight.range'), { min: BODY_WEIGHT_KG_MIN, max: BODY_WEIGHT_KG_MAX })}
                                    </p>
                                )}
                            </div>
                            <div>
                                <label
                                    className="block text-xs font-medium text-[var(--text-muted)] mb-1.5"
                                    htmlFor="weight-time"
                                >
                                    {t('weight.when')}
                                </label>
                                <div className="flex items-end gap-3">
                                    <input
                                        id="weight-time"
                                        type="datetime-local"
                                        className="input-base flex-1 tabular-nums is-inked"
                                        value={toLocalInput(time)}
                                        onChange={e => {
                                            const v = new Date(e.target.value).getTime();
                                            if (Number.isFinite(v)) setTime(v);
                                        }}
                                    />
                                    <button
                                        type="button"
                                        className="inline-flex h-8 items-center px-2.5 text-sm font-medium rounded-full text-[var(--accent-ink)] hover:bg-[var(--accent-subtle)]"
                                        onClick={() => setTime(Date.now())}
                                    >
                                        {t('dose.now')}
                                    </button>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button type="submit" className="btn-primary" disabled={!ok}>
                                    {t('btn.save')}
                                </button>
                                <button type="button" className="btn-secondary" onClick={() => setAdding(false)}>
                                    {t('btn.cancel')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                <section className="mb-8">
                    <h2 className="group-heading mb-1">{t('weight.latest')}</h2>
                    <p className="font-display inline-flex items-baseline gap-x-2 font-light leading-none tracking-[-0.035em] tabular-nums text-[length:var(--text-reading-sm-size)] sm:text-[length:var(--text-reading-md-size)]">
                        <span className="text-[var(--text)]">
                            <Odometer value={latest} decimals={1} places={4} />
                        </span>
                        <span className={`text-sm font-normal tracking-normal ${muted}`}>kg</span>
                    </p>
                    <p className={`mt-2 text-sm ${muted}`}>
                        {change === null
                            ? log.length
                                ? fill(t('weight.on'), { when: when(log[0].t) })
                                : t('weight.from_settings')
                            : change === 0
                              ? t('weight.same')
                              : fill(change > 0 ? t('weight.up') : t('weight.down'), { n: Math.abs(change) })}
                    </p>
                </section>

                {pts.length >= 2 && (
                    <section className="mb-8">
                        <div className="mb-2 min-h-[2.75rem] text-xs" aria-live="polite">
                            {near ? (
                                <>
                                    <p className="font-medium text-[var(--text)] tabular-nums">{`${near.kg.toFixed(1)} kg`}</p>
                                    <p className={`mt-0.5 ${muted}`}>{when(near.t)}</p>
                                </>
                            ) : (
                                <p className={muted}>{t('weight.chart_idle')}</p>
                            )}
                        </div>
                        <div ref={box} className="-mx-4 md:-mx-6" style={{ touchAction: 'pan-y' }} {...scrub.handlers}>
                            <svg
                                width={W}
                                height={H}
                                viewBox={`0 0 ${W} ${H}`}
                                className="block select-none"
                                aria-hidden="true"
                            >
                                {[0.25, 0.5, 0.75].map(f => (
                                    <line
                                        key={f}
                                        className="tl-grid"
                                        x1={PAD.l}
                                        x2={W - PAD.r}
                                        y1={PAD.t + f * (H - PAD.t - PAD.b)}
                                        y2={PAD.t + f * (H - PAD.t - PAD.b)}
                                    />
                                ))}
                                <path
                                    className="tl-line chart-sweep"
                                    pathLength={1}
                                    d={pts
                                        .map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.kg).toFixed(1)}`)
                                        .join(' ')}
                                />
                                {pts.map(p => (
                                    <circle
                                        key={p.id}
                                        className="tl-dose"
                                        cx={x(p.t)}
                                        cy={y(p.kg)}
                                        r={near?.id === p.id ? 4.5 : 3}
                                    />
                                ))}
                                <text className="tl-axis" x={PAD.l} y={H - 4}>
                                    {when(t0)}
                                </text>
                                <text className="tl-axis" x={W - PAD.r} y={H - 4} textAnchor="end">
                                    {when(t1)}
                                </text>
                            </svg>
                        </div>
                    </section>
                )}

                {log.length > 0 ? (
                    <section>
                        <h2 className="group-heading mb-1">{t('weight.every')}</h2>
                        <div className="settings-section">
                            {log.map(w => (
                                <div key={w.id} className="flex min-h-14 items-center justify-between gap-3 py-2.5">
                                    <span className="min-w-0">
                                        <span className="block text-sm tabular-nums text-[var(--text)]">{`${w.kg.toFixed(1)} kg`}</span>
                                        <span className={`block text-xs ${muted} mt-0.5`}>{when(w.t)}</span>
                                    </span>
                                    <button
                                        type="button"
                                        className="btn-ghost !size-8 !p-0"
                                        aria-label={t('btn.delete')}
                                        onClick={() => save(log.filter(x => x.id !== w.id))}
                                    >
                                        <Close size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </section>
                ) : (
                    !adding && (
                        <div className="flex flex-col items-center text-center pt-6 pb-10">
                            <Doodle name="chart" size={4.5} />
                            <p className="mt-4 text-sm font-medium text-[var(--text)]">{t('weight.empty_title')}</p>
                            <p className={`mt-1 text-sm ${muted} max-w-xs`}>{t('weight.empty_body')}</p>
                            <button type="button" className="btn-primary mt-5" onClick={() => setAdding(true)}>
                                {t('weight.log')}
                            </button>
                        </div>
                    )
                )}
            </div>
        </div>
    );
};

export default JournalWeight;
