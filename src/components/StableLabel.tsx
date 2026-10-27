import React from 'react';
import { Busy } from './icons';

/**
 * Two labels stacked in one grid cell, only one visible. The cell always takes
 * the wider label's width, so a button that flips "Copy" to "Copied" (or the
 * much longer Japanese and Turkish wording) keeps its size instead of jumping.
 * Both labels start at the cell's start, right after the icon before them: a
 * button centres its text, and a short "Copied" used to land in the middle of
 * the space "Copy as table" kept, far from its tick. The switch rolls: the old
 * label goes up and out as the new one comes up into its place (.swap-label).
 */
export const SwapLabel: React.FC<{ show: boolean; off: React.ReactNode; on: React.ReactNode }> = ({
    show,
    off,
    on,
}) => (
    <span className="swap-label grid justify-items-start text-start">
        <span className="col-start-1 row-start-1" data-shown={!show} data-from="above" aria-hidden={show}>
            {off}
        </span>
        <span className="col-start-1 row-start-1" data-shown={show} data-from="below" aria-hidden={!show}>
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
