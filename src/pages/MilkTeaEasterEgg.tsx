import React, { useState } from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';

import Tick from '../components/Tick';
import { useTranslation } from '../contexts/LanguageContext';

interface MilkTeaEasterEggProps {
    onBack: () => void;
}

type Tag = 'recommended' | 'not_recommended' | null;

interface ParsedOption {
    raw: string;
    label: string;
    tag: Tag;
}

interface Category {
    title: string;
    options: ParsedOption[];
}

const TAG_PATTERN = /[（(](推荐|不推荐)[）)]$/;

function parseOption(raw: string): ParsedOption {
    const match = raw.match(TAG_PATTERN);
    if (!match) return { raw, label: raw, tag: null };
    return {
        raw,
        label: raw.slice(0, match.index).trim(),
        tag: match[1] === '推荐' ? 'recommended' : 'not_recommended',
    };
}

function makeCategory(title: string, options: string[]): Category {
    return { title, options: options.map(parseOption) };
}

const CATEGORIES: Category[] = [
    makeCategory('糖类型（原创）', ['纯粹真冰糖', '真0卡糖', '低GI「L-阿拉伯糖」']),
    makeCategory('状态', ['冰（推荐）', '热', '温']),
    makeCategory('浓抹糯糯', ['标准（含浓抹糯糯）', '加量浓抹糯糯', '少浓抹糯糯', '去浓抹糯糯']),
    makeCategory('冰量', ['推荐', '少冰', '去冰（不推荐）']),
    makeCategory('甜度', ['少甜（推荐）', '少少甜', '少少少甜', '不另外加糖（不推荐）']),
    makeCategory('抹茶', ['标准抹茶', '加浓抹茶']),
    makeCategory('小料', ['标准（含抹茶冻）', '加量抹茶冻', '去抹茶冻']),
    makeCategory('顶料', ['默认方式', '抹茶粉撒满', '不撒粉']),
    makeCategory('云顶分装', ['不分装', '免费分装']),
    makeCategory('绿色喜茶（吸管）', ['可降解吸管', '不使用吸管']),
];

function defaultIndex(cat: Category): number {
    const i = cat.options.findIndex(o => o.tag === 'recommended');
    return i >= 0 ? i : 0;
}

const on = "text-[var(--text)]";
const muted = "text-[var(--text-muted)]";

const MilkTeaEasterEgg: React.FC<MilkTeaEasterEggProps> = ({ onBack }) => {
    const { t } = useTranslation();
    const [selected, setSelected] = useState<number[]>(() => CATEGORIES.map(defaultIndex));

    const choose = (catIdx: number, optIdx: number) => {
        setSelected(prev => prev.map((v, i) => (i === catIdx ? optIdx : v)));
    };

    return (
        <div className="pb-32">
            <PageHeader onBack={onBack} title={t('milktea.title')} />

            <div className={`${PAGE_COLUMN} space-y-8`}>
                {CATEGORIES.map((cat, catIdx) => (
                    <div key={cat.title}>
                        <h3 className={`text-sm font-semibold ${on} mb-2`}>{cat.title}</h3>
                        <div>
                            {cat.options.map((opt, optIdx) => {
                                const isSelected = selected[catIdx] === optIdx;
                                return (
                                    <button
                                        key={opt.raw}
                                        onClick={() => choose(catIdx, optIdx)}
                                        className="w-full flex items-center justify-between py-3 border-b border-[var(--border)] last:border-b-0 text-start"
                                    >
                                        <span className="flex items-center gap-2 text-[0.9375rem]">
                                            <span className={isSelected ? `font-semibold ${on}` : on}>{opt.label}</span>
                                            {opt.tag === 'recommended' && (
                                                <span className="text-xs text-[var(--status-positive)] font-medium">
                                                    {t('milktea.recommended')}
                                                </span>
                                            )}
                                            {opt.tag === 'not_recommended' && (
                                                <span className="text-xs text-[var(--warning)] font-medium">
                                                    {t('milktea.not_recommended')}
                                                </span>
                                            )}
                                        </span>
                                        <Tick on={isSelected} />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}

                <div className="rounded-xl border border-dashed border-[var(--border)] p-5">
                    <p className={`text-sm font-semibold ${on} mb-3`}>{t('milktea.receipt_title')}</p>
                    <div className="font-mono text-xs leading-relaxed">
                        <p className={on}>{t('milktea.title')}</p>
                        {CATEGORIES.map((cat, catIdx) => (
                            <p key={cat.title} className={muted}>
                                {cat.title} · {cat.options[selected[catIdx]].label}
                            </p>
                        ))}
                    </div>
                </div>

                <p className={`text-xs text-center ${muted}`}>{t('milktea.footer')}</p>
            </div>
        </div>
    );
};

export default MilkTeaEasterEgg;
