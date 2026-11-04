import { useEffect, useMemo, useRef, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import {
    LazyMotion,
    domAnimation,
    m,
    useSpring,
    useTransform,
    useReducedMotion,
} from 'framer-motion';

import {
    MAX_ANIMATION_MS,
    SPRING_CONFIG,
    STAGGER_MS,
    animationBudgetMs,
    extractLatexVariables,
} from '../lib/explainMath';

interface ExplainMathProps {
    latex: string;
    values: Record<string, number>;
    decimals?: number;
    className?: string;
}

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: STAGGER_MS / 1000, delayChildren: 0 },
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 6 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' as const } },
};

function VariableItem({
    name,
    value,
    initial,
    decimals,
    reducedMotion,
}: {
    name: string;
    value: number;
    initial: number;
    decimals: number;
    reducedMotion: boolean;
}) {
    const spring = useSpring(initial, reducedMotion ? { duration: 0 } : SPRING_CONFIG);
    const formatted = useTransform(spring, (v) => v.toFixed(decimals));
    const variants = reducedMotion
        ? { hidden: { opacity: 1, y: 0 }, visible: { opacity: 1, y: 0, transition: { duration: 0 } } }
        : itemVariants;

    useEffect(() => {
        spring.set(value);
    }, [spring, value]);

    return (
        <m.li variants={variants} className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1 text-sm">
            <span className="font-mono text-[var(--text-muted)]">{name}</span>
            <m.span className="tabular-nums font-semibold text-[var(--text)]">{formatted}</m.span>
        </m.li>
    );
}

export function ExplainMath({ latex, values, decimals = 2, className }: ExplainMathProps) {
    const reducedMotion = useReducedMotion();
    const vars = useMemo(() => extractLatexVariables(latex), [latex]);
    const animatedVars = useMemo(
        () => vars.filter((name) => Object.prototype.hasOwnProperty.call(values, name)),
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

    const signature = useMemo(() => JSON.stringify({ latex, values }), [latex, values]);
    const [runId, setRunId] = useState(0);
    const prevValuesRef = useRef<Record<string, number>>(values);
    const [prevValues, setPrevValues] = useState<Record<string, number>>(values);

    useEffect(() => {
        setPrevValues(prevValuesRef.current);
        prevValuesRef.current = values;
        setRunId((id) => id + 1);
    }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps

    const activeContainerVariants = reducedMotion
        ? { hidden: { opacity: 1 }, visible: { opacity: 1, transition: { staggerChildren: 0 } } }
        : containerVariants;

    return (
        <LazyMotion features={domAnimation}>
            <m.div
                key={runId}
                className={className}
                initial="hidden"
                animate="visible"
                variants={activeContainerVariants}
                data-explain-math=""
                data-animation-budget-ms={budget}
                data-max-animation-ms={MAX_ANIMATION_MS}
            >
                <div
                    className="math-body overflow-x-auto py-2 text-[var(--text)]"
                    dangerouslySetInnerHTML={{ __html: rendered }}
                />
                {animatedVars.length > 0 && (
                    <m.ul
                        className="mt-3 flex flex-wrap gap-2"
                        variants={activeContainerVariants}
                        initial="hidden"
                        animate="visible"
                    >
                        {animatedVars.map((name) => (
                            <VariableItem
                                key={`${runId}-${name}`}
                                name={name}
                                value={values[name]}
                                initial={prevValues[name] ?? values[name]}
                                decimals={decimals}
                                reducedMotion={!!reducedMotion}
                            />
                        ))}
                    </m.ul>
                )}
            </m.div>
        </LazyMotion>
    );
}

export default ExplainMath;
