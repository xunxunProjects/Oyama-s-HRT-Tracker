import React, { useState, useEffect, useRef } from 'react';

interface RippleProps {
    color?: string;
    duration?: number;
}

interface RippleCircle {
    x: number;
    y: number;
    size: number;
    id: number;
}

/**
 * Material Design 3 Ripple Effect Component.
 * Automatically attaches to its parent element and creates a ripple on click/touch.
 * Parent MUST have `relative` and `overflow-hidden` along with `m3-state-layer`.
 */
const Ripple: React.FC<RippleProps> = ({ color, duration = 1000 }) => {
    const [ripples, setRipples] = useState<RippleCircle[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const parent = containerRef.current?.parentElement;
        if (!parent) return;

        const addRipple = (clientX: number, clientY: number) => {
            const rect = parent.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height) * 2;
            const x = clientX - rect.left - size / 2;
            const y = clientY - rect.top - size / 2;

            const newRipple: RippleCircle = {
                x,
                y,
                size,
                id: Date.now(),
            };

            setRipples((prev) => [...prev, newRipple]);

            // Auto-cleanup
            setTimeout(() => {
                setRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
            }, duration);
        };

        const handleMouseDown = (e: MouseEvent) => {
            addRipple(e.clientX, e.clientY);
        };

        const handleTouchStart = (e: TouchEvent) => {
            if (e.touches.length > 0) {
                addRipple(e.touches[0].clientX, e.touches[0].clientY);
            }
        };

        parent.addEventListener('mousedown', handleMouseDown);
        parent.addEventListener('touchstart', handleTouchStart);

        return () => {
            parent.removeEventListener('mousedown', handleMouseDown);
            parent.removeEventListener('touchstart', handleTouchStart);
        };
    }, [duration]);

    return (
        <div
            ref={containerRef}
            className="absolute inset-0 pointer-events-none select-none z-0 overflow-hidden rounded-[inherit]"
            aria-hidden="true"
        >
            {ripples.map((ripple) => (
                <span
                    key={ripple.id}
                    className="m3-ripple"
                    style={{
                        top: ripple.y,
                        left: ripple.x,
                        width: ripple.size,
                        height: ripple.size,
                        backgroundColor: color || 'currentColor',
                        animationDuration: `${duration}ms`,
                    }}
                />
            ))}
        </div>
    );
};

export default Ripple;
