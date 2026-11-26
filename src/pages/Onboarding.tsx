import React, { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Plus, Close, Check, ChevronLeft } from '../components/icons';
import { Molecule } from '../components/Molecule';
import { BODY_WEIGHT_KG_MAX, BODY_WEIGHT_KG_MIN, ExtraKey, Route, isPlausibleBodyWeightKG } from '../../logic';
import Tick from '../components/Tick';
import PixelCat from '../components/PixelCat';
import Doodle from '../components/Doodle';
import PlanWizard from '../components/PlanWizard';
import PageHeader from '../components/PageHeader';
import OnboardingCurve, { useOnboardingCurve, BEATS, type Beat, type CurveData } from '../components/OnboardingCurve';
import { useTranslation } from '../contexts/LanguageContext';
import { useHRTMode } from '../contexts/HRTModeContext';
import { useDialog } from '../contexts/DialogContext';
import type { Lang } from '../i18n/translations';
import { PlanItem, PLAN_DRUGS } from '../utils/plan';
import { asTitle, frequencyLabel, gelSiteName, regimenLabel } from '../utils/regimenText';

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

const divider = 'border-b-(length:--hairline) border-[var(--border)]';

/**
 * Softens the last rows of the language list while any are still below the
 * fold. The list's scrollbar is hidden like every other scroller in the app, so
 * without this a row can end flush against the footer and read as the end of
 * the languages — on a short screen that quietly hides two of them.
 */
const fadeMask = (above: boolean, below: boolean): string =>
    `linear-gradient(to bottom, ${above ? 'transparent, #000 3rem' : '#000'}, ${below ? '#000 calc(100% - 3rem), transparent' : '#000'})`;

/** Read straight out of the packs to size the greeting — see the welcome step. */
const SUBTITLE_KEY = 'onboarding.welcome_subtitle';

/**
 * The "how it works" stage: the model's own curve playing its three beats
 * (the doses, the level they make, the fit to a blood test), as Oyama
 * Journal's intro plays a live piece of the app on each screen. Mounted
 * afresh each time its screen comes in, so the story starts from the top.
 */
const HowStage: React.FC<{ curve: CurveData | null; active: boolean }> = ({ curve, active }) => {
    const { t } = useTranslation();
    const [beat, setBeat] = useState<Beat>(0);
    const [playKey, setPlayKey] = useState(0);
    const [finished, setFinished] = useState(false);
    const live = !!curve && active;

    useEffect(() => {
        if (!live || finished) return;
        const handle = window.setTimeout(() => {
            if (beat < 2) setBeat((beat + 1) as Beat);
            else setFinished(true);
        }, BEATS[beat]);
        return () => window.clearTimeout(handle);
    }, [live, beat, playKey, finished]);

    return (
        <div className="w-full">
            <OnboardingCurve
                data={curve}
                beat={beat}
                playKey={playKey}
                caption={t('onboarding.how_chart_caption')}
                legend={{
                    model: t('onboarding.how_chart_legend_model'),
                    labs: t('onboarding.how_chart_legend_labs'),
                }}
                action={
                    finished && (
                        <button
                            type="button"
                            onClick={() => {
                                setBeat(0);
                                setFinished(false);
                                setPlayKey(k => k + 1);
                            }}
                            className="ms-auto rounded-md px-1.5 py-0.5 text-xs text-[var(--accent-ink)] hover:bg-[var(--surface-hover)]"
                        >
                            {t('onboarding.how_replay')}
                        </button>
                    )
                }
            />
        </div>
    );
};

/** The welcome stage: the cat, with the hormones' own structures drifting round it. */
const WelcomeStage: React.FC = () => {
    const drift: [string, CSSProperties][] = [
        ['E2', { left: '2%', top: '6%', '--d': '9s', '--r0': '-8deg', '--r1': '4deg' } as CSSProperties],
        ['CPA', { right: '2%', top: '4%', '--d': '11s', '--r0': '6deg', '--r1': '-4deg' } as CSSProperties],
        ['SPIRO', { left: '10%', bottom: '2%', '--d': '10s', '--r0': '4deg', '--r1': '-6deg' } as CSSProperties],
        ['T', { right: '10%', bottom: '4%', '--d': '12s', '--r0': '-5deg', '--r1': '5deg' } as CSSProperties],
    ];
    return (
        <div className="relative h-full w-full">
            {drift.map(([id, style]) => (
                <span key={id} className="ob-float absolute opacity-40" style={style}>
                    <Molecule id={id} fallback="vial" size="sm" />
                </span>
            ))}
            <div className="absolute inset-0 flex items-center justify-center">
                <span className="ob-pop">
                    <PixelCat pose="donut" size={112} />
                </span>
            </div>
        </div>
    );
};

interface OnboardingProps {
    /** Same list Settings uses, rather than a second copy that can drift. */
    languageOptions: { value: string; label: string }[];
    /**
     * The live values, not blanks: replaying the intro shows what is already
     * set, so walking through it again changes nothing that isn't touched.
     */
    weight: number;
    onWeightChange: (kg: number) => void;
    plan: PlanItem[];
    onAddPlanItem: (item: PlanItem) => void;
    onDeletePlanItem: (id: string) => void;
    onDone: () => void;
}

/**
 * First run. Six screens, in the order a new user needs them: language before
 * anything else (the app defaults to Chinese, so every other word is unreadable
 * until it's set), then HRT mode, then what the app actually does, then the two
 * things the estimate and the Overview are built on — body weight and the
 * medication plan — then what it does with your data and what it can't do for
 * you.
 *
 * Weight and plan come after "how it works" rather than before it: by then the
 * model they feed has been shown, so being asked for them reads as part of the
 * same story instead of a form at the door.
 *
 * Rendered instead of the app shell, not as a tab inside it — the nav would
 * invite tabbing away halfway through, leaving language and mode on defaults
 * that the flow exists to ask about.
 */
const Onboarding: React.FC<OnboardingProps> = ({
    languageOptions,
    weight,
    onWeightChange,
    plan,
    onAddPlanItem,
    onDeletePlanItem,
    onDone,
}) => {
    const { t, lang, setLang } = useTranslation();
    const { mode, setMode, isTransmasc } = useHRTMode();
    const { showDialog } = useDialog();
    const curve = useOnboardingCurve(isTransmasc);

    // Kept as typed, so a half-typed figure ("6" on the way to "65") isn't
    // snapped back. Each plausible value is applied as it lands, like the
    // language and mode rows: leaving by Skip keeps it too.
    const [weightStr, setWeightStr] = useState(() => String(weight));
    const weightOk = isPlausibleBodyWeightKG(parseFloat(weightStr));
    const typeWeight = (s: string) => {
        setWeightStr(s);
        const kg = parseFloat(s);
        // Unchanged is left alone: setWeight stamps the value for sync, and
        // passing through the intro again is not an edit.
        if (isPlausibleBodyWeightKG(kg) && kg !== weight) onWeightChange(kg);
    };

    // Adding to the plan from the intro: the Plan page's own questions (below).
    const [addingPlan, setAddingPlan] = useState(false);
    const canAddPlan = (Object.keys(PLAN_DRUGS[mode]) as Route[]).some(r =>
        (PLAN_DRUGS[mode][r] ?? []).some(e => !plan.some(i => i.route === r && i.ester === e)),
    );

    const [step, setStep] = useState(0);

    const langListRef = useRef<HTMLDivElement>(null);
    const [langsBelow, setLangsBelow] = useState(false);
    const [langsAbove, setLangsAbove] = useState(false);
    const syncLangsBelow = () => {
        const el = langListRef.current;
        setLangsBelow(!!el && el.scrollHeight - el.scrollTop - el.clientHeight > 4);
        setLangsAbove(!!el && el.scrollTop > 4);
    };
    // Re-measured on step change, since the list only exists on step 0. The two
    // watchers cover different things and neither subsumes the other: `resize`
    // catches the rotation, while the observer catches the list's box moving
    // without the window doing anything — the address bar sliding away, or a
    // font landing late and retyping the rows.
    useEffect(() => {
        syncLangsBelow();
        window.addEventListener('resize', syncLangsBelow);
        const el = langListRef.current;
        const observer = new ResizeObserver(syncLangsBelow);
        if (el) {
            observer.observe(el);
            for (const row of Array.from(el.children)) observer.observe(row);
        }
        return () => {
            window.removeEventListener('resize', syncLangsBelow);
            observer.disconnect();
        };
    }, [step]);

    const modeOptions = [
        {
            value: 'transfem',
            labelKey: 'mode.transfem',
            descKey: 'onboarding.mode_transfem_desc',
            doodle: Route.injection,
        },
        {
            value: 'transmasc',
            labelKey: 'mode.transmasc',
            descKey: 'onboarding.mode_transmasc_desc',
            doodle: Route.gel,
        },
    ] as const;

    // Each screen as Oyama Journal's intro sets one: a stage (here, where the
    // choice is made, or a live piece of the app), then a kicker, a title and
    // a line of words under it.
    const screens: {
        key: 'welcome' | 'mode' | 'how' | 'weight' | 'plan' | 'privacy';
        kicker: string;
        title: string;
        body: React.ReactNode;
        stage: (active: boolean) => React.ReactNode;
        /** Tall enough for a list; the rest sit in the middle. */
        list?: boolean;
    }[] = [
        {
            key: 'welcome',
            kicker: 'Oyama HRT',
            title: t('onboarding.welcome_title'),
            body: t(SUBTITLE_KEY),
            list: true,
            stage: () => (
                <div className="flex h-full w-full flex-col">
                    <div className="h-24 shrink-0">
                        <WelcomeStage />
                    </div>
                    <div
                        ref={langListRef}
                        onScroll={syncLangsBelow}
                        style={
                            langsBelow || langsAbove
                                ? {
                                      maskImage: fadeMask(langsAbove, langsBelow),
                                      WebkitMaskImage: fadeMask(langsAbove, langsBelow),
                                  }
                                : undefined
                        }
                        className="mt-2 min-h-0 flex-1 overflow-y-auto scrollbar-hide text-start"
                    >
                        {languageOptions.map(({ value, label }) => (
                            <button
                                key={value}
                                onClick={() => setLang(value as Lang)}
                                aria-pressed={lang === value}
                                className={`flex w-full items-center justify-between gap-4 py-3 text-start ${divider} last:border-b-0`}
                            >
                                <span className={`text-sm text-body ${lang === value ? 'font-semibold' : ''}`}>
                                    {label}
                                </span>
                                <Tick on={lang === value} />
                            </button>
                        ))}
                    </div>
                </div>
            ),
        },
        {
            key: 'mode',
            kicker: t('onboarding.kicker.mode'),
            title: t('onboarding.mode_title'),
            body: t('onboarding.mode_subtitle'),
            stage: () => (
                <div className="w-full">
                    {modeOptions.map(({ value, labelKey, descKey, doodle }) => (
                        <button
                            key={value}
                            onClick={() => setMode(value)}
                            aria-pressed={mode === value}
                            className={`flex w-full items-center gap-3.5 py-4 text-start ${divider} last:border-b-0`}
                        >
                            <Doodle name={doodle} />
                            <span className="min-w-0 flex-1">
                                <span className={`block text-sm text-body ${mode === value ? 'font-semibold' : ''}`}>
                                    {t(labelKey)}
                                </span>
                                <span className="mt-0.5 block text-xs leading-relaxed text-muted">{t(descKey)}</span>
                            </span>
                            <Tick on={mode === value} />
                        </button>
                    ))}
                </div>
            ),
        },
        {
            key: 'how',
            kicker: t('onboarding.kicker.how'),
            title: t('onboarding.how_title'),
            body: t('onboarding.how_subtitle'),
            stage: active => <HowStage key={String(active)} curve={curve} active={active} />,
        },
        {
            key: 'weight',
            kicker: t('onboarding.kicker.weight'),
            title: t('onboarding.weight_title'),
            body: t('onboarding.weight_subtitle'),
            // Prefilled with what the model is using right now — 70 kg on a
            // fresh install — so Next on its own is an answer.
            stage: () => (
                <div className="w-full max-w-[16rem]">
                    <label
                        className={`flex items-baseline justify-center gap-3 pb-2 ${divider} focus-within:border-[var(--text)]`}
                    >
                        <input
                            type="number"
                            inputMode="decimal"
                            min={BODY_WEIGHT_KG_MIN}
                            max={BODY_WEIGHT_KG_MAX}
                            step="any"
                            value={weightStr}
                            onChange={e => typeWeight(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') forward();
                            }}
                            onFocus={e => e.currentTarget.select()}
                            aria-label={t('status.weight')}
                            className="figure-input w-32 min-w-0 bg-transparent text-center font-display text-[3rem] font-light leading-none tracking-[-0.035em] tabular-nums text-body outline-none select-text"
                        />
                        <span className="shrink-0 text-sm text-muted">kg</span>
                    </label>
                    <p
                        className={`mt-3 text-center text-xs leading-relaxed text-[var(--danger)] ${weightStr !== '' && !weightOk ? '' : 'invisible'}`}
                    >
                        {t('error.weightRange')}
                    </p>
                </div>
            ),
        },
        {
            key: 'plan',
            kicker: t('onboarding.kicker.plan'),
            title: t('onboarding.plan_title'),
            body: t('onboarding.plan_subtitle'),
            list: true,
            stage: () => (
                <div className="h-full w-full overflow-y-auto scrollbar-hide">
                    {plan.length === 0 && (
                        <div className="flex justify-center pt-2 pb-4">
                            <Doodle name={isTransmasc ? Route.gel : Route.injection} size={4.5} />
                        </div>
                    )}
                    {plan.map(item => (
                        <div key={item.id} className={`flex items-center gap-3.5 py-3.5 ${divider}`}>
                            <Doodle name={item.route} />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-body">{regimenLabel(item, t)}</p>
                                <p className="mt-0.5 text-xs leading-relaxed text-muted">
                                    {asTitle(frequencyLabel(item, t))}
                                    {item.route === Route.gel &&
                                        `, ${gelSiteName(item.extras[ExtraKey.gelSite] ?? 0, t)}`}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() =>
                                    showDialog('confirm', t('plan.delete_confirm'), () => onDeletePlanItem(item.id), {
                                        danger: true,
                                    })
                                }
                                aria-label={t('btn.delete')}
                                className="shrink-0 rounded-md p-1.5 text-muted hover:bg-[var(--surface-hover)]"
                            >
                                <Close size={16} />
                            </button>
                        </div>
                    ))}
                    {canAddPlan && (
                        <button
                            type="button"
                            onClick={() => setAddingPlan(true)}
                            className={`flex w-full items-center gap-3.5 py-3.5 text-start ${plan.length ? '' : 'justify-center'}`}
                        >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center text-[var(--accent-ink)]">
                                <Plus size={20} />
                            </span>
                            <span className="text-sm font-medium text-[var(--accent-ink)]">{t('plan.add')}</span>
                        </button>
                    )}
                </div>
            ),
        },
        {
            key: 'privacy',
            kicker: t('onboarding.kicker.privacy'),
            title: t('onboarding.privacy_title'),
            body: (
                <>
                    {t('onboarding.privacy_subtitle')}{' '}
                    <span className="text-[var(--danger)]">{t('onboarding.privacy_medical_desc')}</span>
                </>
            ),
            stage: () => (
                <div className="flex w-full max-w-[20rem] flex-col items-center">
                    <span className="ob-pop">
                        <Doodle name="lock" size={5.5} />
                    </span>
                    <ul className="mt-5 flex w-full flex-col gap-2.5">
                        {[
                            t('onboarding.privacy_local'),
                            t('onboarding.privacy_cloud'),
                            t('onboarding.privacy_medical'),
                        ].map(line => (
                            <li key={line} className="flex items-center gap-2.5 text-sm text-[var(--text)]">
                                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--accent-subtle)] text-[var(--accent-ink)]">
                                    <Check size={13} strokeWidth={2.4} />
                                </span>
                                {line}
                            </li>
                        ))}
                    </ul>
                </div>
            ),
        },
    ];

    const last = screens.length - 1;
    const isLast = step === last;
    const current = screens[step].key;
    // Only the weight can be left in a state the app can't use. Skip still
    // leaves, keeping the last plausible figure.
    const ready = current !== 'weight' || weightOk;

    const go = (next: number) => setStep(Math.max(0, Math.min(last, next)));
    function forward() {
        if (!ready) return;
        if (isLast) onDone();
        else go(step + 1);
    }

    // The arrow keys turn the screens, as in the journal's intro.
    useEffect(() => {
        const on = (e: KeyboardEvent) => {
            const typing = e.target instanceof HTMLInputElement;
            if (typing) return;
            if (e.key === 'ArrowRight' && ready) setStep(s => Math.min(last, s + 1));
            else if (e.key === 'ArrowLeft') setStep(s => Math.max(0, s - 1));
        };
        window.addEventListener('keydown', on);
        return () => window.removeEventListener('keydown', on);
    }, [last, ready]);

    // A swipe: sideways moves the screens with the finger; let go past a
    // fifth of the width (or flicked) and it turns.
    const [drag, setDrag] = useState(0);
    const press = useRef<{ x: number; y: number; t: number; id: number; axis?: 'x' | 'y' } | null>(null);
    const frame = useRef<HTMLDivElement>(null);
    const still = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const onDown = (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        press.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
    };
    const onMove = (e: React.PointerEvent) => {
        const p = press.current;
        if (!p || p.id !== e.pointerId) return;
        const dx = e.clientX - p.x;
        const dy = e.clientY - p.y;
        if (!p.axis && Math.hypot(dx, dy) > 8) {
            p.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
            if (p.axis === 'x') (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        }
        if (p.axis !== 'x') return;
        const edge = (step === 0 && dx > 0) || (step === last && dx < 0) || (dx < 0 && !ready);
        setDrag(edge ? dx * 0.3 : dx);
    };
    const onUp = (e: React.PointerEvent) => {
        const p = press.current;
        press.current = null;
        if (!p || p.axis !== 'x') return setDrag(0);
        const dx = e.clientX - p.x;
        const w = frame.current?.clientWidth ?? 360;
        const fast = Math.abs(dx) / Math.max(1, performance.now() - p.t) > 0.5;
        if ((dx < -w / 5 || (fast && dx < -30)) && step < last && ready) go(step + 1);
        else if ((dx > w / 5 || (fast && dx > 30)) && step > 0) go(step - 1);
        setDrag(0);
    };

    // The plan's questions take the intro's place while they run, under a
    // title whose back arrow backs out of them, the way the Plan page has
    // them. There is no bottom bar here, so their buttons go to the edge.
    if (addingPlan) {
        return (
            <div
                data-prompt-area
                className="flex h-[100dvh] w-full select-none flex-col bg-[var(--bg)] font-sans text-[var(--text)]"
            >
                <div aria-hidden="true" className="shrink-0 pt-[env(safe-area-inset-top,0px)]" />
                <div className="flex flex-1 flex-col overflow-y-auto scrollbar-hide">
                    <PageHeader onBack={() => setAddingPlan(false)} title={t('plan.add')} />
                    <PlanWizard
                        plan={plan}
                        onAdd={item => {
                            onAddPlanItem(item);
                            setAddingPlan(false);
                        }}
                        onCancel={() => setAddingPlan(false)}
                    />
                </div>
            </div>
        );
    }

    return (
        <div
            data-prompt-area
            role="dialog"
            aria-modal="true"
            aria-label={t('onboarding.welcome_title')}
            className="flex h-[100dvh] w-full select-none flex-col bg-[var(--bg)] font-sans text-[var(--text)]"
        >
            {/* The name, as the journal's intro shows its own, and Skip. */}
            <div className="mx-auto flex w-full max-w-lg shrink-0 items-center gap-2.5 px-6 pt-[calc(0.875rem+env(safe-area-inset-top,0px))]">
                <img src="/pwa-192x192.png" alt="" width={30} height={30} className="size-[30px] rounded-[8px]" />
                <span className="font-display text-[1.25rem] leading-none tracking-[-0.015em]">
                    <span className="font-normal text-[var(--text)]">Oyama</span>{' '}
                    <span className="font-light text-[var(--text-muted)]">Tracker</span>
                </span>
                <button
                    type="button"
                    onClick={onDone}
                    className={`ms-auto rounded-full px-3 py-1.5 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-hover)] ${isLast ? 'invisible' : ''}`}
                    tabIndex={isLast ? -1 : 0}
                >
                    {t('onboarding.skip')}
                </button>
            </div>

            <div
                ref={frame}
                className="relative mx-auto w-full max-w-lg flex-1 overflow-hidden"
                style={{ touchAction: 'pan-y' }}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
            >
                <div
                    className="flex h-full"
                    style={{
                        transform: `translate3d(calc(${-step * 100}% + ${drag}px), 0, 0)`,
                        transition: drag || still() ? 'none' : 'transform 560ms cubic-bezier(0.22, 0.9, 0.24, 1)',
                    }}
                >
                    {screens.map((s, k) => (
                        <section
                            key={s.key}
                            className="ob-screen flex h-full w-full shrink-0 flex-col overflow-y-auto scrollbar-hide px-6 pt-5"
                            data-active={k === step}
                            aria-hidden={k !== step}
                            {...(k === step ? {} : { inert: '' })}
                        >
                            <div
                                className={`ob-stage relative grid flex-1 place-items-center overflow-hidden rounded-[1.75rem] bg-[var(--surface-muted)] px-6 py-5 ${s.list ? 'min-h-[17rem] max-h-[26rem]' : 'min-h-[15rem] max-h-[24rem]'}`}
                            >
                                {s.stage(k === step)}
                            </div>
                            <div className="pt-7 pb-4">
                                <p
                                    className="ob-rise text-sm font-semibold text-[var(--accent-ink)]"
                                    style={{ '--i': 0 } as CSSProperties}
                                >
                                    {s.kicker}
                                </p>
                                <h1
                                    className="ob-rise mt-2 font-display text-[2.125rem] font-semibold leading-[1.08] tracking-[-0.03em]"
                                    style={{ '--i': 1 } as CSSProperties}
                                >
                                    {s.title}
                                </h1>
                                <p
                                    className="ob-rise mt-3 text-[0.9375rem] leading-relaxed text-[var(--text-muted)]"
                                    style={{ '--i': 2 } as CSSProperties}
                                >
                                    {s.body}
                                </p>
                            </div>
                        </section>
                    ))}
                </div>
            </div>

            <div className="mx-auto w-full max-w-lg shrink-0 px-6 pt-2 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
                <div className="mb-4 flex gap-1.5" aria-hidden="true">
                    {screens.map((s, k) => (
                        <button
                            key={s.key}
                            type="button"
                            tabIndex={-1}
                            onClick={() => (k <= step || ready ? go(k) : undefined)}
                            className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--border)]"
                        >
                            <span
                                className="block h-full rounded-full bg-[var(--accent)] transition-[width] duration-500 ease-out"
                                style={{ width: k <= step ? '100%' : '0%' }}
                            />
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-3">
                    {step > 0 && (
                        <button
                            type="button"
                            onClick={() => go(step - 1)}
                            className="btn-secondary !px-3"
                            aria-label={t('onboarding.back')}
                        >
                            <ChevronLeft size={18} />
                        </button>
                    )}
                    <button type="button" onClick={forward} disabled={!ready} className="btn-primary flex-1">
                        {t(isLast ? 'onboarding.start' : 'onboarding.next')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Onboarding;
