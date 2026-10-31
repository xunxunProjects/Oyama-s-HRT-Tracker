import React from 'react';

/**
 * The phone bottom bar's icons: the line icons the app used before 1.5.1, kept
 * here because the sidebar and the rest of the app moved on to the hand-drawn
 * set. House, ListTodo, Settings and CircleUser are lucide 1.52.0 (ISC,
 * https://lucide.dev); the lab icon is the app's own calibration curve. Each
 * carries `ink-icon` so it scales with --ui-scale like the others.
 */
interface TabIconProps {
    size?: number | string;
    strokeWidth?: number | string;
}

const line =
    (children: React.ReactNode): React.FC<TabIconProps> =>
    ({ size = 24, strokeWidth = 2 }) => (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            focusable="false"
            className="ink-icon"
        >
            {children}
        </svg>
    );

export const PHONE_TAB_ICONS: Record<string, React.FC<TabIconProps>> = {
    home: line(
        <>
            <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
            <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </>,
    ),
    history: line(
        <>
            <path d="M13 5h8" />
            <path d="M13 12h8" />
            <path d="M13 19h8" />
            <path d="m3 17 2 2 4-4" />
            <rect x="3" y="4" width="6" height="6" rx="1" />
        </>,
    ),
    // A solid model curve, a dashed calibrated one, and a cross for a lab result.
    lab: line(
        <>
            <path d="M3 13 C 7 13 9 5 13 5 S 17 21 21 21" />
            <path d="M3 18 C 7 18 9 12 13 12 S 17 16 21 14" strokeDasharray="3 2.5" />
            <path d="M14.5 17 l3 3 M17.5 17 l-3 3" />
        </>,
    ),
    settings: line(
        <>
            <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
            <circle cx="12" cy="12" r="3" />
        </>,
    ),
    account: line(
        <>
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="10" r="3" />
            <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662" />
        </>,
    ),
};
