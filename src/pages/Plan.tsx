import React, { useState } from 'react';
import { Calendar, ChevronDown, Download, Plus } from '../components/icons';
import { ExtraKey, GEL_SITE_ORDER, Route, SL_TIER_ORDER, SublingualTierParams } from '../../logic';
import PageHeader, { PAGE_COLUMN, headerAction, headerActionAccent } from '../components/PageHeader';
import CustomSelect from '../components/CustomSelect';
import Doodle from '../components/Doodle';
import PlanWizard from '../components/PlanWizard';
import { SettingsListItem, settingsSection } from '../components/SettingsListItem';
import { planToCalendar } from '../utils/planCalendar';
import type { DoseEvent } from '../../logic';
import { useTranslation } from '../contexts/LanguageContext';
import { useHRTMode } from '../contexts/HRTModeContext';
import { useDialog } from '../contexts/DialogContext';
import CustomRhythm from '../components/CustomRhythm';
import {
    PlanItem,
    PlanDraft,
    FREQUENCIES,
    PLAN_DRUGS,
    customSeed,
    draftToItem,
    isPresetFrequency,
    itemToDraft,
} from '../utils/plan';
import { asTitle, regimenLabel, frequencyLabel, gelSiteName } from '../utils/regimenText';
import { inertWhen } from '../utils/inert';

const on = 'text-[var(--text)]';
const muted = 'text-[var(--text-muted)]';
// Fields as the choices beside them have them (CustomSelect): the shared
// field label over a line, so the paired fields read as one form.
const inputCls = 'input-base tabular-nums';
const labelCls = 'field-label';

/** Amount, rhythm and, for a gel, where it goes; for a sublingual dose, how long it is held. */
const AmountFields: React.FC<{
    draft: PlanDraft;
    onChange: (patch: Partial<PlanDraft>) => void;
    t: (k: string) => string;
}> = ({ draft, onChange, t }) => {
    // A rhythm the list doesn't offer opens the typed-in fields, and so does
    // choosing "Another rhythm"; choosing one of the list closes them.
    const [custom, setCustom] = useState(() => !isPresetFrequency(draft.freq));
    return (
        <>
            <label className="block">
                <span className={labelCls}>
                    {draft.route === Route.patchApply ? t('field.patch_rate') : `${t('plan.dose')} (mg)`}
                </span>
                <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={draft.dose}
                    onChange={e => onChange({ dose: e.target.value })}
                    className={inputCls}
                    style={{ fontSize: '16px' }}
                />
            </label>
            <CustomSelect
                label={t('plan.freq')}
                value={custom ? 'custom' : draft.freq}
                onChange={freq => {
                    if (freq === 'custom') {
                        if (!custom) onChange({ freq: customSeed(draft.freq) });
                        setCustom(true);
                        return;
                    }
                    setCustom(false);
                    onChange({ freq });
                }}
                options={[
                    ...FREQUENCIES.map(f => ({ value: f.key, label: asTitle(frequencyLabel(f, t)) })),
                    { value: 'custom', label: t('plan.freq_custom') },
                ]}
            />
            {custom && (
                <div className="col-span-2 m-appear">
                    <CustomRhythm freq={draft.freq} onChange={freq => onChange({ freq })} t={t} />
                </div>
            )}
            {draft.route === Route.gel && (
                <div className="col-span-2">
                    <CustomSelect
                        label={t('field.gel_site')}
                        value={String(draft.gelSite)}
                        onChange={v => onChange({ gelSite: Number(v) })}
                        options={GEL_SITE_ORDER.map((_, i) => ({ value: String(i), label: gelSiteName(i, t) }))}
                    />
                </div>
            )}
            {draft.route === Route.sublingual && (
                <div className="col-span-2">
                    <CustomSelect
                        label={t('field.sl_absorption')}
                        value={String(draft.slTier)}
                        onChange={v => onChange({ slTier: Number(v) })}
                        options={SL_TIER_ORDER.map((tier, i) => ({
                            value: String(i),
                            label: t(`sl.tier.${tier}`),
                            description: `${SublingualTierParams[tier].hold} min`,
                        }))}
                    />
                </div>
            )}
        </>
    );
};

interface PlanProps {
    onBack: () => void;
    plan: PlanItem[];
    onSave: (item: PlanItem) => void;
    onDelete: (id: string) => void;
    /** The log, for the time of day each drug is usually taken at. */
    events: DoseEvent[];
}

const Plan: React.FC<PlanProps> = ({ onBack, plan, onSave, onDelete, events }) => {
    const { t } = useTranslation();
    const { mode } = useHRTMode();
    const { showDialog } = useDialog();

    // Nothing left to add once every drug of every route is in the plan.
    const canAdd = (Object.keys(PLAN_DRUGS[mode]) as Route[]).some(r =>
        (PLAN_DRUGS[mode][r] ?? []).some(e => !plan.some(i => i.route === r && i.ester === e)),
    );

    // An empty plan opens straight into the questions: there is nothing else here to look at yet.
    const [adding, setAdding] = useState(plan.length === 0);
    const [cameInEmpty, setCameInEmpty] = useState(plan.length === 0);
    const [openId, setOpenId] = useState<string | null>(null);
    const [edit, setEdit] = useState<PlanDraft | null>(null);

    const openRow = (item: PlanItem) => {
        if (openId === item.id) {
            setOpenId(null);
            return;
        }
        setOpenId(item.id);
        setEdit(itemToDraft(item));
    };
    const saveEdit = (item: PlanItem) => {
        const next = edit && draftToItem(edit, item.id);
        if (!next) return;
        onSave(next);
        setOpenId(null);
    };

    // The plan as reminders in the phone's own calendar (utils/planCalendar.ts):
    // made here, saved as a file, and opened by the calendar app.
    const saveToCalendar = () => {
        const ics = planToCalendar(plan, events, {
            title: item => regimenLabel(item, t),
            note: t('plan.calendar_note'),
        });
        const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'oyama-plan.ics';
        link.click();
        URL.revokeObjectURL(url);
        showDialog('alert', t('plan.calendar_done'));
    };

    // Backing out of the questions this page opened with goes back where they came from.
    const cancelAdding = () => (cameInEmpty ? onBack() : setAdding(false));

    // Adding is this page's content while it runs: the questions, under a
    // title whose back arrow backs out of them.
    if (adding) {
        return (
            <div className="relative flex flex-1 flex-col">
                <PageHeader onBack={cancelAdding} title={t('plan.add')} />
                <PlanWizard
                    plan={plan}
                    onAdd={item => {
                        onSave(item);
                        setAdding(false);
                        setCameInEmpty(false);
                    }}
                    onCancel={cancelAdding}
                />
            </div>
        );
    }

    return (
        <div className="relative md:pb-32">
            <PageHeader
                onBack={onBack}
                title={t('plan.title')}
                actions={
                    canAdd && (
                        <button type="button" onClick={() => setAdding(true)} className={`${headerActionAccent}`}>
                            <Plus size={15} />
                            <span>{t('plan.add')}</span>
                        </button>
                    )
                }
            />

            <div className={`${PAGE_COLUMN} mt-3`}>
                {plan.length === 0 ? (
                    <p className={`text-sm ${muted}`}>{t('plan.empty')}</p>
                ) : (
                    <div className={settingsSection}>
                        {plan.map(item => {
                            const open = openId === item.id;
                            return (
                                <div key={item.id}>
                                    <button
                                        type="button"
                                        onClick={() => openRow(item)}
                                        aria-expanded={open}
                                        className="w-full flex items-center gap-3.5 py-4 text-start"
                                    >
                                        <Doodle name={item.route} />
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm font-medium ${on}`}>{regimenLabel(item, t)}</p>
                                            <p className={`text-xs mt-0.5 leading-relaxed ${muted}`}>
                                                {asTitle(frequencyLabel(item, t))}
                                                {item.route === Route.gel &&
                                                    `, ${gelSiteName(item.extras[ExtraKey.gelSite] ?? 0, t)}`}
                                            </p>
                                        </div>
                                        <ChevronDown
                                            size={16}
                                            className={`chev ${muted} shrink-0 ${open ? 'rotate-180' : ''}`}
                                        />
                                    </button>
                                    <div className="disclosure" data-open={open} {...inertWhen(!open)}>
                                        <div className="disclosure-inner">
                                            <div className="pb-3 space-y-3">
                                                {open && edit && (
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <AmountFields
                                                            draft={edit}
                                                            onChange={patch =>
                                                                setEdit(d => (d ? { ...d, ...patch } : d))
                                                            }
                                                            t={t}
                                                        />
                                                    </div>
                                                )}
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            showDialog(
                                                                'confirm',
                                                                t('plan.delete_confirm'),
                                                                () => onDelete(item.id),
                                                                {
                                                                    danger: true,
                                                                    title: regimenLabel(item, t),
                                                                    confirmLabel: t('btn.delete'),
                                                                },
                                                            )
                                                        }
                                                        className={`${headerAction} text-[var(--danger)]`}
                                                    >
                                                        {t('btn.delete')}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={!edit || !draftToItem(edit, item.id)}
                                                        onClick={() => saveEdit(item)}
                                                        className={`${headerActionAccent} disabled:opacity-40`}
                                                    >
                                                        {t('btn.save')}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {plan.length > 0 && (
                    <div className={`${settingsSection} mt-8`}>
                        <SettingsListItem
                            icon={Calendar}
                            title={t('plan.calendar_title')}
                            description={t('plan.calendar_desc')}
                            onClick={saveToCalendar}
                            showChevron={false}
                            trailing={<Download size={18} className={`${muted} shrink-0`} />}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default Plan;
