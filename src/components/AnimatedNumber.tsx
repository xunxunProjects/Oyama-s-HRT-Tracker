import React, { useEffect, useRef, useState } from 'react';

interface AnimatedNumberProps {
    value: number;
    decimals?: number;
    duration?: number;
}

// Eases the displayed number toward `value` (ease-out cubic). Counts up from
// 0 on mount, then glides between values on change. Renders the final value
// immediately when the user prefers reduced motion.
const AnimatedNumber: React.FC<AnimatedNumberProps> = ({ value, decimals = 1, duration = 550 }) => {
    const [display, setDisplay] = useState(0);
    const fromRef = useRef(0);
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            fromRef.current = value;
            setDisplay(value);
            return;
        }
        const from = fromRef.current;
        const start = performance.now();
        const tick = (now: number) => {
            const p = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            const current = from + (value - from) * eased;
            fromRef.current = current;
            setDisplay(current);
            if (p < 1) rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        };
    }, [value, duration]);

    return <>{display.toFixed(decimals)}</>;
};

export default AnimatedNumber;
