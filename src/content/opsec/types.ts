export type OpSecLang = 'zh' | 'zh-TW' | 'yue' | 'en' | 'ja' | 'ko' | 'tr' | 'ru' | 'uk';

/** The Markdown alert family: `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`,
 *  `[!WARNING]`, `[!CAUTION]`. `warn` blocks default to `warning`; content
 *  that needs a softer or harsher register can say which one it is. */
export type OpSecCalloutKind = 'note' | 'tip' | 'important' | 'warning' | 'caution';

export type OpSecBlock =
    | { type: 'p'; text: string }
    | { type: 'ul'; items: string[] }
    | { type: 'ol'; items: string[] }
    | { type: 'quote'; text: string }
    | { type: 'warn'; kind?: OpSecCalloutKind; text: string }
    | { type: 'callout'; kind: OpSecCalloutKind; title?: string; text: string }
    /** Display math. `text` is a LaTeX expression rendered by KaTeX; the
     *  optional caption is plain prose and is not part of the formula. */
    | { type: 'math'; text: string; caption?: string };

export interface OpSecSection {
    id: string;
    title: string;
    level: 'basic' | 'advanced' | 'extended';
    blocks: OpSecBlock[];
}

export interface OpSecContent {
    title: string;
    contentsLabel: string;
    disclaimerTitle: string;
    disclaimer: string[];
    intro: string;
    basicHeading: string;
    advancedHeading: string;
    advancedNote: string;
    extendedHeading: string;
    extendedNote: string;
    sections: OpSecSection[];
}
