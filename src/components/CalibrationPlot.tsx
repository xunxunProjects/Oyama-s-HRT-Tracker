import React, { useEffect, useId, useMemo, useState } from 'react';
import { CalibrationResult } from '../../logic';
import { Lang } from '../i18n/translations';
import { formatDate, formatTime } from '../utils/helpers';
import { calibrationDomain, formatAxisTick } from '../utils/calibrationAxis';
import { useElementSize } from '../hooks/useElementSize';

interface CalibrationPlotProps {
    calibration: CalibrationResult;
    t: (key: string) => string;
    lang: Lang;
}

// A lab, as the main chart draws it: a diamond.
const diamond = (r: number) => `M0 ${-r}L${r} 0L0 ${r}L${-r} 0Z`;

const primaryFill = 'fill-[var(--accent)]';
const primaryStroke = 'stroke-[var(--accent)]';
const surfaceFill = 'fill-[var(--bg)]';
const surfaceStroke = 'stroke-[var(--bg)]';
const gridStroke = 'stroke-[var(--border)]';
const mutedFill = 'fill-[var(--text-muted)]';
const muted = 'text-[var(--text-muted)]';
const on = 'text-[var(--text)]';

/**
 * Predicted-vs-observed calibration plot: each E2 lab against what the model
 * said for that same moment, on equal log axes. The diagonal is perfect
 * agreement, and the wash around it is the fit's typical error.
 *
 * Every lab appears twice. The hollow diamond is the raw population model;
 * the solid one is the model after your calibration. On first draw the solid
 * marks start on their hollow twins and glide across to where calibration put
 * them, so what calibration does — pull the model onto your labs — is the
 * thing you watch happen.
 */
const CalibrationPlot: React.FC<CalibrationPlotProps> = ({ calibration, t, lang }) => {
    const [box, setBox] = useState<HTMLDivElement | null>(null);
    const { width } = useElementSize(box);
    const clipId = `calclip-${useId().replace(/:/g, '')}`;
    const [settled, setSettled] = useState(false);
    const [hover, setHover] = useState<number | null>(null);

    const calibrated = calibration.method !== 'off';
    const points = useMemo(
        () =>
            calibration.points.map(p => ({ ...p, cal: calibrated ? p.pred * calibration.factorFn(p.timeH) : p.pred })),
        [calibration, calibrated],
    );

    useEffect(() => {
        const id = requestAnimationFrame(() => setSettled(true));
        return () => cancelAnimationFrame(id);
    }, []);

    const ui = useMemo(() => {
        if (typeof window === 'undefined') return 1;
        const px = parseFloat(getComputedStyle(document.documentElement).fontSize);
        return Number.isFinite(px) && px > 0 ? px / 16 : 1;
    }, [width]);

    if (!points.length) return null;

    const mL = 34 * ui,
        mR = 10 * ui,
        mT = 22 * ui,
        mB = 40 * ui;
    const height = Math.round(Math.min(Math.max(width * 0.8, 240 * ui), 380 * ui));
    const pw = Math.max(0, width - mL - mR);
    const ph = Math.max(0, height - mT - mB);

    // One domain for both axes, so the diagonal really is y = x. Thin the
    // ticks to whatever both axes can display without labels colliding.
    const maxTicks = Math.max(3, Math.min(8, Math.floor(ph / (24 * ui)), Math.floor(pw / (48 * ui))));
    const values = points.flatMap(p => [p.obs, p.pred, p.cal]);
    const domain = calibrationDomain(values, maxTicks);
    if (!domain) return null;
    const { lo, hi, ticks } = domain;

    const u = (v: number) => (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo));
    const X = (v: number) => mL + u(v) * pw;
    const Y = (v: number) => mT + ph - u(v) * ph;

    const err = calibrated && calibration.fitErrPct !== null ? calibration.fitErrPct : null;
    const k = err !== null ? 1 + err / 100 : 1;
    const band =
        err !== null ? `${X(lo)},${Y(lo * k)} ${X(hi)},${Y(hi * k)} ${X(hi)},${Y(hi / k)} ${X(lo)},${Y(lo / k)}` : null;

    const hp = hover !== null ? points[hover] : null;
    const r = 4.5 * ui;

    return (
        <section className="py-5 border-t border-[var(--border)]">
            <h2 className={`text-sm ${muted}`}>{t('cal.plot.title')}</h2>

            {/* Legend — every mark on the plot, named */}
            <div className={`mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.6875rem] ${muted}`}>
                {calibrated && (
                    <span className="flex items-center gap-1.5">
                        <svg width={10} height={10} viewBox="-5 -5 10 10" className="overflow-visible">
                            <path
                                d={diamond(3.6)}
                                className={`${surfaceFill} ${primaryStroke} opacity-50`}
                                strokeWidth={1.25}
                            />
                        </svg>
                        {t('cal.plot.before')}
                    </span>
                )}
                <span className="flex items-center gap-1.5">
                    <svg width={10} height={10} viewBox="-5 -5 10 10" className="overflow-visible">
                        <path d={diamond(4)} className={primaryFill} />
                    </svg>
                    {calibrated ? t('cal.plot.after') : t('cal.plot.before')}
                </span>
                <span className="flex items-center gap-1.5">
                    <svg width={14} height={2} className="overflow-visible">
                        <line
                            x1={0}
                            y1={1}
                            x2={14}
                            y2={1}
                            className="stroke-[var(--text-muted)]"
                            strokeWidth={1}
                            strokeDasharray="3 2.5"
                        />
                    </svg>
                    {t('cal.plot.identity')}
                </span>
                {err !== null && (
                    <span className="flex items-center gap-1.5">
                        <span className="h-2 w-3.5 rounded-[2px] bg-[var(--accent)]/15" />
                        {t('cal.plot.band')} ±{err.toFixed(0)}%
                    </span>
                )}
            </div>

            <div ref={setBox} className="relative mt-2 select-none" style={{ height }}>
                {width > 0 && (
                    <svg
                        width={width}
                        height={height}
                        className="block overflow-visible tabular-nums"
                        onPointerLeave={() => setHover(null)}
                    >
                        <defs>
                            <clipPath id={clipId}>
                                <rect x={mL} y={mT} width={pw} height={ph} />
                            </clipPath>
                        </defs>

                        {/* Grid and tick labels, same on both axes */}
                        <g className="chart-appear">
                            {ticks.map(v => (
                                <g key={v}>
                                    <line
                                        x1={X(v)}
                                        y1={mT}
                                        x2={X(v)}
                                        y2={mT + ph}
                                        className={gridStroke}
                                        strokeWidth={1}
                                    />
                                    <line
                                        x1={mL}
                                        y1={Y(v)}
                                        x2={mL + pw}
                                        y2={Y(v)}
                                        className={gridStroke}
                                        strokeWidth={1}
                                    />
                                    <text
                                        x={X(v)}
                                        y={mT + ph + 13 * ui}
                                        textAnchor="middle"
                                        fontSize={10 * ui}
                                        className={`${mutedFill} tabular-nums`}
                                        opacity={0.8}
                                    >
                                        {formatAxisTick(v)}
                                    </text>
                                    <text
                                        x={mL - 6 * ui}
                                        y={Y(v) + 3.5 * ui}
                                        textAnchor="end"
                                        fontSize={10 * ui}
                                        className={`${mutedFill} tabular-nums`}
                                        opacity={0.8}
                                    >
                                        {formatAxisTick(v)}
                                    </text>
                                </g>
                            ))}
                            {/* Axis titles in the corners, pointing along their axis */}
                            <text x={mL - 6 * ui} y={mT - 9 * ui} fontSize={10.5 * ui} className={mutedFill}>
                                ↑ {t('cal.plot.y')} (pg/mL)
                            </text>
                            <text
                                x={mL + pw}
                                y={mT + ph + 31 * ui}
                                textAnchor="end"
                                fontSize={10.5 * ui}
                                className={mutedFill}
                            >
                                {t('cal.plot.x')} (pg/mL) →
                            </text>
                        </g>

                        <g clipPath={`url(#${clipId})`}>
                            {band && (
                                <polygon
                                    points={band}
                                    className="chart-appear fill-[var(--accent)]/12"
                                    style={{ animationDelay: '120ms' }}
                                />
                            )}
                            <line
                                x1={X(lo)}
                                y1={Y(lo)}
                                x2={X(hi)}
                                y2={Y(hi)}
                                strokeDasharray="3 3"
                                className="chart-appear stroke-[var(--text-muted)]"
                                strokeWidth={1}
                                opacity={0.55}
                            />
                        </g>

                        {/* The pull: a faint trail from each raw prediction to its calibrated one */}
                        {calibrated &&
                            points.map((p, i) => (
                                <line
                                    key={`trail-${p.id}`}
                                    x1={X(p.pred)}
                                    y1={Y(p.obs)}
                                    x2={X(p.cal)}
                                    y2={Y(p.obs)}
                                    className={`cal-trail ${primaryStroke}`}
                                    strokeWidth={1}
                                    strokeDasharray="2 2.5"
                                    style={{ opacity: settled ? 0.45 : 0, transitionDelay: `${360 + i * 60}ms` }}
                                />
                            ))}

                        {/* Raw model, hollow. The entrance animates the outer group's
                            transform, so the position rides on the inner path. */}
                        {calibrated &&
                            points.map(p => (
                                <g key={`raw-${p.id}`} className="chart-mark">
                                    <path
                                        d={diamond(r * 0.85)}
                                        transform={`translate(${X(p.pred)} ${Y(p.obs)})`}
                                        className={`${surfaceFill} ${primaryStroke}`}
                                        strokeWidth={1.25}
                                        opacity={0.5}
                                    />
                                </g>
                            ))}

                        {/* Calibrated, solid. Starts on its hollow twin and glides over. */}
                        {points.map((p, i) => {
                            const x = settled ? X(p.cal) : X(p.pred);
                            const active = hover === i;
                            return (
                                <g
                                    key={`cal-${p.id}`}
                                    className="cal-mark cursor-pointer"
                                    style={{
                                        transform: `translate(${x}px, ${Y(p.obs)}px)`,
                                        transitionDelay: `${160 + i * 60}ms`,
                                    }}
                                    onPointerEnter={() => setHover(i)}
                                    onClick={() => setHover(active ? null : i)}
                                >
                                    <rect
                                        x={-10 * ui}
                                        y={-10 * ui}
                                        width={20 * ui}
                                        height={20 * ui}
                                        fill="transparent"
                                    />
                                    <path
                                        d={diamond(active ? r * 1.3 : r)}
                                        className={`${primaryFill} ${surfaceStroke}`}
                                        strokeWidth={1.5}
                                    />
                                </g>
                            );
                        })}
                    </svg>
                )}

                {hp && (
                    <div
                        className="absolute z-20 pointer-events-none px-2.5 py-1.5 rounded-md bg-[var(--surface)] border border-[var(--border)]"
                        style={{
                            left: X(hp.cal),
                            top: Y(hp.obs) - 12 * ui,
                            transform: `translate(${X(hp.cal) > mL + pw * 0.6 ? '-100%' : '0'}, -100%)`,
                        }}
                    >
                        <div className={`text-[0.6875rem] ${muted} mb-0.5 whitespace-nowrap tabular-nums`}>
                            {formatDate(new Date(hp.timeH * 3600000), lang)} {formatTime(new Date(hp.timeH * 3600000))}
                        </div>
                        <div className="flex items-baseline gap-1 whitespace-nowrap">
                            <span className={`text-sm font-medium tabular-nums ${on}`}>{Math.round(hp.obs)}</span>
                            <span className={`text-[0.6875rem] ${muted}`}>{t('cal.plot.lab')} pg/mL</span>
                        </div>
                        <div className={`text-[0.6875rem] tabular-nums whitespace-nowrap ${muted}`}>
                            {t('cal.model')} {Math.round(hp.pred)}
                            {calibrated && (
                                <>
                                    {' → '}
                                    <span className="text-[var(--accent-ink)]">{Math.round(hp.cal)}</span>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* No fit figures under the caption: the Calibration settings row
                at the top of this page already reads them out, and Calibration
                settings lists them in full under Current fit. */}
            <p className={`mt-1 text-xs leading-relaxed ${muted}`}>{t('cal.plot.caption')}</p>
        </section>
    );
};

export default CalibrationPlot;
