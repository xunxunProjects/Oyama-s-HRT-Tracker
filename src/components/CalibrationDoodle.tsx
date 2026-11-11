import React from 'react';
import type { CalibrationMethod } from '../../logic';

const WASH = 'fill-[var(--illustration-wash)]';

/** A lab result, drawn as the charts draw it: a diamond, here washed. */
const Lab: React.FC<{ x: number; y: number; r?: number }> = ({ x, y, r = 3.6 }) => (
    <path
        className={WASH}
        d={`M${x} ${y - r}C${x + r * 0.5} ${y - r * 0.45} ${x + r * 0.7} ${y - r * 0.2} ${x + r} ${y + 0.1}C${x + r * 0.55} ${y + r * 0.5} ${x + r * 0.25} ${y + r * 0.75} ${x - 0.1} ${y + r}C${x - r * 0.4} ${y + r * 0.5} ${x - r * 0.7} ${y + r * 0.2} ${x - r} ${y}C${x - r * 0.6} ${y - r * 0.45} ${x - r * 0.3} ${y - r * 0.7} ${x + 0.15} ${y - r * 1.05}`}
    />
);

const dot = (x: number, y: number, k: number) => <path key={k} d={`M${x} ${y}h.05`} strokeWidth={3.2} />;

/**
 * One small drawing per calibration method, in the doodles' hand (Doodle.tsx):
 * one line colour, a flat wash, paths a little off true. Each shows the one
 * idea the method rests on, not its numbers.
 */
const DRAWINGS: Record<CalibrationMethod, React.ReactNode> = {
    // The model alone: one curve, nothing moving it.
    off: <path d="M8 52C18 50.4 22.4 18.6 34 18.2C46 17.8 60.6 40 112.4 46.2" />,
    // One correction: the dashed model lifted to meet the lab.
    mipd: (
        <>
            <path
                d="M8 54C18 53.2 22.4 32.6 34 32.3C46 32 60.6 46.2 112 50.4"
                strokeWidth={1.2}
                strokeDasharray="2.6 3.4"
            />
            <path d="M8 52C18 50.4 22.4 16.6 34 16.2C46 15.8 60.6 38 112.4 44.4" />
            <path d="M34.1 30.6C34.3 27.4 33.9 24.2 34 20.9" />
            <path d="M31.3 23.6L34 20.6L36.8 23.4" />
            <Lab x={70} y={30.2} />
        </>
    ),
    // One lab at a time: the estimate steps each time a result comes in.
    ekf: (
        <>
            <path d="M8 41C18 41.3 24 40.7 30.2 41" />
            <path d="M30 33C42 33.3 52 32.7 62.2 33" />
            <path d="M62 27.6C74 27.9 84 27.3 94.2 27.6" />
            <path d="M94 25.8C100 26 106 25.6 112.2 25.8" />
            <path d="M30.1 31.6V37.6" strokeWidth={1.1} strokeDasharray="1.6 2.4" />
            <path d="M62.1 25.6V30.4" strokeWidth={1.1} strokeDasharray="1.6 2.4" />
            <Lab x={30} y={27.2} />
            <Lab x={62} y={21.6} />
            <Lab x={94} y={22.6} />
        </>
    ),
    // A level that wanders and is pulled back to the model.
    ou_kalman: (
        <>
            <path d="M8 36.2C40 35.8 80 36.4 112 36" strokeWidth={1.2} strokeDasharray="2.6 3.4" />
            <path d="M12 21.4C18.4 21 21 49.6 30.4 48.2C40 46.8 42.2 26.4 52 28.4C61.8 30.4 64.2 42.4 74 40.4C82 38.8 86.2 33 94 34C101.6 35 106 36.3 112.2 36.1" />
            <Lab x={12} y={20.4} />
        </>
    ),
    // Several stories at once; the bold line is their weighted average.
    bayes: (
        <>
            <path d="M8 30C40 29.2 80 30.8 112 30" strokeWidth={1.1} />
            <path d="M8 44C40 40.4 80 24 112 18.2" strokeWidth={1.1} />
            <path d="M8 22.2C40 26.2 80 38.2 112 44" strokeWidth={1.1} />
            <path d="M8 32.2C40 31.6 80 31.2 112.2 30.7" strokeWidth={2.4} />
            <circle className={WASH} cx={115.4} cy={30} r={2.6} />
            <circle className={WASH} cx={115.4} cy={18.2} r={1.5} />
            <circle className={WASH} cx={115.4} cy={44} r={1.1} />
        </>
    ),
    // Random draws scattered round the curve they add up to.
    mcmc: (
        <>
            <path
                className={WASH}
                d="M8.2 30.2C14.2 29.9 20.2 29.9 26.2 30.2C26.5 36.2 26.5 42.2 26.2 48.2C20.2 48.5 14.2 48.5 8.2 48.2C7.9 42.2 7.9 36.2 8.4 30"
            />
            <path d="M20.4 12.2C25.4 11.9 30.4 11.9 35.4 12.2C35.7 17.2 35.7 22.2 35.4 27.2C30.4 27.5 25.4 27.5 20.4 27.2C20.1 22.2 20.1 17.2 20.6 12" />
            {[
                [12.8, 34.8],
                [21.6, 43.6],
                [24.2, 16.2],
                [27.9, 19.7],
                [31.6, 23.2],
            ].map(([x, y], k) => dot(x, y, k))}
            <path d="M40 54C50 52.2 56 22.4 70 22.2C84 22 94 42 114 46.2" strokeWidth={2.2} />
            {[
                [48, 46],
                [52, 38.6],
                [55.4, 31],
                [60, 25.6],
                [66, 18.8],
                [72.4, 26.4],
                [78, 23.6],
                [84, 31.2],
                [90.4, 34],
                [96, 40.4],
                [102, 41],
                [108.4, 47.4],
                [57, 36.4],
                [75, 18.6],
                [87, 37.6],
                [99, 45.2],
            ].map(([x, y], k) => dot(x, y, k + 10))}
        </>
    ),
};

const CalibrationDoodle: React.FC<{ method: CalibrationMethod; className?: string }> = ({ method, className = '' }) => (
    <svg
        viewBox="0 0 120 64"
        aria-hidden="true"
        focusable="false"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`block h-auto w-[7.5rem] shrink-0 text-[var(--illustration-line)] ${className}`}
    >
        {DRAWINGS[method]}
    </svg>
);

export default CalibrationDoodle;
