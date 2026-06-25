import React from 'react';
import { ArrowLeft, Check, Minus, CircleOff, Gauge, Radar, Wind, Rewind, FastForward, LucideIcon } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';
import { CalibrationMethod, CalibrationHistoryMode, CalibrationResult } from '../../logic';

interface CalibrationSettingsProps {
    method: CalibrationMethod;
    setMethod: (m: CalibrationMethod) => void;
    historyMode: CalibrationHistoryMode;
    setHistoryMode: (m: CalibrationHistoryMode) => void;
    calibration: CalibrationResult;
    onBack: () => void;
}

const muted = 'text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]';
const on = 'text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]';
const divider = 'border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]';

interface MethodDef {
    value: CalibrationMethod;
    icon: LucideIcon;
    recommended?: boolean;
    pros: string[];
    cons: string[];
}

// The three learning estimators mirror the calibration models on
// hrt.transmtf.com (EKF parameter learning, OU-Kalman dynamic calibration,
// Hybrid-MIPD Bayesian fit), reimplemented over this engine's two identifiable
// parameters: a personal amplitude and a personal clearance.
const METHODS: MethodDef[] = [
    { value: 'off', icon: CircleOff, pros: ['cal.off.pro.1'], cons: ['cal.off.con.1'] },
    { value: 'mipd', icon: Gauge, recommended: true, pros: ['cal.mipd.pro.1', 'cal.mipd.pro.2'], cons: ['cal.mipd.con.1'] },
    { value: 'ekf', icon: Radar, pros: ['cal.ekf.pro.1', 'cal.ekf.pro.2'], cons: ['cal.ekf.con.1'] },
    { value: 'ou_kalman', icon: Wind, pros: ['cal.ou_kalman.pro.1', 'cal.ou_kalman.pro.2'], cons: ['cal.ou_kalman.con.1'] },
];

// Only EKF and MIPD fit a personal clearance; OU-Kalman corrects amplitude only.
const fitsClearance = (m: CalibrationMethod) => m === 'ekf' || m === 'mipd';

const HISTORY_MODES: { value: CalibrationHistoryMode; icon: LucideIcon }[] = [
    { value: 'retrospective', icon: Rewind },
    { value: 'forward', icon: FastForward },
];

// Shared selectable card (icon + title + radio) used for both the estimator
// methods and the history modes so the two lists render identically.
const OptionCard: React.FC<{
    selected: boolean;
    icon: LucideIcon;
    title: string;
    badge?: string;
    onClick: () => void;
    children?: React.ReactNode;
}> = ({ selected, icon: Icon, title, badge, onClick, children }) => (
    <button
        onClick={onClick}
        className="w-full text-start rounded-2xl border p-4 outline-none focus:outline-none focus-visible:outline-none transition-colors"
        style={{
            borderColor: selected ? 'var(--color-m3-primary)' : 'var(--color-m3-outline-variant)',
            background: selected ? 'color-mix(in srgb, var(--color-m3-primary) 6%, transparent)' : 'transparent',
        }}
    >
        <div className="flex items-start gap-3">
            <div
                className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'color-mix(in srgb, var(--color-m3-primary) 10%, transparent)' }}
            >
                <Icon size={17} className="text-[var(--color-m3-primary)] dark:text-[var(--color-m3-primary-light)]" />
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className={`text-[15px] ${selected ? `font-semibold ${on}` : on}`}>{title}</span>
                    {badge && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full text-[var(--color-m3-primary)] dark:text-[var(--color-m3-primary-light)] border border-[var(--color-m3-primary)]/30">
                            {badge}
                        </span>
                    )}
                </div>
                {children}
            </div>

            {/* Radio */}
            <span
                className="shrink-0 mt-0.5 w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center"
                style={{ borderColor: selected ? 'var(--color-m3-primary)' : 'var(--color-m3-outline)' }}
            >
                {selected && <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-m3-primary)]" />}
            </span>
        </div>
    </button>
);

const CalibrationSettings: React.FC<CalibrationSettingsProps> = ({ method, setMethod, historyMode, setHistoryMode, calibration, onBack }) => {
    const { t } = useTranslation();

    const showFit = method !== 'off' && calibration.points.length > 0;
    const signedPct = (p: number) => `${p >= 0 ? '+' : ''}${p.toFixed(0)}%`;

    const stats: { label: string; value: string }[] = showFit
        ? [
            { label: t('cal.amplitude'), value: `×${calibration.scale.toFixed(2)}` },
            ...(fitsClearance(method)
                ? [{ label: t('cal.halflife'), value: signedPct(calibration.halfLifeDeltaPct) }]
                : []),
            ...(calibration.fitErrPct !== null
                ? [{ label: t('cal.fit'), value: `±${calibration.fitErrPct.toFixed(0)}%` }]
                : []),
            { label: t('cal.labs'), value: String(calibration.n) },
        ]
        : [];

    return (
        <div className="relative pb-32">
            <div className="sticky top-0 z-20 bg-[var(--color-m3-surface-dim)] dark:bg-[var(--color-m3-dark-surface)] px-6 md:px-8 pt-8 pb-3">
                <button
                    onClick={onBack}
                    className="flex items-center gap-3 -ml-2 px-2 py-1.5 rounded-lg outline-none focus:outline-none focus-visible:outline-none hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)]"
                >
                    <ArrowLeft size={18} className={`${muted} shrink-0`} />
                    <span className={`text-xl font-semibold ${on}`}>{t('cal.settings')}</span>
                </button>
            </div>

            <div className="px-6 md:px-8 mt-4 max-w-2xl">
                {/* Method cards */}
                <div className="space-y-2.5">
                    {METHODS.map(({ value, icon, recommended, pros, cons }) => (
                        <OptionCard
                            key={value}
                            selected={method === value}
                            icon={icon}
                            title={t(`cal.${value}`)}
                            badge={recommended ? t('cal.recommended') : undefined}
                            onClick={() => setMethod(value)}
                        >
                            <p className={`text-[13px] leading-snug ${muted} mt-1`}>
                                {t(`cal.desc.${value}`)}
                            </p>

                            <ul className="mt-3 space-y-1.5">
                                {pros.map(k => (
                                    <li key={k} className="flex items-start gap-2 text-[12.5px] leading-snug">
                                        <Check size={13} className="mt-[3px] shrink-0 text-emerald-600/80 dark:text-emerald-400/80" />
                                        <span className={muted}>{t(k)}</span>
                                    </li>
                                ))}
                                {cons.map(k => (
                                    <li key={k} className="flex items-start gap-2 text-[12.5px] leading-snug">
                                        <Minus size={13} className={`mt-[3px] shrink-0 ${muted}`} />
                                        <span className={muted}>{t(k)}</span>
                                    </li>
                                ))}
                            </ul>
                        </OptionCard>
                    ))}
                </div>

                {/* History mode — how a new lab is allowed to act on the past curve.
                    Only meaningful once a learning method is selected. */}
                {method !== 'off' && (
                    <div className="mt-8">
                        <p className={`text-[13px] font-semibold uppercase tracking-wide ${muted} mb-2`}>
                            {t('cal.history')}
                        </p>
                        <div className="space-y-2.5">
                            {HISTORY_MODES.map(({ value: hm, icon }) => (
                                <OptionCard
                                    key={hm}
                                    selected={historyMode === hm}
                                    icon={icon}
                                    title={t(`cal.${hm}`)}
                                    onClick={() => setHistoryMode(hm)}
                                >
                                    <p className={`text-[13px] leading-snug ${muted} mt-1`}>
                                        {t(`cal.desc.${hm}`)}
                                    </p>
                                </OptionCard>
                            ))}
                        </div>
                    </div>
                )}

                {/* Current fit */}
                {showFit && (
                    <div className="mt-8">
                        <p className={`text-[13px] font-semibold uppercase tracking-wide ${muted} mb-1`}>
                            {t('cal.current')}
                        </p>
                        {stats.map(({ label, value }) => (
                            <div key={label} className={`flex items-center justify-between py-3 ${divider}`}>
                                <span className={`text-sm ${muted}`}>{label}</span>
                                <span className={`text-sm font-medium tabular-nums ${on}`}>{value}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Attribution: the learning models mirror those on hrt.transmtf.com. */}
                <p className={`text-[11px] leading-snug ${muted} mt-8`}>
                    {t('cal.source')}
                </p>
            </div>
        </div>
    );
};

export default CalibrationSettings;
