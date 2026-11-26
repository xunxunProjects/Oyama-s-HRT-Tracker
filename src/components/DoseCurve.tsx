import { useEffect, useMemo, useRef, useState } from 'react';
import { useScrub } from './scrub';
import { useTranslation } from '../contexts/LanguageContext';
import { fill } from '../utils/regimenText';
import { LOCALE_MAP } from '../utils/helpers';

/*
 * How long, for a medicine: one dose's level over the days after it, as the
 * model draws it, in Oyama Journal's timeline (Timeline.tsx there): the line
 * in the chart's colour, the day it's highest shaded, the points it halves
 * and is mostly gone marked, and a reading under the finger anywhere along
 * it. Under the chart, the same points as rows, each with its date.
 */

export interface CurvePoint {
    /** hours after the dose */
    h: number;
    v: number;
}

export interface Milestones {
    peakH: number;
    peak: number;
    /** hours after the dose it has fallen to half its peak, if it does in view */
    halfH: number | null;
    /** …and to a tenth */
    goneH: number | null;
}

export function milestonesOf(points: CurvePoint[]): Milestones | null {
    if (points.length < 3) return null;
    let peakI = 0;
    points.forEach((p, i) => {
        if (p.v > points[peakI].v) peakI = i;
    });
    const peak = points[peakI].v;
    if (!(peak > 0)) return null;
    const after = (frac: number) => {
        for (let i = peakI; i < points.length; i++) if (points[i].v <= peak * frac) return points[i].h;
        return null;
    };
    return { peakH: points[peakI].h, peak, halfH: after(0.5), goneH: after(0.1) };
}

const H = 180;
const PAD = { l: 16, r: 16, t: 22, b: 26 };

export function DoseCurve({
    points,
    unit,
    startMs,
    decimals = 0,
}: {
    points: CurvePoint[];
    unit: string;
    /** When the dose is taken: the curve's day 0. */
    startMs: number;
    decimals?: number;
}) {
    const { t, lang } = useTranslation();
    const box = useRef<HTMLDivElement>(null);
    const [W, setW] = useState(640);
    useEffect(() => {
        const el = box.current;
        if (!el) return;
        const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    const scrub = useScrub();
    const m = useMemo(() => milestonesOf(points), [points]);
    const endH = points.length ? points[points.length - 1].h : 1;
    const top = (m?.peak ?? 1) * 1.15;
    const x = (h: number) => PAD.l + (h / endH) * (W - PAD.l - PAD.r);
    const y = (v: number) => PAD.t + (1 - v / top) * (H - PAD.t - PAD.b);
    const path = useMemo(
        () => points.map((p, i) => `${i ? 'L' : 'M'}${x(p.h).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' '),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [points, W, top],
    );
    const area = points.length
        ? `${path} L${x(endH).toFixed(1)} ${y(0).toFixed(1)} L${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`
        : '';

    // A tick a day, fewer when there are many days.
    const days = Math.floor(endH / 24);
    const every = days > 40 ? 14 : days > 20 ? 7 : days > 10 ? 2 : 1;
    const ticks = Array.from({ length: Math.floor(days / every) + 1 }, (_, i) => i * every * 24).filter(h => h <= endH);

    const locale = LOCALE_MAP[lang] || 'en-US';
    const when = (h: number) =>
        new Date(startMs + h * 3600000).toLocaleString(locale, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    const span = (h: number) =>
        h < 48
            ? fill(t('span.hours'), { n: Math.round(h) })
            : fill(t('span.days'), { n: Math.round((h / 24) * 10) / 10 });
    const num = (v: number) => v.toFixed(decimals);

    // The reading under the pointer.
    const readH =
        scrub.x === null ? null : Math.min(endH, Math.max(0, ((scrub.x - PAD.l) / (W - PAD.l - PAD.r)) * endH));
    const readV =
        readH === null
            ? null
            : (points.reduce((best, p) => (Math.abs(p.h - readH) < Math.abs(best.h - readH) ? p : best), points[0])
                  ?.v ?? null);

    return (
        <div>
            <div className="mb-2 min-h-[2.75rem] text-xs" aria-live="polite">
                {readH !== null && readV !== null ? (
                    <>
                        <p className="font-medium text-[var(--text)] tabular-nums">{`${num(readV)} ${unit}`}</p>
                        <p className="mt-0.5 text-[var(--text-muted)] tabular-nums">
                            {fill(t('med.at_after'), { when: when(readH), after: span(readH) })}
                        </p>
                    </>
                ) : null}
            </div>
            <div ref={box} className="-mx-4 md:-mx-6" style={{ touchAction: 'pan-y' }} {...scrub.handlers}>
                <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block select-none" aria-hidden="true">
                    {[0.25, 0.5, 0.75, 1].map(f => (
                        <line key={f} className="tl-grid" x1={PAD.l} x2={W - PAD.r} y1={y(top * f)} y2={y(top * f)} />
                    ))}
                    {m && (
                        <>
                            <rect
                                className="tl-peak"
                                x={x(Math.max(0, m.peakH - 12))}
                                width={Math.max(2, x(Math.min(endH, m.peakH + 12)) - x(Math.max(0, m.peakH - 12)))}
                                y={PAD.t}
                                height={H - PAD.t - PAD.b}
                            />
                            <text className="tl-peak-label" x={x(m.peakH) + 6} y={PAD.t - 6}>
                                {t('med.peak_short')}
                            </text>
                            {[m.halfH, m.goneH].map(
                                (h, i) =>
                                    h !== null && (
                                        <line
                                            key={i}
                                            className="tl-peak-edge"
                                            x1={x(h)}
                                            x2={x(h)}
                                            y1={PAD.t}
                                            y2={H - PAD.b}
                                        />
                                    ),
                            )}
                        </>
                    )}
                    <path d={area} fill="var(--chart-line)" opacity="0.08" />
                    <path className="tl-line chart-sweep" pathLength={1} d={path} />
                    <circle className="tl-dose" cx={x(0)} cy={y(points[0]?.v ?? 0)} r={3.5} />
                    {ticks.map(h => (
                        <text key={h} className="tl-axis" x={x(h)} y={H - 6} textAnchor="middle">
                            {h === 0 ? t('med.day0') : fill(t('med.day_n'), { n: Math.round(h / 24) })}
                        </text>
                    ))}
                    {readH !== null && readV !== null && (
                        <>
                            <line className="tl-now" x1={x(readH)} x2={x(readH)} y1={PAD.t} y2={H - PAD.b} />
                            <circle className="tl-now-dot" cx={x(readH)} cy={y(readV)} r={4.5} />
                        </>
                    )}
                </svg>
            </div>

            {m && (
                <div className="settings-section mt-2">
                    <div className="fact-row">
                        <span>{t('med.peak')}</span>
                        <span className="tabular">
                            {fill(t('med.around'), { when: when(m.peakH) })}
                            <span className="fact-sub">
                                {fill(t('med.after_level'), { after: span(m.peakH), level: `${num(m.peak)} ${unit}` })}
                            </span>
                        </span>
                    </div>
                    {m.halfH !== null && (
                        <div className="fact-row">
                            <span>{t('med.half')}</span>
                            <span className="tabular">
                                {when(m.halfH)}
                                <span className="fact-sub">{fill(t('med.after'), { after: span(m.halfH) })}</span>
                            </span>
                        </div>
                    )}
                    <div className="fact-row">
                        <span>{t('med.mostly_gone')}</span>
                        <span className="tabular">
                            {m.goneH !== null ? when(m.goneH) : t('med.beyond')}
                            {m.goneH !== null && (
                                <span className="fact-sub">{fill(t('med.after'), { after: span(m.goneH) })}</span>
                            )}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}

export default DoseCurve;
