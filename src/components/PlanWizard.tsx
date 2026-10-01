import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import { Ester, GEL_SITE_ORDER, Route, SL_TIER_ORDER, SublingualTierParams } from '../../logic';
import Tick from './Tick';
import Doodle from './Doodle';
import DoseRings from './DoseRings';
import { useTranslation } from '../contexts/LanguageContext';
import { useHRTMode } from '../contexts/HRTModeContext';
import { PlanItem, PlanDraft, FREQUENCIES, PLAN_DRUGS, draftToItem, freshDraft } from '../utils/plan';
import { frequencyLabel, gelSiteName, regimenLabel, supplyLabel } from '../utils/regimenText';

const divider = 'border-b border-[var(--border)]';

type StepKey = 'route' | 'drug' | 'dose' | 'site' | 'hold' | 'freq';

/** The rhythms a route is usually on. The rest wait behind the last row. */
const COMMON_FREQ: Partial<Record<Route, string[]>> = {
    [Route.injection]: ['e3', 'e5', 'e7', 'e10', 'e14'],
    [Route.oral]: ['d1', 'd2', 'd3', 'e2'],
    [Route.sublingual]: ['d1', 'd2', 'd3', 'e2'],
    [Route.gel]: ['d1', 'd2'],
    [Route.patchApply]: ['e3', 'e3.5', 'e7'],
};

interface RowProps {
    on: boolean;
    onClick: () => void;
    title: string;
    desc?: string;
    /** Shown in place of the tick on a row that can't be chosen. */
    note?: string;
    mark?: React.ReactNode;
}

/** One choice: the intro's row, with a drawing in front when the choice has one. */
const Row: React.FC<RowProps> = ({ on, onClick, title, desc, note, mark }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={!!note}
        aria-pressed={on}
        className={`flex w-full items-center gap-3.5 py-4 text-start ${divider} last:border-b-0`}
    >
        {mark}
        <span className="min-w-0 flex-1">
            <span className={`block text-[0.9375rem] ${note ? 'text-muted' : 'text-body'} ${on ? 'font-semibold' : ''}`}>{title}</span>
            {desc && <span className="mt-0.5 block text-[0.8125rem] leading-relaxed text-muted">{desc}</span>}
        </span>
        {note ? <span className="shrink-0 text-[0.8125rem] text-muted">{note}</span> : <Tick on={on} />}
    </button>
);

interface PlanWizardProps {
    plan: PlanItem[];
    onAdd: (item: PlanItem) => void;
    onCancel: () => void;
}

/**
 * Adding a drug to the plan, one question a screen, in the intro's shell: a
 * heading, rows to choose from, and the same back / rings / next along the
 * bottom. Takes over the whole window for the same reason the intro does.
 *
 * Choosing a route fills in everything after it with what is usual for that
 * route, so the later screens open already answered and Next is enough when
 * the usual fits.
 */
const PlanWizard: React.FC<PlanWizardProps> = ({ plan, onAdd, onCancel }) => {
    const { t } = useTranslation();
    const { mode } = useHRTMode();

    const routes = Object.keys(PLAN_DRUGS[mode]) as Route[];
    // A drug by a route is in the plan once; what is already there can't be picked again.
    const free = (r: Route) => (PLAN_DRUGS[mode][r] ?? []).filter(e => !plan.some(i => i.route === r && i.ester === e));

    const [draft, setDraft] = useState<PlanDraft | null>(null);
    const [at, setAt] = useState(0);
    const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
    const [allFreq, setAllFreq] = useState(false);

    const drugs = draft ? PLAN_DRUGS[mode][draft.route] ?? [] : [];
    const steps: StepKey[] = [
        'route',
        ...(!draft || drugs.length > 1 ? ['drug' as const] : []),
        'dose',
        ...(draft?.route === Route.gel ? ['site' as const] : []),
        ...(draft?.route === Route.sublingual ? ['hold' as const] : []),
        'freq',
    ];
    const step = steps[Math.min(at, steps.length - 1)];
    const isLast = at >= steps.length - 1;
    const item = draft && draftToItem(draft, 'draft');
    const ready = step === 'route' ? !!draft : step === 'dose' ? !!item : true;

    const go = (next: number) => {
        setDirection(next > at ? 'forward' : 'backward');
        setAt(next);
    };
    const forward = () => {
        if (!ready) return;
        if (!isLast) { go(at + 1); return; }
        const done = draft && draftToItem(draft, uuidv4());
        if (done) onAdd(done);
    };

    const pickRoute = (route: Route) => {
        const open = free(route);
        setDraft(d => freshDraft(route, d && d.route === route && open.includes(d.ester) ? d.ester : open[0]));
        setAllFreq(false);
    };
    const pickDrug = (ester: Ester) => setDraft(d => d && freshDraft(d.route, ester));
    const patch = (p: Partial<PlanDraft>) => setDraft(d => d && { ...d, ...p });

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onCancel]);

    const scroller = useRef<HTMLDivElement>(null);
    useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [at]);

    // What has been answered so far, under the heading of the next question.
    const soFar = !draft || step === 'route' ? null
        : step === 'drug' ? t(`regimen.route.${draft.route}`)
        : step === 'dose' || !item ? supplyLabel(draft, t)
        : regimenLabel(item, t);

    const common = (draft && COMMON_FREQ[draft.route]) || [];
    const showAllFreq = allFreq || !draft || !common.includes(draft.freq);
    const isPatch = draft?.route === Route.patchApply;

    const heading = step === 'dose' && isPatch ? t('plan.q_rate') : t(`plan.q_${step}`);

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label={t('plan.add')}
            className="fixed inset-0 z-50 flex select-none flex-col bg-[var(--bg)] font-sans text-[var(--text)]"
        >
            <div className="flex shrink-0 justify-end px-4 pt-[calc(0.75rem+env(safe-area-inset-top,0px))]">
                <button
                    type="button"
                    onClick={onCancel}
                    className="rounded-lg px-2 py-1.5 text-[0.8125rem] text-muted hover:bg-[var(--surface-hover)]"
                >
                    {t('btn.cancel')}
                </button>
            </div>

            {/* Top-aligned, unlike the intro: these steps differ in height, and
                centring each one would move the heading from step to step. */}
            <div ref={scroller} className="flex flex-1 items-start overflow-y-auto scrollbar-hide px-6">
                <div
                    key={step}
                    className={`mx-auto w-full max-w-md pt-8 pb-8 lg:pt-[12vh] ${direction === 'backward' ? 'view-enter-backward' : 'view-enter-forward'}`}
                >
                    <h1 className="text-2xl font-semibold text-body">{heading}</h1>
                    {draft && soFar && (
                        <div className="mt-3 flex items-center gap-2.5">
                            <Doodle name={draft.route} size={1.75} />
                            <span className="text-sm leading-relaxed text-muted">{soFar}</span>
                        </div>
                    )}

                    {step === 'route' && (
                        <div className="mt-6">
                            {routes.map(r => {
                                const on = draft?.route === r;
                                const full = free(r).length === 0;
                                return (
                                    <Row
                                        key={r}
                                        on={on}
                                        onClick={() => pickRoute(r)}
                                        title={t(`regimen.route.${r}`)}
                                        note={full ? t('plan.in_plan') : undefined}
                                        mark={<Doodle name={r} asleep={full} />}
                                    />
                                );
                            })}
                        </div>
                    )}

                    {step === 'drug' && draft && (
                        <div className="mt-6">
                            {drugs.map(e => (
                                <Row
                                    key={e}
                                    on={draft.ester === e}
                                    onClick={() => pickDrug(e)}
                                    title={t(`ester.${e}`)}
                                    note={free(draft.route).includes(e) ? undefined : t('plan.in_plan')}
                                />
                            ))}
                        </div>
                    )}

                    {step === 'dose' && draft && (
                        <label className={`mt-8 flex items-baseline gap-3 pb-2 ${divider}`}>
                            <input
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="any"
                                value={draft.dose}
                                onChange={e => patch({ dose: e.target.value })}
                                onKeyDown={e => { if (e.key === 'Enter') forward(); }}
                                onFocus={e => e.currentTarget.select()}
                                aria-label={heading}
                                className="figure-input min-w-0 flex-1 bg-transparent text-4xl font-semibold tabular-nums text-body outline-none select-text"
                            />
                            <span className="shrink-0 text-base text-muted">{isPatch ? `µg${t('regimen.per_day')}` : 'mg'}</span>
                        </label>
                    )}

                    {step === 'site' && draft && (
                        <div className="mt-6">
                            {GEL_SITE_ORDER.map((site, i) => (
                                <Row
                                    key={site}
                                    on={draft.gelSite === i}
                                    onClick={() => patch({ gelSite: i })}
                                    title={gelSiteName(i, t)}
                                />
                            ))}
                        </div>
                    )}

                    {step === 'hold' && draft && (
                        <div className="mt-6">
                            {SL_TIER_ORDER.map((tier, i) => (
                                <Row
                                    key={tier}
                                    on={draft.slTier === i}
                                    onClick={() => patch({ slTier: i })}
                                    title={`${SublingualTierParams[tier].hold} min`}
                                    desc={t(`sl.tier.${tier}`)}
                                />
                            ))}
                        </div>
                    )}

                    {step === 'freq' && draft && (
                        <div className="mt-6">
                            {FREQUENCIES.filter(f => showAllFreq || common.includes(f.key)).map(f => (
                                <Row
                                    key={f.key}
                                    on={draft.freq === f.key}
                                    onClick={() => patch({ freq: f.key })}
                                    title={frequencyLabel(f, t)}
                                />
                            ))}
                            {!showAllFreq && (
                                <button type="button" onClick={() => setAllFreq(true)} className="w-full py-4 text-start text-[0.9375rem] text-muted">
                                    {t('plan.other_freq')}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="shrink-0 border-t border-[var(--border)] px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
                <div className="mx-auto grid w-full max-w-md grid-cols-[1fr_auto_1fr] items-center gap-4">
                    <div className="justify-self-start">
                        {at > 0 && (
                            <button type="button" onClick={() => go(at - 1)} className="btn-secondary">
                                {t('onboarding.back')}
                            </button>
                        )}
                    </div>

                    <DoseRings count={steps.length} at={at} />

                    <div className="justify-self-end">
                        <button type="button" onClick={forward} disabled={!ready} className="btn-primary">
                            {t(isLast ? 'plan.confirm_add' : 'onboarding.next')}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default PlanWizard;
