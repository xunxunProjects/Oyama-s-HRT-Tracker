import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { formatDate, formatTime } from '../utils/helpers';
import { SimulationResult, DoseEvent, interpolateConcentration, interpolateConcentration_E2, interpolateConcentration_CPA, LabResult, convertToPgMl } from '../../logic';
import { Activity, RotateCcw, Info, FlaskConical } from 'lucide-react';
import {
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart, ComposedChart, Scatter, Brush, Line
} from 'recharts';

const CustomTooltip = ({ active, payload, label, t, lang }: any) => {
    if (active && payload && payload.length) {
        // If it's a lab result point
        if (payload[0].payload.isLabResult) {
            const data = payload[0].payload;
            return (
                <div className="bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] backdrop-blur-sm px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-m3-outline-variant)]/30 dark:border-[var(--color-m3-dark-outline-variant)]/30 shadow-[var(--shadow-m3-1)]">
                    <p className="text-[10px] font-medium text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] mb-0.5 flex items-center gap-1">
                        <FlaskConical size={10} />
                        {formatDate(new Date(label), lang)} {formatTime(new Date(label))}
                    </p>
                    <div className="flex items-baseline gap-1">
                        <span className="text-base font-black text-[var(--color-m3-primary)] dark:text-pink-400 tracking-tight">
                            {data.originalValue}
                        </span>
                        <span className="text-[10px] font-bold text-pink-400 dark:text-pink-600">{data.originalUnit}</span>
                    </div>
                    {data.originalUnit === 'pmol/l' && (
                        <div className="text-[9px] text-gray-400 dark:text-gray-500 mt-0.5">
                            ≈ {data.conc.toFixed(1)} pg/mL
                        </div>
                    )}
                </div>
            );
        }

        const dataPoint = payload[0].payload;
        const concE2 = dataPoint.concE2 || 0;
        const concCPA = dataPoint.concCPA || 0; // Already in ng/mL

        return (
            <div className="bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] backdrop-blur-sm px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-m3-outline-variant)]/30 dark:border-[var(--color-m3-dark-outline-variant)]/30 shadow-[var(--shadow-m3-1)]">
                <p className="text-[10px] font-medium text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] mb-0.5">
                    {formatDate(new Date(label), lang)} {formatTime(new Date(label))}
                </p>
                {concE2 > 0 && (
                    <div className="flex items-baseline gap-1">
                        <span className="text-[9px] font-bold text-pink-400">{t('label.e2')}:</span>
                        <span className="text-sm font-black text-pink-500 dark:text-pink-400 tracking-tight">
                            {concE2.toFixed(1)}
                        </span>
                        <span className="text-[10px] font-bold text-pink-300 dark:text-pink-600">pg/mL</span>
                    </div>
                )}
                {concCPA > 0 && (
                    <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="text-[9px] font-bold text-purple-400">{t('label.cpa_chart')}:</span>
                        <span className="text-sm font-black text-purple-600 dark:text-purple-400 tracking-tight">
                            {concCPA.toFixed(1)}
                        </span>
                        <span className="text-[10px] font-bold text-purple-300 dark:text-purple-600">ng/mL</span>
                    </div>
                )}
            </div>
        );
    }
    return null;
};

const ResultChart = ({ sim, events, labResults = [], calibrationFn = (_t: number) => 1, onPointClick, isDarkMode = false }: { sim: SimulationResult | null, events: DoseEvent[], labResults?: LabResult[], calibrationFn?: (timeH: number) => number, onPointClick: (e: DoseEvent) => void, isDarkMode?: boolean }) => {
    const { t, lang } = useTranslation();
    const containerRef = useRef<HTMLDivElement>(null);
    const [xDomain, setXDomain] = useState<[number, number] | null>(null);
    const initializedRef = useRef(false);

    // Auto-detect if we have E2 or CPA data
    const hasE2Data = useMemo(() => events.some(e => e.ester !== 'CPA'), [events]);
    const hasCPAData = useMemo(() => events.some(e => e.ester === 'CPA'), [events]);

    const data = useMemo(() => {
        if (!sim || sim.timeH.length === 0) return [];
        return sim.timeH.map((t, i) => {
            const timeMs = t * 3600000;
            const scale = calibrationFn(t);
            // Only apply calibration to E2, not CPA (lab results only measure E2)
            const calibratedE2 = sim.concPGmL_E2[i] * scale; // pg/mL
            const rawCPA_ngmL = sim.concPGmL_CPA[i]; // ng/mL
            return {
                time: timeMs,
                concE2: calibratedE2, // pg/mL for left Y-axis
                concCPA: rawCPA_ngmL, // ng/mL for right Y-axis
                conc: calibratedE2 // For overview chart
            };
        });
    }, [sim, calibrationFn]);

    const labPoints = useMemo(() => {
        if (!labResults || labResults.length === 0) return [];
        return labResults.map(l => ({
            time: l.timeH * 3600000,
            concE2: convertToPgMl(l.concValue, l.unit),
            originalValue: l.concValue,
            originalUnit: l.unit,
            isLabResult: true,
            id: l.id
        }));
    }, [labResults]);

    const eventPoints = useMemo(() => {
        if (!sim || events.length === 0) return [];

        // Split events by ester type
        const e2Events = events.filter(e => e.ester !== 'CPA');
        const cpaEvents = events.filter(e => e.ester === 'CPA');

        // Map E2 events to data points
        const e2Points = e2Events.map(e => {
            const timeMs = e.timeH * 3600000;
            const concE2 = interpolateConcentration_E2(sim, e.timeH);
            const calibratedE2 = concE2 !== null && !Number.isNaN(concE2)
                ? concE2 * calibrationFn(e.timeH)
                : 0; // pg/mL

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
    }, [sim, events, calibrationFn]);

    const cpaEventPoints = useMemo(() => {
        if (!sim || eventPoints.cpaEvents.length === 0) return [];

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
    }, [sim, eventPoints.cpaEvents]);

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

        const concE2 = interpolateConcentration_E2(sim, h);
        const concCPA = interpolateConcentration_CPA(sim, h);

        // If both are null/NaN, return null
        const hasE2 = concE2 !== null && !Number.isNaN(concE2);
        const hasCPA = concCPA !== null && !Number.isNaN(concCPA);

        if (!hasE2 && !hasCPA) return null;

        // Only calibrate E2, not CPA
        const calibratedE2 = hasE2 ? concE2 * calibrationFn(h) : 0;
        const finalCPA = hasCPA ? concCPA : 0;

        return {
            time: now,
            concE2: calibratedE2, // pg/mL
            concCPA: finalCPA // ng/mL
        };
    }, [sim, data, now, calibrationFn]);

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
        return Math.abs(data[high].time - time) < Math.abs(data[low].time - time) ? high : low;
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
        const endIndex = Math.max(startIndex + 1, Math.min(range.endIndex, data.length - 1));
        const start = data[startIndex].time;
        const end = data[endIndex].time;
        setXDomain(clampDomain([start, end]));
    };

    if (!sim || sim.timeH.length === 0) return (
        <div className="h-72 md:h-96 flex flex-col items-center justify-center text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] rounded-[var(--radius-xl)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] shadow-[var(--shadow-m3-1)] p-8 transition-colors duration-300">
            <Activity className="w-12 h-12 mb-4 text-[var(--color-m3-outline-variant)] dark:text-[var(--color-m3-dark-outline-variant)]" strokeWidth={1.5} />
            <p className="text-sm font-medium">{t('timeline.empty')}</p>
        </div>
    );

    return (
        <div className="bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] rounded-[var(--radius-xl)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] relative overflow-hidden flex flex-col transition-colors duration-300 shadow-[var(--shadow-m3-1)]">
            <div className="flex justify-between items-center px-4 md:px-6 py-3 md:py-4 border-b border-[var(--color-m3-outline-variant)]/50 dark:border-[var(--color-m3-dark-outline-variant)]/50">
                <h2 className="text-sm md:text-base font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] tracking-tight flex items-center gap-2" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif' }}>
                    <Activity size={20} className="text-pink-400 md:w-5 md:h-5" />
                    {t('chart.title')}
                </h2>

                <div className="flex items-center gap-3">
                    <div className="flex bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container-high)] rounded-[var(--radius-md)] p-1 gap-1 border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]">
                        <button
                            onClick={() => {
                                zoomToDuration(7);
                            }}
                            className="p-1.5 text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] rounded-[var(--radius-sm)] hover:bg-[var(--color-m3-surface-container-high)] dark:hover:bg-[var(--color-m3-dark-surface-container-highest)] transition-all"
                        >
                            <RotateCcw size={14} className="md:w-4 md:h-4" />
                        </button>
                    </div>
                </div>
            </div>

            <div
                ref={containerRef}
                className="h-64 md:h-80 lg:h-96 w-full touch-none relative select-none px-2 pb-2">
                {(() => {
                    const factorNow = calibrationFn(now / 3600000);
                    return Math.abs(factorNow - 1) > 0.001 ? (
                        <div className="absolute top-3 left-4 z-10 px-2.5 py-1 rounded-lg border bg-pink-50 dark:bg-pink-900/40 border-pink-200 dark:border-pink-800 shadow-sm backdrop-blur-sm flex items-center gap-1.5 pointer-events-none opacity-90">
                            <FlaskConical size={12} className="text-pink-600 dark:text-pink-400" />
                            <span className="text-[10px] md:text-xs font-bold text-pink-700 dark:text-pink-300">
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
                                tick={{ fontSize: 10, fill: '#ec4899', fontWeight: 600 }}
                                axisLine={false}
                                tickLine={false}
                                width={50}
                                label={{ value: t('label.e2_unit'), angle: -90, position: 'left', offset: 0, style: { fontSize: 11, fill: '#ec4899', fontWeight: 700, textAnchor: 'middle' } }}
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
                            content={<CustomTooltip t={t} lang={lang} />}
                            cursor={{ stroke: '#f472b6', strokeWidth: 1, strokeDasharray: '4 4' }}
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
                        {/* E2 Event Points */}
                        {eventPoints.e2Points.length > 0 && (
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
                                        <circle cx={cx} cy={cy} r={6} fill="#fff7ed" stroke="#fb923c" strokeWidth={1.6} />
                                        <circle cx={cx} cy={cy} r={3} fill="#f97316" />
                                    </g>
                                )}
                            />
                        )}
                        {/* CPA Event Points */}
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
                                        <circle cx={cx} cy={cy} r={6} fill="#faf5ff" stroke="#a855f7" strokeWidth={1.6} />
                                        <circle cx={cx} cy={cy} r={3} fill="#8b5cf6" />
                                    </g>
                                )}
                            />
                        )}
                        {hasE2Data && (
                            <Scatter
                                data={nowPoint ? [nowPoint] : []}
                                yAxisId="left"
                                isAnimationActive={false}
                                shape={({ cx, cy, payload }: any) => {
                                    const conc = payload?.concE2 ?? 0;
                                    const radius = Math.max(4, Math.min(7, 4 + conc / 80)); // Scale dot size with live E2 but cap size
                                    return (
                                        <g className="group">
                                            <circle cx={cx} cy={cy} r={1} fill="transparent" />
                                            <circle
                                                cx={cx} cy={cy}
                                                r={radius}
                                                fill="#bfdbfe"
                                                stroke="white"
                                                strokeWidth={1.5}
                                            />
                                        </g>
                                    );
                                }}
                            />
                        )}
                        {hasCPAData && (
                            <Scatter
                                data={nowPoint ? [nowPoint] : []}
                                yAxisId="right"
                                isAnimationActive={false}
                                shape={({ cx, cy, payload }: any) => {
                                    const conc = payload?.concCPA ?? 0;
                                    const radius = Math.max(4, Math.min(9, 4 + conc / 8)); // Scale dot size with live CPA but cap size
                                    return (
                                        <g className="group">
                                            <circle cx={cx} cy={cy} r={1} fill="transparent" />
                                            <circle
                                                cx={cx} cy={cy}
                                                r={radius}
                                                fill="#c4b5fd"
                                                stroke="white"
                                                strokeWidth={1.5}
                                            />
                                        </g>
                                    );
                                }}
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
            {/* Overview mini-map with draggable handles */}
            {data.length > 1 && (
                <div className="px-3 pb-4 mt-1">
                    <div className="w-full h-16 bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container-high)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] rounded-[var(--radius-sm)] shadow-inner overflow-hidden transition-colors duration-300">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data} margin={{ top: 6, right: 8, left: -6, bottom: 6 }}>
                                <defs>
                                    <linearGradient id="overviewConc" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#bfdbfe" stopOpacity={0.28} />
                                        <stop offset="95%" stopColor="#bfdbfe" stopOpacity={0} />
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
                                    stroke="#bfdbfe"
                                    strokeWidth={1.2}
                                    fill="url(#overviewConc)"
                                    isAnimationActive={false}
                                />
                                <Brush
                                    dataKey="time"
                                    height={22}
                                    stroke={isDarkMode ? "#4b5563" : "#bfdbfe"}
                                    fill={isDarkMode ? "#1f2937" : "#fff"}
                                    startIndex={brushRange.startIndex}
                                    endIndex={brushRange.endIndex}
                                    travellerWidth={10}
                                    tickFormatter={(ms) => formatDate(new Date(ms), lang)}
                                    onChange={handleBrushChange}
                                >
                                    <Area
                                        type="monotone"
                                        dataKey="conc"
                                        stroke="#93c5fd"
                                        fill="#bfdbfe"
                                        fillOpacity={0.15}
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

export default ResultChart;
