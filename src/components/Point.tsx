import React from 'react';
import Doodle, { DoodleName } from './Doodle';

const divider = 'border-b border-[var(--border)]';

/** A row of the intro's chart step relative to the chart: its beat still to come, playing, or played. */
export type MarkState = 'asleep' | 'playing' | 'done';

interface PointProps {
    /** One of the drawings in Doodle. */
    mark: DoodleName;
    title: string;
    desc: string;
    /**
     * Where the chart above is relative to this row's beat — see the intro's
     * HowStep. The drawing and the title stay grey while the beat is still to
     * come, which is what stops the chart reading as decoration floating over
     * an unrelated list. Omitted on the rows of steps that have no chart.
     */
    state?: MarkState;
    /** Makes the row a button: the beat it names replays from the top. */
    onClick?: () => void;
}

/**
 * A drawing followed by a title and a line of explanation: the rows the intro
 * makes its case in. Lives here rather than in the intro because the signed-out
 * Account page makes part of the same case (records stay on this device, an
 * account is optional), and saying it in the same words beside the same
 * drawings is what lets someone recognise the promise they were shown on day
 * one.
 */
const Point: React.FC<PointProps> = ({ mark, title, desc, state = 'done', onClick }) => {
    const className = `flex w-full items-start gap-3.5 py-4 text-start ${divider} last:border-b-0`;
    const body = (
        <>
            <Doodle name={mark} asleep={state === 'asleep'} className="-mt-0.5" />
            <div>
                <p className={`text-[0.9375rem] font-medium ${state === 'asleep' ? 'text-muted' : 'text-body'}`}>
                    {title}
                </p>
                <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted">{desc}</p>
            </div>
        </>
    );
    return onClick ? (
        <button type="button" onClick={onClick} aria-pressed={state === 'playing'} className={className}>
            {body}
        </button>
    ) : (
        <div className={className}>{body}</div>
    );
};

export default Point;
