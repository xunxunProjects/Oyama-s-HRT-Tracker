import React from 'react';
import { Busy } from './icons';

/**
 * Two labels stacked in one grid cell, only one visible. The cell always takes
 * the wider label's width, so a button that flips "Copy" to "Copied" (or the
 * much longer Japanese and Turkish wording) keeps its size instead of jumping.
 */
export const SwapLabel: React.FC<{ show: boolean; off: React.ReactNode; on: React.ReactNode }> = ({
    show,
    off,
    on,
}) => (
    <span className="grid">
        <span className={`col-start-1 row-start-1 ${show ? 'invisible' : ''}`} aria-hidden={show}>
            {off}
        </span>
        <span className={`col-start-1 row-start-1 ${show ? '' : 'invisible'}`} aria-hidden={!show}>
            {on}
        </span>
    </span>
);

/**
 * A button's content that keeps its footprint while busy: the label stays in
 * the layout but turns invisible, and the spinner sits over its middle. Adding
 * a spinner beside the label instead made the button grow (or the label slide)
 * the moment it was pressed.
 */
export const BusyLabel: React.FC<{ busy: boolean; size?: number; children: React.ReactNode }> = ({
    busy,
    size = 16,
    children,
}) => (
    <span className="relative inline-flex items-center justify-center">
        <span className={`inline-flex items-center gap-1.5 ${busy ? 'invisible' : ''}`}>{children}</span>
        {busy && <Busy size={size} className="absolute animate-spin" aria-hidden="true" />}
    </span>
);
