import React from 'react';
import { ChevronDown } from '../icons';

const inertWhen = (closed: boolean) => (closed ? ({ inert: '' } as Record<string, unknown>) : {});

/**
 * Reference text in the dose form (the injection guide, the CPA hint): its
 * heading and the one line that matters stay in view, and the rest folds away
 * underneath until it's tapped, as DoseAdvisory does for warnings. Left open,
 * the injection guide put its whole dosage table and nine precautions between
 * the dose field and Save on every log and every edit, for people who read it
 * the first time and inject every week.
 *
 * The wording is the caller's and is shown as written; this only decides how
 * much of it is open.
 */
const GuideFold: React.FC<{
    icon: React.ReactNode;
    heading: React.ReactNode;
    /** Shown under the heading whether open or not: the safety sentence, or the recommended dose. */
    lead: React.ReactNode;
    children: React.ReactNode;
}> = ({ icon, heading, lead, children }) => {
    const [open, setOpen] = React.useState(false);
    const bodyId = React.useId();

    return (
        <div>
            {/* type="button": this sits inside the dose form. */}
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
                aria-controls={bodyId}
                className="group flex w-full items-start gap-2 text-start"
            >
                {icon}
                <span className="min-w-0">
                    {/* The chevron trails the heading, as on a warning's lead. */}
                    <span className="block">
                        {heading}
                        <ChevronDown
                            size={16}
                            strokeWidth={1.75}
                            className={`chev ms-1 inline-block align-[-3px] text-[var(--text-muted)] opacity-60 group-hover:opacity-100 ${open ? 'rotate-180' : ''}`}
                        />
                    </span>
                    {lead}
                </span>
            </button>
            <div id={bodyId} className="disclosure" data-open={open} {...inertWhen(!open)}>
                <div className="disclosure-inner">
                    <div className={open ? 'advisory-unfold' : undefined}>{children}</div>
                </div>
            </div>
        </div>
    );
};

export default GuideFold;
