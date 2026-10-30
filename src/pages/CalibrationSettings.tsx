import React from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import Tick from '../components/Tick';
import { Check, Minus, Off, Gauge, Radar, Wind, Rewind, FastForward, type IconComponent } from '../components/icons';
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

const muted = 'text-[var(--text-muted)]';
const on = 'text-[var(--text)]';
const divider = 'border-b-(length:--hairline) border-[var(--border)]';

interface MethodDef {
    value: CalibrationMethod;
    icon: IconComponent;
    recommended?: boolean;
    pros: string[];
    cons: string[];
}

// The three learning estimators mirror the calibration models on
// hrt.transmtf.com (EKF parameter learning, OU-Kalman dynamic calibration,
// Hybrid-MIPD Bayesian fit), reimplemented over this engine's two identifiable
// parameters: a personal amplitude and a personal clearance.
const METHODS: MethodDef[] = [
    { value: 'off', icon: Off, pros: ['cal.off.pro.1'], cons: ['cal.off.con.1'] },
    {
        value: 'mipd',
        icon: Gauge,
        recommended: true,
        pros: ['cal.mipd.pro.1', 'cal.mipd.pro.2'],
        cons: ['cal.mipd.con.1'],
    },
    { value: 'ekf', icon: Radar, pros: ['cal.ekf.pro.1', 'cal.ekf.pro.2'], cons: ['cal.ekf.con.1'] },
    {
        value: 'ou_kalman',
        icon: Wind,
        pros: ['cal.ou_kalman.pro.1', 'cal.ou_kalman.pro.2'],
        cons: ['cal.ou_kalman.con.1'],
    },
];

// Only EKF and MIPD fit a personal clearance; OU-Kalman corrects amplitude only.
const fitsClearance = (m: CalibrationMethod) => m === 'ekf' || m === 'mipd';

const HISTORY_MODES: { value: CalibrationHistoryMode; icon: IconComponent }[] = [
    { value: 'retrospective', icon: Rewind },
    { value: 'forward', icon: FastForward },
];

// Shared selectable card (icon + title + radio) used for both the estimator
// methods and the history modes so the two lists render identically.
// aria-pressed is what tells a screen reader which card is chosen: the tick
// is aria-hidden, and radio roles would promise arrow-key movement these
// cards don't have.
const OptionCard: React.FC<{
    selected: boolean;
    icon: IconComponent;
    title: string;
    badge?: string;
    onClick: () => void;
    children?: React.ReactNode;
}> = ({ selected, icon: Icon, title, badge, onClick, children }) => (
    <button
        onClick={onClick}
        aria-pressed={selected}
        className="w-full text-start rounded-lg border p-4 outline-none focus:outline-none focus-visible:outline-none transition-colors"
        style={{
            borderColor: selected ? 'var(--accent-ink)' : 'var(--border)',
            background: selected ? 'color-mix(in srgb, var(--accent) 6%, transparent)' : 'transparent',
        }}
    >
        <div className="flex items-start gap-3">
            <div
                className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}
            >
                <Icon size={17} className="text-[var(--accent-ink)]" />
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className={`text-sm ${selected ? `font-semibold ${on}` : on}`}>{title}</span>
                    {badge && <span className="text-xs font-medium text-[var(--accent-ink)]">{badge}</span>}
                </div>
                {children}
            </div>

            {/* The chosen card gets the same drawn tick as every other option list, level with its title. */}
            <span className="icon-line text-sm">
                <Tick on={selected} size={18} />
            </span>
        </div>
    </button>
);

const CalibrationSettings: React.FC<CalibrationSettingsProps> = ({
    method,
    setMethod,
    historyMode,
    setHistoryMode,
    calibration,
    onBack,
}) => {
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
        <div className="relative md:pb-32">
            <PageHeader onBack={onBack} title={t('cal.settings')} />

            <div className={`${PAGE_COLUMN} mt-4`}>
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
                            <p className={`text-xs leading-snug ${muted} mt-1`}>{t(`cal.desc.${value}`)}</p>

                            <ul className="mt-3 space-y-1.5">
                                {pros.map(k => (
                                    <li key={k} className="flex items-start gap-2 text-xs leading-snug">
                                        <span className="icon-line">
                                            <Check size={13} className="text-[var(--status-positive)]/80" />
                                        </span>
                                        <span className={muted}>{t(k)}</span>
                                    </li>
                                ))}
                                {cons.map(k => (
                                    <li key={k} className="flex items-start gap-2 text-xs leading-snug">
                                        <span className="icon-line">
                                            <Minus size={13} className={muted} />
                                        </span>
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
                        <p className={`text-xs font-semibold ${muted} mb-2`}>{t('cal.history')}</p>
                        <div className="space-y-2.5">
                            {HISTORY_MODES.map(({ value: hm, icon }) => (
                                <OptionCard
                                    key={hm}
                                    selected={historyMode === hm}
                                    icon={icon}
                                    title={t(`cal.${hm}`)}
                                    onClick={() => setHistoryMode(hm)}
                                >
                                    <p className={`text-xs leading-snug ${muted} mt-1`}>{t(`cal.desc.${hm}`)}</p>
                                </OptionCard>
                            ))}
                        </div>
                    </div>
                )}

                {/* Current fit */}
                {showFit && (
                    <div className="mt-8">
                        <p className={`text-xs font-semibold ${muted} mb-1`}>{t('cal.current')}</p>
                        {stats.map(({ label, value }) => (
                            <div key={label} className={`flex items-center justify-between py-3 ${divider}`}>
                                <span className={`text-sm ${muted}`}>{label}</span>
                                <span className={`text-sm font-medium tabular-nums ${on}`}>{value}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Attribution: the learning models mirror those on hrt.transmtf.com. */}
                <p className={`text-xs leading-snug ${muted} mt-8`}>{t('cal.source')}</p>
            </div>
        </div>
    );
};

export default CalibrationSettings;
