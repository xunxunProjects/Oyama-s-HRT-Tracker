import React, { useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { ExtraKey, GEL_SITE_ORDER, Route, SL_TIER_ORDER, SublingualTierParams } from '../../logic';
import PageHeader, { PAGE_COLUMN, headerAction, headerActionAccent } from '../components/PageHeader';
import CustomSelect from '../components/CustomSelect';
import Doodle from '../components/Doodle';
import PlanWizard from '../components/PlanWizard';
import CustomFrequencyFields from '../components/CustomFrequencyFields';
import { settingsSection } from '../components/SettingsListItem';
import { useTranslation } from '../contexts/LanguageContext';
import { useHRTMode } from '../contexts/HRTModeContext';
import { useDialog } from '../contexts/DialogContext';
import {
    CUSTOM_FREQ,
    PlanItem,
    PlanDraft,
    FREQUENCIES,
    PLAN_DRUGS,
    customFieldsFor,
    draftToItem,
    itemToDraft,
} from '../utils/plan';
import { inertWhen } from '../utils/inert';
import { regimenLabel, frequencyLabel, gelSiteName } from '../utils/regimenText';

const on = 'text-[var(--text)]';
const muted = 'text-[var(--text-muted)]';
// Fields as the selects beside them have them (CustomSelect): the label in
// body colour at medium weight, flush with the box, and the box .input-base,
// 44px and field-filled with a terracotta focus. A label of its own style
// and a 38px transparent box made the paired fields look unrelated.
const inputCls = 'input-base tabular-nums';
const labelCls = `block text-xs font-medium mb-1.5 ${on}`;

/** Amount, rhythm and, for a gel, where it goes; for a sublingual dose, how long it is held. */
const AmountFields: React.FC<{
    draft: PlanDraft;
    onChange: (patch: Partial<PlanDraft>) => void;
    t: (k: string) => string;
}> = ({ draft, onChange, t }) => (
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
            value={draft.freq}
            // Choosing either way seeds the custom fields from the rhythm on
            // screen, so "Custom…" never opens on a value left behind.
            onChange={key => {
                if (key === CUSTOM_FREQ && draft.freq === CUSTOM_FREQ) return;
                const preset = FREQUENCIES.find(f => f.key === (key === CUSTOM_FREQ ? draft.freq : key)) ?? {
                    everyDays: 1,
                    timesPerDay: 1,
                };
                onChange({ freq: key, ...customFieldsFor(preset) });
            }}
            options={[
                ...FREQUENCIES.map(f => ({ value: f.key, label: frequencyLabel(f, t) })),
                { value: CUSTOM_FREQ, label: t('plan.custom_freq') },
            ]}
        />
        {draft.freq === CUSTOM_FREQ && (
            <div className="col-span-2">
                <CustomFrequencyFields draft={draft} onChange={onChange} variant="fields" />
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

interface PlanProps {
    onBack: () => void;
    plan: PlanItem[];
    onSave: (item: PlanItem) => void;
    onDelete: (id: string) => void;
}

const Plan: React.FC<PlanProps> = ({ onBack, plan, onSave, onDelete }) => {
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

    return (
        <div className="relative pb-32">
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

            {adding && (
                <PlanWizard
                    plan={plan}
                    onAdd={item => {
                        onSave(item);
                        setAdding(false);
                        setCameInEmpty(false);
                    }}
                    // Backing out of the questions this page opened with goes back where they came from.
                    onCancel={() => (cameInEmpty ? onBack() : setAdding(false))}
                />
            )}

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
                                                {frequencyLabel(item, t)}
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
            </div>
        </div>
    );
};

export default Plan;
