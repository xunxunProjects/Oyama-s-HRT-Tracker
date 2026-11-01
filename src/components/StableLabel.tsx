import React from 'react';
import { Busy, Close, Plus } from './icons';

/**
 * The width of whichever of two stacked labels is shown, kept up to date, for
 * a cell that slides from one label's width to the other's (.swap-label-fit).
 */
function useShownWidth(show: boolean, enabled: boolean) {
    const offRef = React.useRef<HTMLSpanElement>(null);
    const onRef = React.useRef<HTMLSpanElement>(null);
    const [width, setWidth] = React.useState<number>();

    React.useLayoutEffect(() => {
        const el = enabled ? (show ? onRef : offRef).current : null;
        if (!el) return;
        const measure = () => setWidth(el.getBoundingClientRect().width);
        measure();
        // A language switch or a late font changes the label's width too.
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, [enabled, show]);

    return { offRef, onRef, width };
}

/**
 * Two labels stacked in one grid cell, only one visible. The cell always takes
 * the wider label's width, so a button that flips "Copy" to "Copied" (or the
 * much longer Japanese and Turkish wording) keeps its size instead of jumping.
 * Both labels start at the cell's start, right after the icon before them: a
 * button centres its text, and a short "Copied" used to land in the middle of
 * the space "Copy as table" kept, far from its tick. A text button at the end
 * of a row passes align="end" instead, so a short "コピー" sits against the
 * edge rather than out in the room "コピーしました" keeps. The switch rolls:
 * the old label goes up and out as the new one comes up into its place
 * (.swap-label).
 *
 * `fit` is for wherever that kept room would show: an icon before the label
 * at a row's end, a capsule's fill, the next button along. The cell then takes
 * only the shown label's width and slides to the new one's (.swap-label-fit).
 * Kept to the wider label's width, "Copy" stopped short of the row's edge with
 * its icon out in the room "Copied" kept, and a capsule held an empty end.
 */
export const SwapLabel: React.FC<{
    show: boolean;
    off: React.ReactNode;
    on: React.ReactNode;
    align?: 'start' | 'end';
    fit?: boolean;
}> = ({ show, off, on, align = 'start', fit = false }) => {
    const { offRef, onRef, width } = useShownWidth(show, fit);
    return (
        <span
            className={`swap-label grid ${fit ? 'swap-label-fit' : ''} ${align === 'end' ? 'justify-items-end text-end' : 'justify-items-start text-start'}`}
            style={fit ? { width } : undefined}
        >
            <span
                ref={offRef}
                className="col-start-1 row-start-1"
                data-shown={!show}
                data-from="above"
                aria-hidden={show}
            >
                {off}
            </span>
            <span
                ref={onRef}
                className="col-start-1 row-start-1"
                data-shown={show}
                data-from="below"
                aria-hidden={!show}
            >
                {on}
            </span>
        </span>
    );
};

/**
 * The page's add button that, while its form is open, turns into Cancel. The
 * form unfolding below is the motion; the button only cross-fades from "+ Add"
 * to "x Cancel" in place. A plus spinning into a cross while the label rolled
 * up read as a toy next to a calm unfold, so neither travels here. The button
 * sits at the end of the page's header, so its label fits the word shown and
 * the button slides to the new width: kept to "Add lab result", "Cancel" left
 * the open button's fill empty at its end.
 */
export const AddCancelLabel: React.FC<{ open: boolean; add: React.ReactNode; cancel: React.ReactNode }> = ({
    open,
    add,
    cancel,
}) => {
    const { offRef, onRef, width } = useShownWidth(open, true);
    return (
        <>
            <span className="swap-label grid" aria-hidden="true">
                <span className="col-start-1 row-start-1" data-shown={!open}>
                    <Plus size={15} />
                </span>
                <span className="col-start-1 row-start-1" data-shown={open}>
                    <Close size={15} />
                </span>
            </span>
            <span className="swap-label swap-label-fit grid justify-items-end text-end" style={{ width }}>
                <span ref={offRef} className="col-start-1 row-start-1" data-shown={!open} aria-hidden={open}>
                    {add}
                </span>
                <span ref={onRef} className="col-start-1 row-start-1" data-shown={open} aria-hidden={!open}>
                    {cancel}
                </span>
            </span>
        </>
    );
};

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
