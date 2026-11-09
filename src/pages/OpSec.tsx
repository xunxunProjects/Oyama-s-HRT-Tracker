import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import { useTranslation } from '../contexts/LanguageContext';
import {
    loadOpSecContent,
    peekOpSecContent,
    type OpSecBlock,
    type OpSecCalloutKind,
    type OpSecContent,
    type OpSecSection,
} from '../content/opsec';
import { scrollParent } from '../utils/scrollParent';
import { Info, Warning } from '../components/icons';
import '../styles/opsec.css';

/** The reading column stays at the app's width on a phone and grows just
 *  enough for the contents rail on a wide desktop. */
const OPSEC_COLUMN = `${PAGE_COLUMN} min-[1200px]:max-w-[57rem]`;

/** Which callouts ask the reader to be careful. Those carry the app's warning
 *  mark; the rest are a quiet note with an info mark. */
const CAREFUL: ReadonlySet<OpSecCalloutKind> = new Set(['important', 'warning', 'caution']);

/** A Markdown alert drawn as the app's quiet filled note: a small mark and the
 *  sentence, with no label, coloured edge or tint. A screen reader still
 *  hears what kind of note it is, in the reader's language. */
const Callout: React.FC<{ kind: OpSecCalloutKind; text: string }> = ({ kind, text }) => {
    const { t } = useTranslation();
    const careful = CAREFUL.has(kind);
    const Icon = careful ? Warning : Info;
    return (
        <aside className="opsec-callout" role="note">
            <span className="icon-line">
                <Icon
                    size={13}
                    aria-hidden="true"
                    className={careful ? 'text-[var(--warning)]' : 'text-[var(--text-muted)]'}
                />
            </span>
            <p>
                <span className="sr-only">{t(`opsec.callout.${kind}`)}: </span>
                {text}
            </p>
        </aside>
    );
};

const MathBlock: React.FC<{ text: string; caption?: string }> = ({ text, caption }) => {
    const html = React.useMemo(
        () =>
            katex.renderToString(text, {
                displayMode: true,
                throwOnError: false,
                strict: 'ignore',
                trust: false,
            }),
        [text],
    );

    return (
        <figure className="opsec-math">
            <div className="opsec-math-body" dangerouslySetInnerHTML={{ __html: html }} />
            {caption ? <figcaption className="opsec-math-caption">{caption}</figcaption> : null}
        </figure>
    );
};

type MermaidApi = (typeof import('mermaid'))['default'];

let mermaidPromise: Promise<MermaidApi> | null = null;
let mermaidTheme: 'dark' | 'neutral' | null = null;

const loadMermaid = (): Promise<MermaidApi> => {
    mermaidPromise ??= import('mermaid').then(module => module.default);
    return mermaidPromise;
};

/** Diagrams are loaded only when a page actually contains one. The source is
 *  kept as a readable fallback if the renderer cannot start. */
let mermaidRenderCounter = 0;

const MermaidBlock: React.FC<{ code: string; caption?: string }> = ({ code, caption }) => {
    const baseId = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
    const [state, setState] = React.useState<'loading' | 'ready' | 'error'>('loading');
    const [svg, setSvg] = React.useState('');

    React.useEffect(() => {
        let cancelled = false;
        const id = `opsec-mermaid-${baseId}-${++mermaidRenderCounter}`;
        const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'neutral';
        void (async () => {
            try {
                const mermaid = await loadMermaid();
                if (mermaidTheme !== theme) {
                    mermaid.initialize({
                        startOnLoad: false,
                        securityLevel: 'strict',
                        theme,
                        fontFamily: 'inherit',
                        flowchart: { useMaxWidth: true },
                    });
                    mermaidTheme = theme;
                }
                const result = await mermaid.render(id, code);
                if (!cancelled) {
                    setSvg(result.svg);
                    setState('ready');
                }
            } catch {
                if (!cancelled) setState('error');
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [code, baseId]);

    return (
        <figure className="opsec-mermaid">
            {state === 'ready' ? (
                <div className="opsec-mermaid-body" dangerouslySetInnerHTML={{ __html: svg }} />
            ) : state === 'error' ? (
                <pre className="opsec-mermaid-fallback">
                    <code>{code}</code>
                </pre>
            ) : (
                <div className="opsec-mermaid-loading" aria-hidden="true" />
            )}
            {caption ? <figcaption className="opsec-mermaid-caption">{caption}</figcaption> : null}
        </figure>
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
        case 'math':
            return <MathBlock text={block.text} caption={block.caption} />;
        case 'mermaid':
            return <MermaidBlock code={block.code} caption={block.caption} />;
        default:
            return null;
    }
};

const Section: React.FC<{ section: OpSecSection }> = ({ section }) => (
    <section id={section.id} className="opsec-section scroll-mt-24">
        <h3>{section.title}</h3>
        <div className="opsec-section-body">
            {section.blocks.map((block, i) => (
                <Block key={i} block={block} />
            ))}
        </div>
    </section>
);

/** The contents beside the article on a wide screen: the section titles as a
 *  plain list, the one being read in the accent's ink. It keeps that one in
 *  view when the list is taller than the window. */
const Contents: React.FC<{
    sections: OpSecSection[];
    active: number;
    label: string;
    onJump: (id: string) => void;
}> = ({ sections, active, label, onJump }) => {
    const listRef = React.useRef<HTMLOListElement | null>(null);
    React.useEffect(() => {
        const list = listRef.current;
        const item = list?.children[active] as HTMLElement | undefined;
        if (!list || !item || list.getBoundingClientRect().width === 0) return;
        const top = item.offsetTop - list.offsetTop;
        if (top < list.scrollTop || top + item.offsetHeight > list.scrollTop + list.clientHeight) {
            list.scrollTo({ top: top - list.clientHeight / 3 });
        }
    }, [active]);

    return (
        <nav className="opsec-contents hidden min-[1200px]:block" aria-label={label}>
            <h2 className="group-heading">{label}</h2>
            <ol ref={listRef}>
                {sections.map((section, i) => (
                    <li
                        key={section.id}
                        className={i > 0 && sections[i - 1].level !== section.level ? 'opsec-contents-gap' : undefined}
                    >
                        <button
                            type="button"
                            className={i === active ? 'is-active' : undefined}
                            onClick={() => onJump(section.id)}
                            aria-current={i === active ? 'location' : undefined}
                        >
                            {section.title}
                        </button>
                    </li>
                ))}
            </ol>
        </nav>
    );
};

interface OpSecProps {
    onBack: () => void;
}

/** The guide in the reader's language. Each language is fetched on first
 *  open, which is quick, so until it arrives the page shows only its title. */
function useOpSecContent(lang: string): OpSecContent | null {
    // Bumped when a language finishes loading, so the page re-reads the cache.
    const [, setLoaded] = React.useState('');
    React.useEffect(() => {
        if (peekOpSecContent(lang)) return;
        let live = true;
        loadOpSecContent(lang).then(() => live && setLoaded(lang));
        return () => {
            live = false;
        };
    }, [lang]);
    return peekOpSecContent(lang);
}

const OpSec: React.FC<OpSecProps> = ({ onBack }) => {
    const { lang, t } = useTranslation();
    const content = useOpSecContent(lang);
    if (!content) {
        return (
            <div className="opsec-page min-h-full flex-none">
                <PageHeader onBack={onBack} title={t('opsec.title')} columnClassName={OPSEC_COLUMN} />
            </div>
        );
    }
    return <OpSecArticle content={content} onBack={onBack} />;
};

const OpSecArticle: React.FC<{ content: OpSecContent; onBack: () => void }> = ({ content, onBack }) => {
    const basic = React.useMemo(() => content.sections.filter(s => s.level === 'basic'), [content]);
    const advanced = React.useMemo(() => content.sections.filter(s => s.level === 'advanced'), [content]);
    const extended = React.useMemo(() => content.sections.filter(s => s.level === 'extended'), [content]);
    const allSections = React.useMemo(() => [...basic, ...advanced, ...extended], [basic, advanced, extended]);
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
        <div className="opsec-page min-h-full flex-none select-text md:pb-32">
            <PageHeader onBack={onBack} title={content.title} columnClassName={OPSEC_COLUMN} />
            <div className={`${OPSEC_COLUMN} pt-2`}>
                <div className="grid grid-cols-1 gap-12 min-[1200px]:grid-cols-[minmax(0,40rem)_11rem]">
                    <article ref={articleRef} className="opsec-prose min-w-0">
                        <section className="opsec-disclaimer">
                            <h2>{content.disclaimerTitle}</h2>
                            {content.disclaimer.map((paragraph, i) => (
                                <p key={i}>{paragraph}</p>
                            ))}
                        </section>

                        <p className="opsec-intro">{content.intro}</p>

                        <h2>{content.basicHeading}</h2>
                        {basic.map(section => (
                            <Section key={section.id} section={section} />
                        ))}

                        <h2>{content.advancedHeading}</h2>
                        <Callout kind="important" text={content.advancedNote} />
                        {advanced.map(section => (
                            <Section key={section.id} section={section} />
                        ))}

                        <h2>{content.extendedHeading}</h2>
                        <Callout kind="note" text={content.extendedNote} />
                        {extended.map(section => (
                            <Section key={section.id} section={section} />
                        ))}
                    </article>

                    <Contents sections={allSections} active={active} label={content.contentsLabel} onJump={jump} />
                </div>
            </div>
        </div>
    );
};

export default OpSec;
