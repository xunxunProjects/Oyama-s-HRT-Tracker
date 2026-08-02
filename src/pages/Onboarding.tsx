import React, { useState } from 'react';
import { Activity, AlertTriangle, Check, Cloud, FlaskConical, Lock, Syringe } from 'lucide-react';
import PixelCat from '../components/PixelCat';
import { useTranslation } from '../contexts/LanguageContext';
import { useHRTMode } from '../contexts/HRTModeContext';
import { Lang } from '../i18n/translations';

const ONBOARDING_KEY = 'app-onboarded';

/**
 * Anyone with records on this device has been using the app since before there
 * was an intro, and greeting them as a stranger — worse, offering to set the
 * language and HRT mode they already chose — is the one way this screen can do
 * harm. So an existing dose log counts as having been onboarded.
 *
 * The keys are the ones useAppData writes: `hrt-events` while signed out,
 * `hrt-masc-events` for transmasc, and `hrt-u<id>-` prefixed variants per
 * account. Matched by shape rather than listed, since the accounts on a device
 * aren't known here.
 */
const EVENTS_KEY = /^hrt-(u[^-]+-)?(masc-)?events$/;

export const shouldShowOnboarding = (): boolean => {
    if (localStorage.getItem(ONBOARDING_KEY) === 'true') return false;
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !EVENTS_KEY.test(key)) continue;
        const value = localStorage.getItem(key);
        if (value && value !== '[]') return false;
    }
    return true;
};

export const markOnboardingSeen = (): void => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
};

const divider = 'border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]';

interface PointProps {
    Icon: React.ElementType;
    title: string;
    desc: string;
}

const Point: React.FC<PointProps> = ({ Icon, title, desc }) => (
    <div className={`flex items-start gap-3.5 py-4 ${divider} last:border-b-0`}>
        <div className="mt-0.5 shrink-0 rounded-lg bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container)] p-2">
            <Icon size={18} strokeWidth={1.75} className="text-muted" />
        </div>
        <div>
            <p className="text-[15px] font-medium text-body">{title}</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{desc}</p>
        </div>
    </div>
);

interface OnboardingProps {
    /** Same list Settings uses, rather than a second copy that can drift. */
    languageOptions: { value: string; label: string }[];
    onDone: () => void;
}

/**
 * First run. Four screens, in the order a new user needs them: language before
 * anything else (the app defaults to Chinese, so every other word is unreadable
 * until it's set), then HRT mode, then what the app actually does, then what it
 * does with your data and what it can't do for you.
 *
 * Rendered instead of the app shell, not as a tab inside it — the nav would
 * invite tabbing away halfway through, leaving language and mode on defaults
 * that the flow exists to ask about.
 */
const Onboarding: React.FC<OnboardingProps> = ({ languageOptions, onDone }) => {
    const { t, lang, setLang } = useTranslation();
    const { mode, setMode } = useHRTMode();

    const [step, setStep] = useState(0);
    // Only so the step change slides the way the app's view changes do.
    const [direction, setDirection] = useState<'forward' | 'backward'>('forward');

    const modeOptions = [
        { value: 'transfem', labelKey: 'mode.transfem', descKey: 'onboarding.mode_transfem_desc' },
        { value: 'transmasc', labelKey: 'mode.transmasc', descKey: 'onboarding.mode_transmasc_desc' },
    ] as const;

    const steps = [
        // The cat is the welcome, so it gets the room. Whatever it happens to be
        // doing at this hour is the greeting — the schedule is the point, and a
        // pose reserved for first-timers would be the one cat in the app that
        // isn't living out its day. It obeys the "show pixel cats" preference
        // like every other cat: someone replaying the intro with them switched
        // off asked not to see one.
        <div key="welcome" className="pt-6 text-center">
            <div className="flex justify-center">
                <PixelCat pose="donut" size={176} />
            </div>
            <h1 className="mt-6 text-2xl font-semibold text-body">{t('onboarding.welcome_title')}</h1>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted">
                {t('onboarding.welcome_subtitle')}
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-2">
                {languageOptions.map(({ value, label }) => (
                    <button
                        key={value}
                        onClick={() => setLang(value as Lang)}
                        aria-pressed={lang === value}
                        className={`rounded-full border px-3.5 py-1.5 text-[13px] ${lang === value
                            ? 'border-[var(--color-m3-primary)] bg-[var(--color-m3-primary-container)] font-medium text-[var(--color-m3-on-primary-container)] dark:bg-[var(--color-m3-dark-primary-container)] dark:text-[var(--color-m3-dark-on-primary-container)]'
                            : 'border-[var(--color-m3-outline-variant)] text-muted dark:border-[var(--color-m3-dark-outline-variant)]'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>
        </div>,

        <div key="mode" className="pt-8">
            <h1 className="text-2xl font-semibold text-body">{t('onboarding.mode_title')}</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">{t('onboarding.mode_subtitle')}</p>
            <div className="mt-6">
                {modeOptions.map(({ value, labelKey, descKey }) => (
                    <button
                        key={value}
                        onClick={() => setMode(value)}
                        className={`flex w-full items-center justify-between gap-4 py-4 text-start ${divider} last:border-b-0`}
                    >
                        <span>
                            <span className={`block text-[15px] text-body ${mode === value ? 'font-semibold' : ''}`}>
                                {t(labelKey)}
                            </span>
                            <span className="mt-0.5 block text-[13px] leading-relaxed text-muted">
                                {t(descKey)}
                            </span>
                        </span>
                        {mode === value && (
                            <Check size={16} className="shrink-0 text-[var(--color-m3-primary)] dark:text-[var(--color-m3-primary-light)]" />
                        )}
                    </button>
                ))}
            </div>
        </div>,

        <div key="how" className="pt-8">
            <h1 className="text-2xl font-semibold text-body">{t('onboarding.how_title')}</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">{t('onboarding.how_subtitle')}</p>
            <div className="mt-4">
                <Point Icon={Syringe} title={t('onboarding.how_log')} desc={t('onboarding.how_log_desc')} />
                <Point Icon={Activity} title={t('onboarding.how_chart')} desc={t('onboarding.how_chart_desc')} />
                <Point Icon={FlaskConical} title={t('onboarding.how_calibrate')} desc={t('onboarding.how_calibrate_desc')} />
            </div>
            <p className="callout mt-5">{t('onboarding.how_note')}</p>
        </div>,

        <div key="privacy" className="pt-8">
            <h1 className="text-2xl font-semibold text-body">{t('onboarding.privacy_title')}</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">{t('onboarding.privacy_subtitle')}</p>
            <div className="mt-4">
                <Point Icon={Lock} title={t('onboarding.privacy_local')} desc={t('onboarding.privacy_local_desc')} />
                <Point Icon={Cloud} title={t('onboarding.privacy_cloud')} desc={t('onboarding.privacy_cloud_desc')} />
                <Point Icon={AlertTriangle} title={t('onboarding.privacy_medical')} desc={t('onboarding.privacy_medical_desc')} />
            </div>
        </div>,
    ];

    const isLast = step === steps.length - 1;

    const go = (next: number) => {
        setDirection(next > step ? 'forward' : 'backward');
        setStep(next);
    };

    return (
        <div className="flex h-[100dvh] w-full select-none flex-col bg-[var(--color-m3-surface-dim)] font-sans text-[var(--color-m3-on-surface)] dark:bg-[var(--color-m3-dark-surface)] dark:text-[var(--color-m3-dark-on-surface)]">
            <div className="flex shrink-0 justify-end px-4 pt-[calc(0.75rem+env(safe-area-inset-top,0px))]">
                <button
                    onClick={onDone}
                    className={`rounded-lg px-2 py-1.5 text-[13px] text-muted hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)] ${isLast ? 'invisible' : ''}`}
                    tabIndex={isLast ? -1 : 0}
                >
                    {t('onboarding.skip')}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-hide px-6">
                <div
                    key={step}
                    className={`mx-auto w-full max-w-md pb-8 ${direction === 'backward' ? 'view-enter-backward' : 'view-enter-forward'}`}
                >
                    {steps[step]}
                </div>
            </div>

            <div className={`shrink-0 px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] border-t border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]`}>
                <div className="mx-auto grid w-full max-w-md grid-cols-[1fr_auto_1fr] items-center gap-4">
                    <div className="justify-self-start">
                        {step > 0 && (
                            <button onClick={() => go(step - 1)} className="btn-secondary">
                                {t('onboarding.back')}
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-1.5" aria-hidden="true">
                        {steps.map((_, i) => (
                            <span
                                key={i}
                                className={`h-1.5 rounded-full transition-all duration-200 motion-reduce:transition-none ${i === step
                                    ? 'w-4 bg-[var(--color-m3-primary)]'
                                    : 'w-1.5 bg-[var(--color-m3-outline-variant)] dark:bg-[var(--color-m3-dark-outline-variant)]'
                                }`}
                            />
                        ))}
                    </div>

                    <div className="justify-self-end">
                        <button onClick={() => (isLast ? onDone() : go(step + 1))} className="btn-primary">
                            {t(isLast ? 'onboarding.start' : 'onboarding.next')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Onboarding;
