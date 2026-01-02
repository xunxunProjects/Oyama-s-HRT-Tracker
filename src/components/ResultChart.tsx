import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { formatDate, formatTime } from '../utils/helpers';
import { SimulationResult, DoseEvent, interpolateConcentration, interpolateConcentration_E2, interpolateConcentration_CPA, LabResult, convertToPgMl } from '../../logic';
import { Activity, RotateCcw, Info, FlaskConical } from 'lucide-react';
import {
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart, ComposedChart, Scatter, Brush
} from 'recharts';

const CustomTooltip = ({ active, payload, label, t, lang }: any) => {
    if (active && payload && payload.length) {
        // If it's a lab result point
        if (payload[0].payload.isLabResult) {
            const data = payload[0].payload;
            return (
                <div className="bg-white/90 backdrop-blur-sm px-3 py-2 rounded-xl border border-teal-100/50 shadow-sm">
                    <p className="text-[10px] font-medium text-gray-400 mb-0.5 flex items-center gap-1">
                        <FlaskConical size={10} />
                        {formatDate(new Date(label), lang)} {formatTime(new Date(label))}
                    </p>
                    <div className="flex items-baseline gap-1">
                        <span className="text-base font-black text-teal-600 tracking-tight">
                            {data.originalValue}
                        </span>
                        <span className="text-[10px] font-bold text-teal-400">{data.originalUnit}</span>
                    </div>
                    {data.originalUnit === 'pmol/l' && (
                        <div className="text-[9px] text-gray-400 mt-0.5">
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
            <div className="bg-white/90 backdrop-blur-sm px-3 py-2 rounded-xl border border-pink-100/50 shadow-sm">
                <p className="text-[10px] font-medium text-gray-400 mb-0.5">
                    {formatDate(new Date(label), lang)} {formatTime(new Date(label))}
                </p>
                {concE2 > 0 && (
                    <div className="flex items-baseline gap-1">
                        <span className="text-[9px] font-bold text-pink-400">E2:</span>
                        <span className="text-sm font-black text-pink-500 tracking-tight">
                            {concE2.toFixed(1)}
                        </span>
                        <span className="text-[10px] font-bold text-pink-300">pg/mL</span>
                    </div>
                )}
                {concCPA > 0 && (
                    <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="text-[9px] font-bold text-purple-400">CPA:</span>
                        <span className="text-sm font-black text-purple-600 tracking-tight">
                            {concCPA.toFixed(1)}
                        </span>
                        <span className="text-[10px] font-bold text-purple-300">ng/mL</span>
                    </div>
                )}
            </div>
        );
    }
    return null;
};

const ResultChart = ({ sim, events, labResults = [], calibrationFn = (_t: number) => 1, onPointClick }: { sim: SimulationResult | null, events: DoseEvent[], labResults?: LabResult[], calibrationFn?: (timeH: number) => number, onPointClick: (e: DoseEvent) => void }) => {
    const { t, lang } = useTranslation();
    const containerRef = useRef<HTMLDivElement>(null);
    const [xDomain, setXDomain] = useState<[number, number] | null>(null);
    const initializedRef = useRef(false);

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
                concCPA: rawCPA_ngmL // ng/mL for right Y-axis
            };
        });
    }, [sim, calibrationFn]);

    const labPoints = useMemo(() => {
        if (!labResults || labResults.length === 0) return [];
        return labResults.map(l => ({
            time: l.timeH * 3600000,
            conc: convertToPgMl(l.concValue, l.unit),
            originalValue: l.concValue,
            originalUnit: l.unit,
            isLabResult: true,
            id: l.id
        }));
    }, [labResults]);

    const eventPoints = useMemo(() => {
        if (!sim || events.length === 0) return [];

        // Map events to data points, find closest concentration from sim
        return events.map(e => {
            const timeMs = e.timeH * 3600000;
            const scale = calibrationFn(e.timeH);
            // Find closest time in sim
            const closestIdx = sim.timeH.reduce((prev, curr, i) =>
                Math.abs(curr * 3600000 - timeMs) < Math.abs(sim.timeH[prev] * 3600000 - timeMs) ? i : prev
            , 0);

            // Only calibrate E2, not CPA
            const calibratedE2 = sim.concPGmL_E2[closestIdx] * scale; // pg/mL

            return {
                time: timeMs,
                concE2: calibratedE2, // Use E2 for positioning on left Y-axis
                event: e
            };
        });
    }, [sim, events, calibrationFn]);

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
        <div className="h-72 md:h-96 flex flex-col items-center justify-center text-gray-400 bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
            <Activity className="w-12 h-12 mb-4 text-gray-200" strokeWidth={1.5} />
            <p className="text-sm font-medium">{t('timeline.empty')}</p>
        </div>
    );

    return (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm relative overflow-hidden flex flex-col">
            <div className="flex justify-between items-center px-4 md:px-6 py-3 md:py-4 border-b border-gray-100">
                <h2 className="text-sm md:text-base font-semibold text-gray-800 tracking-tight flex items-center gap-2" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif' }}>
                    <span className="inline-flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-xl bg-pink-50 border border-pink-100">
                        <Activity size={16} className="text-[#f6c4d7] md:w-5 md:h-5" />
                    </span>
                    {t('chart.title')}
                </h2>

                <div className="flex bg-gray-50 rounded-xl p-1 gap-1 border border-gray-100">
                    <button
                        onClick={() => zoomToDuration(30)}
                        className="px-3 py-1.5 text-xs md:text-sm font-bold text-gray-600 rounded-lg hover:bg-white transition-all">
                        1M
                    </button>
                    <button
                        onClick={() => zoomToDuration(7)}
                        className="px-3 py-1.5 text-xs md:text-sm font-bold text-gray-600 rounded-lg hover:bg-white transition-all">
                        1W
                    </button>
                    <div className="w-px h-4 bg-gray-200 self-center mx-1"></div>
                    <button
                        onClick={() => {
                            zoomToDuration(7);
                        }}
                        className="p-1.5 text-gray-600 rounded-lg hover:bg-white transition-all"
                    >
                        <RotateCcw size={14} className="md:w-4 md:h-4" />
                    </button>
                </div>
            </div>

            <div
                ref={containerRef}
                className="h-64 md:h-80 lg:h-96 w-full touch-none relative select-none px-2 pb-2">
                {(() => {
                    const factorNow = calibrationFn(now / 3600000);
                    return Math.abs(factorNow - 1) > 0.001 ? (
                    <div className="absolute top-3 left-4 z-10 px-2.5 py-1 rounded-lg border bg-teal-50 border-teal-200 shadow-sm backdrop-blur-sm flex items-center gap-1.5 pointer-events-none opacity-90">
                        <FlaskConical size={12} className="text-teal-600" />
                        <span className="text-[10px] md:text-xs font-bold text-teal-700">
                            ×{(factorNow ?? 1).toFixed(2)}
                        </span>
                    </div>
                    ) : null;
                })()}
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data} margin={{ top: 12, right: 10, bottom: 0, left: 10 }}>
                        <defs>
                            <linearGradient id="colorConc" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f6c4d7" stopOpacity={0.18}/>
                                <stop offset="95%" stopColor="#f6c4d7" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorCPA" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.18}/>
                                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f2f4f7" />
                        <XAxis
                            dataKey="time"
                            type="number"
                            domain={xDomain || ['auto', 'auto']}
                            allowDataOverflow={true}
                            tickFormatter={(ms) => formatDate(new Date(ms), lang)}
                            tick={{fontSize: 10, fill: '#9aa3b1', fontWeight: 600}}
                            minTickGap={48}
                            axisLine={false}
                            tickLine={false}
                            dy={10}
                        />
                        <YAxis
                            yAxisId="left"
                            dataKey="concE2"
                            tick={{fontSize: 10, fill: '#ec4899', fontWeight: 600}}
                            axisLine={false}
                            tickLine={false}
                            width={50}
                            label={{ value: 'E2 (pg/mL)', angle: -90, position: 'left', offset: 0, style: { fontSize: 11, fill: '#ec4899', fontWeight: 700, textAnchor: 'middle' } }}
                        />
                        <YAxis
                            yAxisId="right"
                            orientation="right"
                            dataKey="concCPA"
                            tick={{fontSize: 10, fill: '#8b5cf6', fontWeight: 600}}
                            axisLine={false}
                            tickLine={false}
                            width={50}
                            label={{ value: 'CPA (ng/mL)', angle: 90, position: 'right', offset: 0, style: { fontSize: 11, fill: '#8b5cf6', fontWeight: 700, textAnchor: 'middle' } }}
                        />
                        <Tooltip 
                            content={<CustomTooltip t={t} lang={lang} />} 
                            cursor={{ stroke: '#f6c4d7', strokeWidth: 1, strokeDasharray: '4 4' }} 
                            trigger="hover"
                        />
                        <ReferenceLine x={now} stroke="#f6c4d7" strokeDasharray="3 3" strokeWidth={1.2} yAxisId="left" />
                        <Area
                            data={data}
                            type="monotone"
                            dataKey="concE2"
                            yAxisId="left"
                            stroke="#f6c4d7"
                            strokeWidth={2.2}
                            fillOpacity={0.95}
                            fill="url(#colorConc)"
                            isAnimationActive={false}
                            activeDot={{ r: 6, strokeWidth: 3, stroke: '#fff', fill: '#ec4899' }}
                        />
                        <Area
                            data={data}
                            type="monotone"
                            dataKey="concCPA"
                            yAxisId="right"
                            stroke="#8b5cf6"
                            strokeWidth={2.2}
                            fillOpacity={0.95}
                            fill="url(#colorCPA)"
                            isAnimationActive={false}
                            activeDot={{ r: 6, strokeWidth: 3, stroke: '#fff', fill: '#7c3aed' }}
                        />
                        <Scatter
                            data={nowPoint ? [nowPoint] : []}
                            yAxisId="left"
                            isAnimationActive={false}
                            shape={({ cx, cy }: any) => {
                                return (
                                    <g className="group">
                                        <circle cx={cx} cy={cy} r={1} fill="transparent" />
                                        <circle
                                            cx={cx} cy={cy}
                                            r={4}
                                            fill="#bfdbfe"
                                            stroke="white"
                                            strokeWidth={1.5}
                                        />
                                    </g>
                                );
                            }}
                        />
                        <Scatter
                            data={nowPoint ? [nowPoint] : []}
                            yAxisId="right"
                            isAnimationActive={false}
                            shape={({ cx, cy }: any) => {
                                return (
                                    <g className="group">
                                        <circle cx={cx} cy={cy} r={1} fill="transparent" />
                                        <circle
                                            cx={cx} cy={cy}
                                            r={4}
                                            fill="#c4b5fd"
                                            stroke="white"
                                            strokeWidth={1.5}
                                        />
                                    </g>
                                );
                            }}
                        />
                        {labPoints.length > 0 && (
                            <Scatter
                                data={labPoints}
                                yAxisId="left"
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
                    <div className="w-full h-16 bg-gray-50/80 border border-gray-100 rounded-none shadow-inner overflow-hidden">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data} margin={{ top: 6, right: 8, left: -6, bottom: 6 }}>
                                <defs>
                                    <linearGradient id="overviewConc" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#bfdbfe" stopOpacity={0.28}/>
                                        <stop offset="95%" stopColor="#bfdbfe" stopOpacity={0}/>
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
                                    stroke="#bfdbfe"
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
