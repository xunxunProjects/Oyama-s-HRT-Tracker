import React from 'react';
import { Route } from '../../logic';
import { DUOTONE } from './icons/phosphor';

/**
 * The larger drawings: one for each route a dose can take (at the head of a
 * row), and the ones the empty pages and the intro carry. Phosphor's duotone
 * icons, in the illustration colour: the line, with a 20% wash of the same
 * colour under it. `asleep` greys one out (a row whose turn has not come).
 */
export type DoodleName =
    | Route
    | 'syringe'
    | 'chart'
    | 'vial'
    | 'lock'
    | 'cloud'
    | 'caution'
    | 'code'
    | 'heart'
    | 'house'
    | 'notebook'
    | 'gear'
    | 'person'
    | 'report'
    | 'lens'
    | 'flask'
    | 'pencil'
    | 'shield'
    | 'molecule'
    | 'question'
    | 'scales'
    | 'calendar'
    | 'sparkle';

interface DoodleProps {
    name: DoodleName;
    /** Rendered width and height in rem, so it scales with the type beside it. */
    size?: number;
    /** Grey: a row whose turn has not come, or that can't be chosen. */
    asleep?: boolean;
    className?: string;
}

const Doodle: React.FC<DoodleProps> = ({ name, size = 2.25, asleep = false, className = '' }) => {
    const art = DUOTONE[name as keyof typeof DUOTONE] ?? DUOTONE.question;
    return (
        <svg
            viewBox="0 0 256 256"
            aria-hidden="true"
            focusable="false"
            fill="currentColor"
            style={{ width: `${size}rem`, height: `${size}rem` }}
            className={`shrink-0 ${asleep ? 'text-[var(--text-disabled)]' : 'text-[var(--illustration-line)]'} ${className}`}
        >
            {art.wash && <path d={art.wash} opacity={0.2} />}
            <path d={art.line} />
        </svg>
    );
};

export default Doodle;
