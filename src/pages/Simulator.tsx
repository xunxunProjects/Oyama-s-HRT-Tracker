import React, { useLayoutEffect, useRef, useState } from 'react';
import PageHeader from '../components/PageHeader';
import Segmented from '../components/Segmented';
import { useTranslation } from '../contexts/LanguageContext';

interface SimulatorProps {
    onBack: () => void;
}

type DeviceId = 'duo-inner' | 'duo-outer' | 'iphone' | 'ipad';
type Orientation = 'portrait' | 'landscape';

/**
 * Screen sizes in CSS pixels, portrait. The iPhone Duo's are its published
 * pixels divided by three (Apple has not published browser values yet), so
 * they are close but not exact. The inner screen opens in landscape, which is
 * the case the wide-short layouts were built for.
 */
const DEVICES: Record<DeviceId, { w: number; h: number; label: string }> = {
    'duo-inner': { w: 626, h: 890, label: 'simulator.duo_inner' },
    'duo-outer': { w: 466, h: 678, label: 'simulator.duo_outer' },
    iphone: { w: 402, h: 874, label: 'iPhone' },
    ipad: { w: 820, h: 1180, label: 'iPad' },
};

const DEVICE_ORDER: DeviceId[] = ['duo-inner', 'duo-outer', 'iphone', 'ipad'];

/**
 * Developer mode: the app as it lays out on another device, in a frame of that
 * device's size scaled down to fit this window. The frame is the real site on
 * this origin, so it shows this device's own records, and the media queries
 * inside it (the `short` variant included) answer to the frame's size, not to
 * this window's. `?sim=touch` makes it lay out as the touch screen these
 * devices are (index.tsx).
 */
const Simulator: React.FC<SimulatorProps> = ({ onBack }) => {
    const { t } = useTranslation();
    const [device, setDevice] = useState<DeviceId>('duo-inner');
    const [orientation, setOrientation] = useState<Orientation>('landscape');

    const spec = DEVICES[device];
    const w = orientation === 'portrait' ? spec.w : spec.h;
    const h = orientation === 'portrait' ? spec.h : spec.w;

    // Scaled to the column's width, and never above life size.
    const boxRef = useRef<HTMLDivElement>(null);
    const [avail, setAvail] = useState(0);
    useLayoutEffect(() => {
        const el = boxRef.current;
        if (!el) return;
        const observer = new ResizeObserver(([entry]) => setAvail(entry.contentRect.width));
        observer.observe(el);
        return () => observer.disconnect();
    }, []);
    const scale = avail > 0 ? Math.min(1, avail / w) : 0;

    return (
        <div className="relative md:pb-32">
            <PageHeader onBack={onBack} title={t('settings.simulator')} />

            <div className="mx-auto w-full max-w-5xl px-6 md:px-8">
                <p className="mb-5 text-xs leading-relaxed text-muted">{t('settings.simulator_desc')}</p>

                <div className="mb-6 flex flex-wrap items-center gap-3">
                    <Segmented<DeviceId>
                        options={DEVICE_ORDER.map(id => ({ id, label: t(DEVICES[id].label) }))}
                        value={device}
                        onChange={setDevice}
                        aria-label={t('settings.simulator')}
                    />
                    <Segmented<Orientation>
                        options={[
                            { id: 'portrait', label: t('simulator.portrait') },
                            { id: 'landscape', label: t('simulator.landscape') },
                        ]}
                        value={orientation}
                        onChange={setOrientation}
                        aria-label={t('simulator.landscape')}
                    />
                    <span className="text-xs tabular-nums text-muted">
                        {w} × {h}
                    </span>
                </div>

                <div ref={boxRef} className="w-full">
                    {scale > 0 && (
                        <div
                            className="overflow-hidden rounded-[var(--radius-lg)] border-(length:--hairline) border-[var(--border)]"
                            style={{ width: w * scale, height: h * scale }}
                        >
                            <iframe
                                key={`${device}-${orientation}`}
                                src="/?sim=touch"
                                title={t('settings.simulator')}
                                width={w}
                                height={h}
                                className="block origin-top-left border-0 bg-[var(--bg)]"
                                style={{ transform: `scale(${scale})` }}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Simulator;
