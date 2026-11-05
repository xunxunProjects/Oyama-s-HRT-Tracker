import { useEffect, useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { LazyMotion, domAnimation, m, useSpring, useTransform, useReducedMotion } from 'framer-motion';

import { MAX_ANIMATION_MS, SPRING_CONFIG, animationBudgetMs, extractLatexVariables } from '../lib/explainMath';

interface ExplainMathProps {
    latex: string;
    values: Record<string, number>;
    decimals?: number;
    className?: string;
}

/** One variable under the formula. It stays where it is; only its number
 *  runs to the new value when an input changes. */
function VariableItem({
    name,
    value,
    decimals,
    reducedMotion,
}: {
    name: string;
    value: number;
    decimals: number;
    reducedMotion: boolean;
}) {
    const spring = useSpring(value, reducedMotion ? { duration: 0 } : SPRING_CONFIG);
    const formatted = useTransform(spring, v => v.toFixed(decimals));

    useEffect(() => {
        spring.set(value);
    }, [spring, value]);

    // The name is set the way the formula above sets it (k_a as k with a
    // subscript a), so the reader can match the two by eye.
    const nameHtml = useMemo(
        () => katex.renderToString(name, { displayMode: false, throwOnError: false, strict: 'ignore' }),
        [name],
    );

    return (
        <li className="flex items-baseline gap-1.5 text-sm">
            <span className="text-[var(--text-muted)]" dangerouslySetInnerHTML={{ __html: nameHtml }} />
            <span className="text-[var(--text-muted)]">=</span>
            <m.span className="tabular-nums text-[var(--text)]">{formatted}</m.span>
        </li>
    );
}

export function ExplainMath({ latex, values, decimals = 2, className }: ExplainMathProps) {
    const reducedMotion = useReducedMotion();
    const vars = useMemo(() => extractLatexVariables(latex), [latex]);
    const animatedVars = useMemo(
        () => vars.filter(name => Object.prototype.hasOwnProperty.call(values, name)),
        [vars, values],
    );

    const rendered = useMemo(
        () =>
            katex.renderToString(latex, {
                displayMode: true,
                throwOnError: false,
                strict: 'ignore',
            }),
        [latex],
    );

    const budget = animationBudgetMs(animatedVars.length);

    return (
        <LazyMotion features={domAnimation}>
            <div
                className={className}
                data-explain-math=""
                data-animation-budget-ms={budget}
                data-max-animation-ms={MAX_ANIMATION_MS}
            >
                <div
                    className="math-body overflow-x-auto py-2 text-[var(--text)]"
                    dangerouslySetInnerHTML={{ __html: rendered }}
                />
                {animatedVars.length > 0 && (
                    <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
                        {animatedVars.map(name => (
                            <VariableItem
                                key={name}
                                name={name}
                                value={values[name]}
                                decimals={decimals}
                                reducedMotion={!!reducedMotion}
                            />
                        ))}
                    </ul>
                )}
            </div>
        </LazyMotion>
    );
}

export default ExplainMath;
