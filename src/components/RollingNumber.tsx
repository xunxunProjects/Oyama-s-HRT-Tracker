import { useLayoutEffect, useRef, useState } from 'react';

interface RollingNumberProps {
    value: number;
    decimals?: number;
}

export default function RollingNumber({ value, decimals = 0 }: RollingNumberProps) {
    const formatted = value.toFixed(decimals);
    const scale = 10 ** decimals;
    const target = Math.round(Number(formatted) * scale);
    const currentValue = useRef(Number(formatted));
    const [frame, setFrame] = useState({
        lower: target,
        upper: target,
        fraction: 0,
        speed: 0,
        rising: true,
        width: formatted.length,
    });

    useLayoutEffect(() => {
        const from = currentValue.current * scale;
        const distance = Math.abs(target - from);
        const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
        const start = performance.now();
        const duration = 440 + Math.min(120, 45 * Math.log10(1 + distance));
        let raf = 0;

        const show = (lower: number, upper: number, fraction: number, speed: number) => {
            currentValue.current = (lower + (upper - lower) * fraction) / scale;
            setFrame(previous => ({
                lower,
                upper,
                fraction,
                speed,
                rising: target > from,
                width: Math.max(previous.width, formatted.length),
            }));
        };
        const finish = () => {
            cancelAnimationFrame(raf);
            show(target, target, 0, 0);
        };
        if (motion.matches || from === target) {
            finish();
            return;
        }

        const tick = (now: number) => {
            const t = Math.max(0, Math.min(1, (now - start) / duration));
            if (t >= 1) return finish();
            const remaining = 1 - t;
            const eased = 1 - remaining ** 3 * (1 + 3 * t);
            const speed = (12 * t * remaining ** 2) / duration;
            if (distance < 10) {
                // Nearby readings roll through their actual carries and borrows.
                const ticks = from + (target - from) * eased;
                const lower = Math.floor(ticks);
                show(lower, Math.ceil(ticks), ticks - lower, distance * speed);
            } else {
                // A full revolution or more reads as a flicker. Exchange the two
                // readings once, with the same direction and place alignment.
                show(
                    Math.round(Math.min(from, target)),
                    Math.round(Math.max(from, target)),
                    target > from ? eased : 1 - eased,
                    speed,
                );
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        motion.addEventListener('change', finish);
        return () => {
            cancelAnimationFrame(raf);
            motion.removeEventListener('change', finish);
        };
    }, [target, scale, formatted.length]);

    const digitsAt = (ticks: number) => (ticks / scale).toFixed(decimals).padStart(frame.width, '\u2007');
    const digits = digitsAt(frame.lower);
    const next = digitsAt(frame.upper);
    const point = digits.indexOf('.');

    return (
        <span className="rolling-number" dir="ltr">
            <span className="sr-only">{formatted}</span>
            <span
                aria-hidden="true"
                className="rolling-number-places"
                data-moving={frame.lower !== frame.upper || undefined}
            >
                {Array.from(digits, (digit, index) => {
                    if (digit === next[index]) return <span key={index}>{digit}</span>;
                    const place = digits.length - 1 - index - (point > index ? 1 : 0);
                    const carry = 1 + 0.18 * place;
                    const phase = frame.rising ? frame.fraction : 1 - frame.fraction;
                    const progress = frame.rising ? phase ** carry : 1 - phase ** carry;
                    const fade = progress * progress * (3 - 2 * progress);
                    const wheelSpeed = frame.speed * carry * phase ** (carry - 1);
                    const filter = `blur(${Math.min(0.055, 10 * wheelSpeed)}em)`;
                    return (
                        <span key={index} className="rolling-digit">
                            <span
                                style={{
                                    transform: `translateY(${-0.72 * progress}em)`,
                                    opacity: 1 - fade,
                                    filter,
                                }}
                            >
                                {digit}
                            </span>
                            <span
                                style={{
                                    transform: `translateY(${0.72 * (1 - progress)}em)`,
                                    opacity: fade,
                                    filter,
                                }}
                            >
                                {next[index]}
                            </span>
                        </span>
                    );
                })}
            </span>
        </span>
    );
}
