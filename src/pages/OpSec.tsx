import React from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import { useTranslation } from '../contexts/LanguageContext';
import { getOpSecContent, type OpSecBlock, type OpSecCalloutKind, type OpSecSection } from '../content/opsec';
import { scrollParent } from '../utils/scrollParent';
import { Alert, CheckCircle, Info, Warning } from '../components/icons';
import '../styles/opsec.css';

/** The reading column stays at the app's width on a phone and grows just
 *  enough for the contents rail on a wide desktop. */
const OPSEC_COLUMN = `${PAGE_COLUMN} min-[1200px]:max-w-[57rem]`;

const CALLOUT_META: Record<OpSecCalloutKind, { label: string; Icon: React.ElementType }> = {
    note: { label: 'NOTE', Icon: Info },
    tip: { label: 'TIP', Icon: CheckCircle },
    important: { label: 'IMPORTANT', Icon: Alert },
    warning: { label: 'WARNING', Icon: Warning },
    caution: { label: 'CAUTION', Icon: Warning },
};

/** A Markdown alert rendered as a quiet aside: the `[!WARNING]` label is the
 *  visible nod to the syntax, while the sentence stays in the page's ink. */
const Callout: React.FC<{ kind: OpSecCalloutKind; text: string }> = ({ kind, text }) => {
    const { label, Icon } = CALLOUT_META[kind];
    return (
        <aside className={`opsec-callout opsec-callout--${kind}`} role="note">
            <div className="opsec-callout-head">
                <Icon size={18} aria-hidden="true" className="opsec-callout-icon" />
                <span className="opsec-callout-label" aria-hidden="true">
                    [!{label}]
                </span>
                <span className="sr-only">{label}: </span>
            </div>
            <p className="opsec-callout-text">{text}</p>
        </aside>
    );
};

const Block: React.FC<{ block: OpSecBlock }> = ({ block }) => {
    switch (block.type) {
        case 'p':
            return <p>{block.text}</p>;
        case 'ul':
        case 'ol': {
            const Tag = block.type === 'ol' ? 'ol' : 'ul';
            return (
                <Tag>
                    {block.items.map((item, i) => (
                        <li key={i}>{item}</li>
                    ))}
                </Tag>
            );
        }
        case 'quote':
            return <blockquote className="opsec-quote">{block.text}</blockquote>;
        case 'warn':
            return <Callout kind={block.kind ?? 'warning'} text={block.text} />;
        case 'callout':
            return <Callout kind={block.kind} text={block.text} />;
        default:
            return null;
    }
};

const Section: React.FC<{ section: OpSecSection; index: number }> = ({ section, index }) => (
    <section id={section.id} className="opsec-section scroll-mt-24">
        <h3>
            <span className="opsec-section-index" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
            </span>
            <span>{section.title}</span>
        </h3>
        <div className="opsec-section-body">
            {section.blocks.map((block, i) => (
                <Block key={i} block={block} />
            ))}
        </div>
    </section>
);

/* The rail is a quadratic curve in a 176 × 544 box. Dots are placed as
   percentages, so they stay on the curve when --ui-scale grows the page on a
   wide screen. */
const RAIL_W = 176;
const RAIL_H = 544;
const RAIL_X_END = 136;
const RAIL_X_MID = 176;
const RAIL_Y_END = 20;

const railPoint = (t: number) => {
    const mt = 1 - t;
    return {
        x: mt * mt * RAIL_X_END + 2 * mt * t * RAIL_X_MID + t * t * RAIL_X_END,
        y: mt * mt * RAIL_Y_END + 2 * mt * t * (RAIL_H / 2) + t * t * (RAIL_H - RAIL_Y_END),
    };
};

/* Keep this in step with the rail transitions in opsec.css. The focus ring
   travels along the same curve as the dots, so a section change reads as one
   movement rather than two separate highlights. */
const RAIL_MOTION_MS = 460;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const ContentsRail: React.FC<{
    sections: OpSecSection[];
    active: number;
    label: string;
    onJump: (id: string) => void;
}> = ({ sections, active, label, onJump }) => {
    const [hovered, setHovered] = React.useState<number | null>(null);
    const points = React.useMemo(
        () => sections.map((_, i) => railPoint(sections.length > 1 ? i / (sections.length - 1) : 0.5)),
        [sections],
    );
    const progress = sections.length > 1 ? active / (sections.length - 1) : 1;
    const path = `M ${RAIL_X_END} ${RAIL_Y_END} Q ${RAIL_X_MID} ${RAIL_H / 2} ${RAIL_X_END} ${RAIL_H - RAIL_Y_END}`;
    const focusRef = React.useRef<SVGGElement | null>(null);
    const focusT = React.useRef(progress);

    // Place the ring before the first paint, then let the effect below take
    // over. Keeping the initial transform out of JSX means a re-render never
    // snaps the ring back to the section it started on.
    React.useLayoutEffect(() => {
        const point = railPoint(focusT.current);
        focusRef.current?.setAttribute('transform', `translate(${point.x} ${point.y})`);
    }, []);

    React.useEffect(() => {
        const focus = focusRef.current;
        if (!focus) return;

        const from = focusT.current;
        const to = progress;
        const place = (t: number) => {
            const point = railPoint(t);
            focus.setAttribute('transform', `translate(${point.x} ${point.y})`);
        };

        if (Math.abs(to - from) < 0.0001) {
            focusT.current = to;
            place(to);
            return;
        }
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            focusT.current = to;
            place(to);
            return;
        }
        // The rail is hidden below 1200px and on short screens; keep the marker
        // in sync without running an animation nobody can see.
        if (focus.getBoundingClientRect().width === 0) {
            focusT.current = to;
            place(to);
            return;
        }

        const started = performance.now();
        let frame = 0;
        const step = (now: number) => {
            const t = Math.min((now - started) / RAIL_MOTION_MS, 1);
            const current = from + (to - from) * easeInOutCubic(t);
            focusT.current = current;
            place(current);
            if (t < 1) {
                frame = requestAnimationFrame(step);
            } else {
                focusT.current = to;
            }
        };
        frame = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frame);
    }, [progress]);

    return (
        <nav className="opsec-rail hidden select-none min-[1200px]:block" aria-label={label}>
            <div className="opsec-rail-head">
                <span>{label}</span>
                <span className="opsec-rail-count">
                    {String(active + 1).padStart(2, '0')} / {String(sections.length).padStart(2, '0')}
                </span>
            </div>
            <div className="opsec-rail-track">
                <svg className="opsec-rail-svg" viewBox={`0 0 ${RAIL_W} ${RAIL_H}`} aria-hidden="true">
                    <path className="opsec-rail-path" d={path} />
                    <path
                        className="opsec-rail-progress"
                        d={path}
                        pathLength={1}
                        strokeDasharray="1"
                        strokeDashoffset={1 - progress}
                    />
                    <g ref={focusRef} className="opsec-rail-focus" aria-hidden="true">
                        <circle className="opsec-rail-focus-halo" r={12} />
                        <circle className="opsec-rail-focus-ring" r={8.5} />
                    </g>
                </svg>
                {sections.map((section, i) => {
                    const point = points[i];
                    const showLabel = hovered === i || (hovered === null && i === active);
                    return (
                        <button
                            key={section.id}
                            type="button"
                            className={`opsec-rail-dot ${i === active ? 'is-active' : ''} ${i < active ? 'is-past' : ''}`}
                            style={{
                                left: `${(point.x / RAIL_W) * 100}%`,
                                top: `${(point.y / RAIL_H) * 100}%`,
                            }}
                            onClick={() => onJump(section.id)}
                            onMouseEnter={() => setHovered(i)}
                            onMouseLeave={() => setHovered(null)}
                            onFocus={() => setHovered(i)}
                            onBlur={() => setHovered(null)}
                            aria-label={section.title}
                            aria-current={i === active ? 'location' : undefined}
                        >
                            <span className="opsec-rail-dot-mark" aria-hidden="true" />
                            <span className={`opsec-rail-label ${showLabel ? 'is-visible' : ''}`} aria-hidden="true">
                                {section.title}
                            </span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
};

interface OpSecProps {
    onBack: () => void;
}

const OpSec: React.FC<OpSecProps> = ({ onBack }) => {
    const { lang } = useTranslation();
    const content = getOpSecContent(lang);
    const basic = React.useMemo(() => content.sections.filter(s => s.level === 'basic'), [content]);
    const advanced = React.useMemo(() => content.sections.filter(s => s.level === 'advanced'), [content]);
    const allSections = React.useMemo(() => [...basic, ...advanced], [basic, advanced]);
    const [active, setActive] = React.useState(0);
    const articleRef = React.useRef<HTMLElement | null>(null);

    React.useEffect(() => {
        const article = articleRef.current;
        if (!article) return;
        const scroller = scrollParent(article);
        const nodes = Array.from(article.querySelectorAll<HTMLElement>('.opsec-section'));
        if (!scroller || nodes.length === 0) return;

        let frame = 0;
        const update = () => {
            frame = 0;
            const threshold = scroller.getBoundingClientRect().top + 140;
            let next = 0;
            for (let i = 0; i < nodes.length; i += 1) {
                if (nodes[i].getBoundingClientRect().top <= threshold) next = i;
            }
            if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 8) {
                next = nodes.length - 1;
            }
            setActive(prev => (prev === next ? prev : next));
        };
        const onScroll = () => {
            if (frame) return;
            frame = requestAnimationFrame(update);
        };

        update();
        scroller.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        return () => {
            if (frame) cancelAnimationFrame(frame);
            scroller.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onScroll);
        };
    }, [content]);

    const jump = (id: string) => {
        const el = document.getElementById(id);
        if (!el) return;
        const index = allSections.findIndex(section => section.id === id);
        if (index >= 0) setActive(index);
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    };

    return (
        <div className="opsec-page min-h-full flex-none select-text">
            <PageHeader onBack={onBack} title={content.title} columnClassName={OPSEC_COLUMN} />
            <div className={`${OPSEC_COLUMN} pb-32 pt-2`}>
                <div className="grid grid-cols-1 gap-8 min-[1200px]:grid-cols-[minmax(0,40rem)_11rem]">
                    <article ref={articleRef} className="opsec-prose min-w-0">
                        <section className="opsec-disclaimer">
                            <h2>{content.disclaimerTitle}</h2>
                            {content.disclaimer.map((paragraph, i) => (
                                <p key={i}>{paragraph}</p>
                            ))}
                        </section>

                        <p className="opsec-intro">{content.intro}</p>

                        <h2>{content.basicHeading}</h2>
                        {basic.map((section, i) => (
                            <Section key={section.id} section={section} index={i} />
                        ))}

                        <h2>{content.advancedHeading}</h2>
                        <Callout kind="important" text={content.advancedNote} />
                        {advanced.map((section, i) => (
                            <Section key={section.id} section={section} index={basic.length + i} />
                        ))}
                    </article>

                    <ContentsRail sections={allSections} active={active} label={content.contentsLabel} onJump={jump} />
                </div>
            </div>
        </div>
    );
};

export default OpSec;
