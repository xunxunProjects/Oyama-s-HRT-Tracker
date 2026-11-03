import React from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import { useTranslation } from '../contexts/LanguageContext';
import { getOpSecContent } from '../content/opsec';

const blockClass = (type: string) => {
    switch (type) {
        case 'warn':
            return 'rounded-xl border-(length:--hairline) border-[var(--warning)] bg-[var(--surface)] p-4 text-sm text-[var(--warning)]';
        case 'quote':
            return 'rounded-xl border-s-2 border-[var(--accent)] bg-[var(--surface)] p-4 text-sm italic text-[var(--text)]';
        default:
            return '';
    }
};

interface OpSecProps {
    onBack: () => void;
}

const OpSec: React.FC<OpSecProps> = ({ onBack }) => {
    const { t, lang } = useTranslation();
    const content = getOpSecContent(lang);
    const basic = content.sections.filter(s => s.level === 'basic');
    const advanced = content.sections.filter(s => s.level === 'advanced');

    return (
        <div className="md:pb-32">
            <PageHeader onBack={onBack} title={content.title} />
            <div className={`${PAGE_COLUMN} mt-3 space-y-6 text-sm leading-relaxed`}>
                <p className="text-[var(--text)]">{content.intro}</p>

                <h2 className="text-base font-semibold text-[var(--text)] mt-2">{content.basicHeading}</h2>
                {basic.map(section => (
                    <section key={section.id} className="space-y-2">
                        <h3 className="text-sm font-semibold text-[var(--text)]">{section.title}</h3>
                        {section.blocks.map((block, i) => {
                            if (block.type === 'p') {
                                return (
                                    <p key={i} className="text-[var(--text-muted)]">
                                        {block.text}
                                    </p>
                                );
                            }
                            if (block.type === 'ul' || block.type === 'ol') {
                                const Tag = block.type === 'ol' ? 'ol' : 'ul';
                                return (
                                    <Tag
                                        key={i}
                                        className={`${block.type === 'ol' ? 'list-decimal' : 'list-disc'} ps-5 space-y-1.5 text-[var(--text-muted)] marker:text-[var(--border-strong)]`}
                                    >
                                        {block.items.map((item, j) => (
                                            <li key={j}>{item}</li>
                                        ))}
                                    </Tag>
                                );
                            }
                            return (
                                <div key={i} className={blockClass(block.type)}>
                                    {block.text}
                                </div>
                            );
                        })}
                    </section>
                ))}

                <h2 className="text-base font-semibold text-[var(--text)] mt-6">{content.advancedHeading}</h2>
                <p className="text-xs text-[var(--warning)]">{content.advancedNote}</p>
                {advanced.map(section => (
                    <section key={section.id} className="space-y-2">
                        <h3 className="text-sm font-semibold text-[var(--text)]">{section.title}</h3>
                        {section.blocks.map((block, i) => {
                            if (block.type === 'p') {
                                return (
                                    <p key={i} className="text-[var(--text-muted)]">
                                        {block.text}
                                    </p>
                                );
                            }
                            if (block.type === 'ul' || block.type === 'ol') {
                                const Tag = block.type === 'ol' ? 'ol' : 'ul';
                                return (
                                    <Tag
                                        key={i}
                                        className={`${block.type === 'ol' ? 'list-decimal' : 'list-disc'} ps-5 space-y-1.5 text-[var(--text-muted)] marker:text-[var(--border-strong)]`}
                                    >
                                        {block.items.map((item, j) => (
                                            <li key={j}>{item}</li>
                                        ))}
                                    </Tag>
                                );
                            }
                            return (
                                <div key={i} className={blockClass(block.type)}>
                                    {block.text}
                                </div>
                            );
                        })}
                    </section>
                ))}

                <div className="pt-4 border-t-(length:--hairline) border-[var(--border)] space-y-1">
                    {content.references.map((r, i) => (
                        <p key={i} className="text-xs text-[var(--text-muted)] break-words">
                            {r}
                        </p>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default OpSec;
