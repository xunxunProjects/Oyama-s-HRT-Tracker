import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../contexts/LanguageContext';
import { formatDate, formatTime } from '../utils/helpers';
import { SimulationResult, DoseEvent, interpolateConcentration, interpolateConcentration_E2, interpolateConcentration_CPA, interpolateConcentration_T, LabResult, convertToPgMl, convertToNgDl, isT_LabUnit, T_ESTERS } from '../../logic';
import { Activity, RotateCcw, Info, FlaskConical, Maximize2, Minimize2 } from 'lucide-react';
import { useHRTMode } from '../contexts/HRTModeContext';
import {
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart, ComposedChart, Scatter, Brush, Line
} from 'recharts';

const CustomTooltip = ({ active, payload, label, t, lang, isDarkMode, isTransmasc }: any) => {
    if (active && payload && payload.length) {
        // If it's a lab result point
        if (payload[0].payload.isLabResult) {
            const data = payload[0].payload;
            const primaryUnit = isTransmasc ? 'ng/dl' : 'pg/ml';
            const altUnit = isTransmasc ? 'nmol/l' : 'pmol/l';
            return (
                <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 px-3 py-2 rounded shadow-sm relative lowercase font-mono">
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1 flex items-center gap-1 uppercase tracking-wide">
                        <FlaskConical size={10} />
                        {formatDate(new Date(label), lang)} {formatTime(new Date(label))}
                    </p>
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-sm text-gray-800 dark:text-gray-200">
                            {data.originalValue}
                        </span>
                        <span className="text-[10px] text-gray-400">{data.originalUnit}</span>
                    </div>
                    {data.originalUnit === altUnit && (
                        <div className="text-[10px] text-gray-400 mt-0.5">
                            ≈ {data.concE2.toFixed(isTransmasc ? 0 : 2)} {primaryUnit}
                        </div>
                    )}
                </div>
            );
        }

        const dataPoint = payload[0].payload;
        const concE2 = dataPoint.concE2;
        const concCPA = dataPoint.concCPA; // Already in ng/mL

        if (isTransmasc) {
            return (
                <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 px-3 py-2 rounded shadow-sm relative lowercase font-mono">
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1 flex items-center gap-1 uppercase tracking-wide">
                        {formatDate(new Date(label), lang)} {formatTime(new Date(label))}
                    </p>
                    {concE2 !== undefined && concE2 !== null && (
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-xs text-gray-500">{t('label.total_t')}:</span>
                            <span className="text-sm text-gray-800 dark:text-gray-200">
                                {concE2.toFixed(0)}
                            </span>
                            <span className="text-[10px] text-gray-400">ng/dl</span>
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 px-3 py-2 rounded shadow-sm relative lowercase font-mono">
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1 flex items-center gap-1 uppercase tracking-wide">
                    {formatDate(new Date(label), lang)} {formatTime(new Date(label))}
                </p>
                {concE2 !== undefined && concE2 !== null && (
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-xs text-gray-500">{t('label.e2')}:</span>
                        <span className="text-sm text-gray-800 dark:text-gray-200">
                            {concE2.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-gray-400">pg/ml</span>
                    </div>
                )}
                {concCPA !== undefined && concCPA !== null && (
                    <div className="flex items-baseline gap-1.5 mt-0.5">
                        <span className="text-xs text-gray-500">{t('label.cpa_chart')}:</span>
                        <span className="text-sm text-gray-800 dark:text-gray-200">
                            {concCPA.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-gray-400">ng/ml</span>
                    </div>
                )}
            </div>
        );
    }
    return null;
};

const ResultChart = ({ sim, events, labResults = [], calibrationFn = (_t: number) => 1, onPointClick, isDarkMode = false }: { sim: SimulationResult | null, events: DoseEvent[], labResults?: LabResult[], calibrationFn?: (timeH: number) => number, onPointClick: (e: DoseEvent) => void, isDarkMode?: boolean }) => {
    const { t, lang } = useTranslation();
    const { isTransmasc } = useHRTMode();
    const [xDomain, setXDomain] = useState<[number, number] | null>(null);
    const initializedRef = useRef(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const getViewport = () => ({
        width: typeof window !== 'undefined' ? window.innerWidth : 0,
        height: typeof window !== 'undefined' ? window.innerHeight : 0,
    });
    const [viewport, setViewport] = useState(getViewport);

    // In transmasc mode, the primary series is total T (ng/dL) instead of E2 (pg/mL).
    // We repurpose the `concE2` field in chart data to hold the primary series value.
    // CPA is never relevant in transmasc mode.
    const hasE2Data = useMemo(
        () => isTransmasc
            ? events.some(e => T_ESTERS.has(e.ester))
            : events.some(e => e.ester !== 'CPA' && !T_ESTERS.has(e.ester)),
        [events, isTransmasc]
    );
    const hasCPAData = useMemo(() => !isTransmasc && events.some(e => e.ester === 'CPA'), [events, isTransmasc]);

    const data = useMemo(() => {
        if (!sim || sim.timeH.length === 0) return [];
        return sim.timeH.map((t, i) => {
            const timeMs = t * 3600000;
            if (isTransmasc) {
                const concT = sim.concNGdL_T ? sim.concNGdL_T[i] : 0;
                return {
                    time: timeMs,
                    concE2: concT, // repurposed as primary T series (ng/dL)
                    concCPA: 0,
                    conc: concT
                };
            }
            const scale = calibrationFn(t);
            const calibratedE2 = sim.concPGmL_E2[i] * scale;
            const rawCPA_ngmL = sim.concPGmL_CPA[i];
            return {
                time: timeMs,
                concE2: calibratedE2,
                concCPA: rawCPA_ngmL,
                conc: calibratedE2
            };
        });
    }, [sim, calibrationFn, isTransmasc]);

    const labPoints = useMemo(() => {
        if (!labResults || labResults.length === 0) return [];
        if (isTransmasc) {
            // Only T-unit labs are relevant here.
            return labResults.filter(l => isT_LabUnit(l.unit)).map(l => ({
                time: l.timeH * 3600000,
                concE2: convertToNgDl(l.concValue, l.unit), // primary series is ng/dL
                originalValue: l.concValue,
                originalUnit: l.unit,
                isLabResult: true,
                id: l.id
            }));
        }
        return labResults.filter(l => !isT_LabUnit(l.unit)).map(l => ({
            time: l.timeH * 3600000,
            concE2: convertToPgMl(l.concValue, l.unit),
            originalValue: l.concValue,
            originalUnit: l.unit,
            isLabResult: true,
            id: l.id
        }));
    }, [labResults, isTransmasc]);

    const eventPoints = useMemo(() => {
        if (!sim || events.length === 0) return { e2Points: [], cpaEvents: [] };

        if (isTransmasc) {
            const tEvents = events.filter(e => T_ESTERS.has(e.ester));
            const e2Points = tEvents.map(e => {
                const timeMs = e.timeH * 3600000;
                const concT = interpolateConcentration_T(sim, e.timeH);
                const val = concT !== null && !Number.isNaN(concT) ? concT : 0;
                return { time: timeMs, concE2: val, concCPA: 0, event: e, isEvent: true, isCPAEvent: false };
            });
            return { e2Points, cpaEvents: [] };
        }

        // Split events by ester type (transfem)
        const e2Events = events.filter(e => e.ester !== 'CPA' && !T_ESTERS.has(e.ester));
        const cpaEvents = events.filter(e => e.ester === 'CPA');

        const e2Points = e2Events.map(e => {
            const timeMs = e.timeH * 3600000;
            const concE2 = interpolateConcentration_E2(sim, e.timeH);
            const calibratedE2 = concE2 !== null && !Number.isNaN(concE2)
                ? concE2 * calibrationFn(e.timeH)
                : 0;

            return {
                time: timeMs,
                concE2: calibratedE2,
                concCPA: 0,
                event: e,
                isEvent: true,
                isCPAEvent: false
            };
        });

        return { e2Points, cpaEvents };
    }, [sim, events, calibrationFn, isTransmasc]);

    const cpaEventPoints = useMemo(() => {
        if (!sim || !eventPoints?.cpaEvents || eventPoints.cpaEvents.length === 0) return [];

        // Map CPA events to data points
        // Use interpolation to get the exact concentration at the event time
        return eventPoints.cpaEvents.map(e => {
            const timeMs = e.timeH * 3600000;
            const concCPA = interpolateConcentration_CPA(sim, e.timeH);
            const finalCPA = (concCPA !== null && Number.isFinite(concCPA)) ? concCPA : 0; // ng/mL

            return {
                time: timeMs,
                concE2: 0,
                concCPA: finalCPA,
                event: e,
                isEvent: true,
                isCPAEvent: true
            };
        });
    }, [sim, eventPoints?.cpaEvents]);

    const { minTime, maxTime, now } = useMemo(() => {
        const n = new Date().getTime();
        if (data.length === 0) return { minTime: n, maxTime: n, now: n };
        return {
            minTime: data[0].time,
            maxTime: data[data.length - 1].time,
            now: n
        };
    }, [data]);

    const nowPoint = useMemo(() => {
        if (!sim || data.length === 0) return null;
        const h = now / 3600000;

        if (isTransmasc) {
            const concT = interpolateConcentration_T(sim, h);
            const hasT = concT !== null && !Number.isNaN(concT);
            if (!hasT) return null;
            return { time: now, concE2: concT as number, concCPA: 0 };
        }

        const concE2 = interpolateConcentration_E2(sim, h);
        const concCPA = interpolateConcentration_CPA(sim, h);

        const hasE2 = concE2 !== null && !Number.isNaN(concE2);
        const hasCPA = concCPA !== null && !Number.isNaN(concCPA);

        if (!hasE2 && !hasCPA) return null;

        const calibratedE2 = hasE2 ? concE2 * calibrationFn(h) : 0;
        const finalCPA = hasCPA ? concCPA : 0;

        return {
            time: now,
            concE2: calibratedE2,
            concCPA: finalCPA
        };
    }, [sim, data, now, calibrationFn, isTransmasc]);

    // Slider helpers for quick panning (helps mobile users)
    // Initialize view: center on "now" with a reasonable window (e.g. 14 days)
    useEffect(() => {
        if (!initializedRef.current && data.length > 0) {
            const initialWindow = 7 * 24 * 3600 * 1000; // 1 week
            const start = Math.max(minTime, now - initialWindow / 2);
            const end = Math.min(maxTime, start + initialWindow);

            // Adjust if end is clamped
            const finalStart = Math.max(minTime, end - initialWindow);

            setXDomain([finalStart, end]);
            initializedRef.current = true;
        }
    }, [data, minTime, maxTime, now]);

    const clampDomain = (domain: [number, number]): [number, number] => {
        const width = domain[1] - domain[0];
        // Enforce min zoom (e.g. 1 day) and max zoom (total range)
        const MIN_ZOOM = 24 * 3600 * 1000;
        const MAX_ZOOM = Math.max(maxTime - minTime, MIN_ZOOM);

        let newWidth = Math.max(MIN_ZOOM, Math.min(width, MAX_ZOOM));
        let newStart = domain[0];
        let newEnd = newStart + newWidth;

        // Clamp to data bounds
        if (newStart < minTime) {
            newStart = minTime;
            newEnd = newStart + newWidth;
        }
        if (newEnd > maxTime) {
            newEnd = maxTime;
            newStart = newEnd - newWidth;
        }

        return [newStart, newEnd];
    };

    const zoomToDuration = (days: number) => {
        const duration = days * 24 * 3600 * 1000;
        const currentCenter = xDomain ? (xDomain[0] + xDomain[1]) / 2 : now;
        const targetCenter = (now >= minTime && now <= maxTime) ? now : currentCenter;

        const start = targetCenter - duration / 2;
        const end = targetCenter + duration / 2;
        setXDomain(clampDomain([start, end]));
    };

    const findClosestIndex = (time: number) => {
        if (data.length === 0) return 0;
        let low = 0;
        let high = data.length - 1;
        while (high - low > 1) {
            const mid = Math.floor((low + high) / 2);
            if (data[mid].time === time) return mid;
            if (data[mid].time < time) low = mid;
            else high = mid;
        }

        const lowDiff = Math.abs(data[low].time - time);
        const highDiff = Math.abs(data[high].time - time);
        return highDiff < lowDiff ? high : low;
    };

    const brushRange = useMemo(() => {
        if (data.length === 0) return { startIndex: 0, endIndex: 0 };
        const domain = xDomain || [minTime, maxTime];
        const startIndex = findClosestIndex(domain[0]);
        const endIndexRaw = findClosestIndex(domain[1]);
        const endIndex = Math.max(startIndex + 1, endIndexRaw);
        return { startIndex, endIndex: Math.min(data.length - 1, endIndex) };
    }, [data, xDomain, minTime, maxTime]);

    const handleBrushChange = (range: { startIndex?: number; endIndex?: number }) => {
        if (!range || range.startIndex === undefined || range.endIndex === undefined || data.length === 0) return;
        const startIndex = Math.max(0, Math.min(range.startIndex, data.length - 1));
        const endIndex = Math.min(data.length - 1, Math.max(startIndex + 1, Math.min(range.endIndex, data.length - 1)));
        if (startIndex >= endIndex) return;
        const start = data[startIndex].time;
        const end = data[endIndex].time;
        setXDomain(clampDomain([start, end]));
    };

    const lockLandscape = async () => {
        try {
            await (screen as any)?.orientation?.lock?.('landscape');
        } catch {
            // Ignore unsupported orientation lock on some browsers.
        }
    };

    const unlockOrientation = () => {
        try {
            (screen as any)?.orientation?.unlock?.();
        } catch {
            // Ignore unsupported orientation unlock on some browsers.
        }
    };

    const openFullscreenChart = async () => {
        setIsFullscreen(true);
        await lockLandscape();
    };

    const closeFullscreenChart = () => {
        setIsFullscreen(false);
        unlockOrientation();
    };

    useEffect(() => {
        const handleResize = () => setViewport(getViewport());
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (!isFullscreen) return;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prevOverflow;
        };
    }, [isFullscreen]);

    useEffect(() => {
        if (!isFullscreen) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') closeFullscreenChart();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isFullscreen]);

    useEffect(() => {
        return () => {
            unlockOrientation();
        };
    }, []);

    const isPortraitMobileFullscreen = isFullscreen && viewport.width < 768 && viewport.height > viewport.width;

    const renderChartPanel = (fullscreen: boolean) => {
        const chartHeightClass = fullscreen ? 'h-[58vh] md:h-[70vh] lg:h-[76vh]' : 'h-64 md:h-80 lg:h-96';
        const miniMapGradientId = fullscreen ? 'overviewConcFullscreen' : 'overviewConc';

        return (
            <div className={`bg-white dark:bg-neutral-900 relative flex flex-col h-full uppercase tracking-wide ${fullscreen ? '' : 'border border-gray-200 dark:border-neutral-800 rounded-lg'}`}>
                <div className={`flex justify-between items-center ${fullscreen ? 'px-4 md:px-6 py-3' : 'px-4 md:px-6 py-4'} border-b border-gray-100 dark:border-neutral-800`}>
                    <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                        {t('chart.title')}
                    </h2>

                    <div className="flex items-center gap-2.5">
                        <button
                            onClick={fullscreen ? closeFullscreenChart : openFullscreenChart}
                            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                            title={fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                        >
                            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                        </button>
                        <button
                            onClick={() => zoomToDuration(7)}
                            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                            title={t('chart.reset')}
                        >
                            <RotateCcw size={14} />
                        </button>
                    </div>
                </div>

                <div className={`${chartHeightClass} w-full touch-none relative select-none px-2 pb-2 mt-4`}>
                    {(() => {
                        const factorNow = calibrationFn(now / 3600000);
                        return Math.abs(factorNow - 1) > 0.001 ? (
                            <div className="absolute top-0 right-4 z-10 px-2 py-0.5 rounded border bg-white dark:bg-neutral-800 border-gray-200 dark:border-neutral-700 flex items-center gap-1 opacity-80 pointer-events-none">
                                <FlaskConical size={10} className="text-gray-400 dark:text-gray-500" />
                                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                                    ×{(factorNow ?? 1).toFixed(2)}
                                </span>
                            </div>
                        ) : null;
                    })()}
                    <ResponsiveContainer width="100%" height="100%">

                        <ComposedChart data={data} margin={{ top: 12, right: 10, bottom: 0, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#374151' : '#f2f4f7'} />
                            <XAxis
                                dataKey="time"
                                type="number"
                                domain={xDomain || ['auto', 'auto']}
                                allowDataOverflow={true}
                                tickFormatter={(ms) => formatDate(new Date(ms), lang)}
                                tick={{ fontSize: 10, fill: isDarkMode ? '#9ca3af' : '#9aa3b1', fontWeight: 600 }}
                                minTickGap={48}
                                axisLine={false}
                                tickLine={false}
                                dy={10}
                            />
                            {hasE2Data && (
                                <YAxis
                                    yAxisId="left"
                                    dataKey="concE2"
                                    tick={{ fontSize: 10, fill: isTransmasc ? '#0ea5e9' : '#ec4899', fontWeight: 600 }}
                                    axisLine={false}
                                    tickLine={false}
                                    width={50}
                                    label={{ value: isTransmasc ? t('label.t_unit') : t('label.e2_unit'), angle: -90, position: 'left', offset: 0, style: { fontSize: 11, fill: isTransmasc ? '#0ea5e9' : '#ec4899', fontWeight: 700, textAnchor: 'middle' } }}
                                />
                            )}
                            {hasCPAData && (
                                <YAxis
                                    yAxisId="right"
                                    orientation="right"
                                    dataKey="concCPA"
                                    tick={{ fontSize: 10, fill: '#8b5cf6', fontWeight: 600 }}
                                    axisLine={false}
                                    tickLine={false}
                                    width={50}
                                    label={{ value: t('label.cpa_unit'), angle: 90, position: 'right', offset: 0, style: { fontSize: 11, fill: '#8b5cf6', fontWeight: 700, textAnchor: 'middle' } }}
                                />
                            )}
                            <Tooltip
                                content={<CustomTooltip t={t} lang={lang} isDarkMode={isDarkMode} isTransmasc={isTransmasc} />}
                                cursor={{ stroke: isDarkMode ? '#f9a8d4' : '#f472b6', strokeWidth: 1, strokeDasharray: '4 4' }}
                                trigger="hover"
                            />
                            {hasE2Data && (
                                <ReferenceLine
                                    x={now}
                                    stroke="#f472b6"
                                    strokeDasharray="3 3"
                                    strokeWidth={1.2}
                                    yAxisId="left"
                                    ifOverflow="extendDomain"
                                />
                            )}
                            {hasE2Data && (
                                <Line
                                    data={data}
                                    type="linear"
                                    dataKey="concE2"
                                    yAxisId="left"
                                    stroke="#f472b6"
                                    strokeWidth={2}
                                    dot={false}
                                    isAnimationActive={false}
                                    activeDot={{ r: 6, strokeWidth: 3, stroke: '#fff', fill: '#ec4899' }}
                                />
                            )}
                            {hasCPAData && (
                                <Line
                                    data={data}
                                    type="monotone"
                                    dataKey="concCPA"
                                    yAxisId="right"
                                    stroke="#8b5cf6"
                                    strokeWidth={2}
                                    dot={false}
                                    isAnimationActive={false}
                                    activeDot={{ r: 6, strokeWidth: 3, stroke: '#fff', fill: '#7c3aed' }}
                                />
                            )}
                            {eventPoints?.e2Points && eventPoints.e2Points.length > 0 && (
                                <Scatter
                                    data={eventPoints.e2Points}
                                    yAxisId="left"
                                    dataKey="concE2"
                                    isAnimationActive={false}
                                    onClick={(entry) => {
                                        if (entry && entry.payload && entry.payload.event) {
                                            onPointClick(entry.payload.event);
                                        }
                                    }}
                                    shape={({ cx, cy }: any) => (
                                        <g className="cursor-pointer">
                                            <circle cx={cx} cy={cy} r={4} fill="#fff7ed" stroke="#fb923c" strokeWidth={1.4} />
                                            <circle cx={cx} cy={cy} r={2} fill="#f97316" />
                                        </g>
                                    )}
                                />
                            )}
                            {hasCPAData && cpaEventPoints.length > 0 && (
                                <Scatter
                                    data={cpaEventPoints}
                                    yAxisId="right"
                                    dataKey="concCPA"
                                    isAnimationActive={false}
                                    onClick={(entry) => {
                                        if (entry && entry.payload && entry.payload.event) {
                                            onPointClick(entry.payload.event);
                                        }
                                    }}
                                    shape={({ cx, cy }: any) => (
                                        <g className="cursor-pointer">
                                            <circle cx={cx} cy={cy} r={4} fill="#faf5ff" stroke="#a855f7" strokeWidth={1.4} />
                                            <circle cx={cx} cy={cy} r={2} fill="#8b5cf6" />
                                        </g>
                                    )}
                                />
                            )}
                            {hasE2Data && (
                                <Scatter
                                    data={nowPoint ? [nowPoint] : []}
                                    yAxisId="left"
                                    isAnimationActive={false}
                                    shape={({ cx, cy }: any) => (
                                        <g>
                                            <circle cx={cx} cy={cy} r={1} fill="transparent" />
                                            <circle
                                                cx={cx} cy={cy}
                                                r={5}
                                                fill="#fbcfe8"
                                                stroke="white"
                                                strokeWidth={1.5}
                                            />
                                        </g>
                                    )}
                                />
                            )}
                            {hasCPAData && (
                                <Scatter
                                    data={nowPoint ? [nowPoint] : []}
                                    yAxisId="right"
                                    isAnimationActive={false}
                                    shape={({ cx, cy }: any) => (
                                        <g>
                                            <circle cx={cx} cy={cy} r={1} fill="transparent" />
                                            <circle
                                                cx={cx} cy={cy}
                                                r={5}
                                                fill="#c4b5fd"
                                                stroke="white"
                                                strokeWidth={1.5}
                                            />
                                        </g>
                                    )}
                                />
                            )}
                            {labPoints.length > 0 && (
                                <Scatter
                                    data={labPoints}
                                    yAxisId="left"
                                    dataKey="concE2"
                                    isAnimationActive={false}
                                    shape={({ cx, cy }: any) => (
                                        <g>
                                            <circle cx={cx} cy={cy} r={6} fill="#14b8a6" stroke="white" strokeWidth={2} />
                                            <g transform={`translate(${(cx ?? 0) - 6}, ${(cy ?? 0) - 6})`}>
                                                <FlaskConical size={12} color="white" />
                                            </g>
                                        </g>
                                    )}
                                />
                            )}
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>

                {data.length > 1 && (
                    <div className={`${fullscreen ? 'px-4 md:px-6 pb-4 mt-1' : 'px-5 pb-5 mt-2'}`}>
                        <div className="w-full h-12 bg-gray-50 dark:bg-neutral-800/50 border border-gray-200 dark:border-neutral-800 rounded overflow-hidden">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 4 }}>
                                    <defs>
                                        <linearGradient id={miniMapGradientId} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={isDarkMode ? '#525252' : '#e5e7eb'} stopOpacity={0.8} />
                                            <stop offset="95%" stopColor={isDarkMode ? '#525252' : '#e5e7eb'} stopOpacity={0.1} />
                                        </linearGradient>
                                    </defs>
                                    <XAxis
                                        dataKey="time"
                                        type="number"
                                        hide
                                        domain={[minTime, maxTime]}
                                    />
                                    <YAxis dataKey="conc" hide />
                                    <Area
                                        type="monotone"
                                        dataKey="conc"
                                        stroke={isDarkMode ? '#525252' : '#d1d5db'}
                                        strokeWidth={1}
                                        fill={`url(#${miniMapGradientId})`}
                                        isAnimationActive={false}
                                    />
                                    <Brush
                                        dataKey="time"
                                        height={20}
                                        stroke={isDarkMode ? '#737373' : '#9ca3af'}
                                        fill={isDarkMode ? '#171717' : '#ffffff'}
                                        startIndex={brushRange.startIndex}
                                        endIndex={brushRange.endIndex}
                                        travellerWidth={8}
                                        tickFormatter={(ms) => formatDate(new Date(ms), lang)}
                                        onChange={handleBrushChange}
                                    >
                                        <Area
                                            type="monotone"
                                            dataKey="conc"
                                            stroke="none"
                                            fill={isDarkMode ? '#404040' : '#d1d5db'}
                                            fillOpacity={0.4}
                                            isAnimationActive={false}
                                        />
                                    </Brush>
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    if (!sim || sim.timeH.length === 0) return (
        <div className="h-72 md:h-96 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-lg p-8">
            <Activity className="w-12 h-12 mb-4 text-gray-300 dark:text-gray-600" strokeWidth={1} />
            <p className="text-sm">{t('timeline.empty')}</p>
        </div>
    );

    return (
        <>
            {renderChartPanel(false)}
            {isFullscreen && createPortal(
                <div className="fixed inset-0 z-[120] bg-white dark:bg-neutral-900">
                    {isPortraitMobileFullscreen ? (
                        <div className="h-full w-full flex items-center justify-center overflow-hidden">
                            <div className="origin-center rotate-90" style={{ width: viewport.height, height: viewport.width }}>
                                {renderChartPanel(true)}
                            </div>
                        </div>
                    ) : (
                        <div className="h-full w-full">
                            {renderChartPanel(true)}
                        </div>
                    )}
                </div>,
                document.body
            )}
        </>
    );
};

export default ResultChart;
