import React, { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ChevronDown, Plus } from 'lucide-react';
import { DoseEvent, Ester, Route } from '../../logic';
import PageHeader, { PAGE_COLUMN, headerAction } from '../components/PageHeader';
import CustomSelect from '../components/CustomSelect';
import Tabs from '../components/Tabs';
import { settingsSection } from '../components/SettingsListItem';
import { useTranslation } from '../contexts/LanguageContext';
import { useHRTMode } from '../contexts/HRTModeContext';
import { useDialog } from '../contexts/DialogContext';
import { Regimen, Supply, Pack, PackKind, supplyStatus, packKindsFor, defaultPack, packUnitMG } from '../utils/regimen';
import { supplyLabel, intervalLabel, dueLabel, fill, fillNodes, remainingLabel, packUnit } from '../utils/regimenText';

const on = 'text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]';
const muted = 'text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]';
const inputCls = 'rounded-md border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] bg-transparent px-3 py-2 text-sm tabular-nums text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] outline-none focus:border-[var(--color-m3-outline)] dark:focus:border-[var(--color-m3-dark-outline)]';
const labelCls = `block text-xs font-semibold mb-1.5 pl-1 ${muted}`;
// The same pair the lab form closes with.
const cancelBtn = 'min-w-[88px] px-4 py-2 text-sm text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)] rounded-md';
const confirmBtn = 'min-w-[88px] px-4 py-2 text-sm font-medium bg-[var(--color-m3-primary)] text-white rounded-md disabled:opacity-40 disabled:cursor-not-allowed';
const inertWhen = (closed: boolean) => (closed ? ({ inert: '' } as Record<string, unknown>) : {});

/** Everything that can be stocked, per mode: the forms the dose form can log. */
const STOCKABLE: Record<'transfem' | 'transmasc', [Route, Ester][]> = {
    transfem: [
        [Route.injection, Ester.EV], [Route.injection, Ester.EB], [Route.injection, Ester.EC], [Route.injection, Ester.EN], [Route.injection, Ester.EU],
        [Route.oral, Ester.EV], [Route.oral, Ester.E2], [Route.oral, Ester.CPA],
        [Route.sublingual, Ester.E2], [Route.gel, Ester.E2], [Route.patchApply, Ester.E2],
    ],
    transmasc: [
        [Route.injection, Ester.TC], [Route.injection, Ester.TE], [Route.injection, Ester.TU],
        [Route.gel, Ester.T], [Route.patchApply, Ester.T],
    ],
};
const LEAD_DAYS = [7, 14, 30] as const;

interface SuppliesProps {
    onBack: () => void;
    supplies: Supply[];
    onSave: (s: Supply) => void;
    onDelete: (id: string) => void;
    events: DoseEvent[];
    regimens: Regimen[];
    nowH: number;
    leadDays: number;
    onLeadDaysChange: (d: number) => void;
}

const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? n : NaN; };
const trim = (n: number) => String(Number(n.toFixed(2)));

/** What one unit of the pack holds. A vial needs two numbers, a pill one, a patch or plain mg none. */
const PackFields: React.FC<{ pack: Pack; onChange: (p: Pack) => void; t: (k: string) => string }> = ({ pack, onChange, t }) => {
    const field = (label: string, value: number, set: (n: number) => void, className = '') => (
        <label className={`block ${className}`}>
            <span className={labelCls}>{label}</span>
            <input type="number" inputMode="decimal" min="0" step="any" value={value} onChange={e => set(num(e.target.value))} className={`${inputCls} w-full`} style={{ fontSize: '16px' }} />
        </label>
    );
    if (pack.kind === 'vial') return (
        <>
            {field(t('supplies.vial_ml'), pack.ml, ml => onChange({ ...pack, ml }))}
            {field(t('supplies.mg_per_ml'), pack.mgPerMl, mgPerMl => onChange({ ...pack, mgPerMl }))}
        </>
    );
    if (pack.kind === 'pill' || pack.kind === 'pump' || pack.kind === 'sachet') {
        // English units are plural for counts ("24 pills"); the label wants one.
        return field(fill(t('supplies.mg_each'), { unit: packUnit(pack, t).replace(/s$/, '') }), pack.mg, mg => onChange({ ...pack, mg }), 'col-span-2');
    }
    return null;
};

const Supplies: React.FC<SuppliesProps> = ({ onBack, supplies, onSave, onDelete, events, regimens, nowH, leadDays, onLeadDaysChange }) => {
    const { t, lang } = useTranslation();
    const { mode } = useHRTMode();
    const { showDialog } = useDialog();

    // Whatever is in use now first, then everything else that can be logged.
    const options = useMemo(() => {
        const seen = new Set<string>();
        const out: { value: string; label: string; description?: string }[] = [];
        const add = (route: Route, ester: Ester, description?: string) => {
            const value = `${route}|${ester}`;
            if (seen.has(value)) return;
            seen.add(value);
            out.push({ value, label: supplyLabel({ route, ester }, t), description });
        };
        regimens.forEach(r => add(r.route, r.ester, intervalLabel(r.intervalH, t)));
        STOCKABLE[mode].forEach(([r, e]) => add(r, e));
        return out;
    }, [regimens, mode, t]);

    const [adding, setAdding] = useState(false);
    const [pick, setPick] = useState(() => options[0]?.value ?? '');
    const [pickRoute, pickEster] = pick.split('|') as [Route, Ester];
    const [pack, setPack] = useState<Pack>(() => defaultPack(packKindsFor(pickRoute)[0]));
    const [count, setCount] = useState('');
    const [openId, setOpenId] = useState<string | null>(null);
    const [recount, setRecount] = useState('');
    const [recountMg, setRecountMg] = useState('');

    const choose = (value: string) => {
        setPick(value);
        const route = value.split('|')[0] as Route;
        if (!packKindsFor(route).includes(pack.kind)) setPack(defaultPack(packKindsFor(route)[0]));
    };
    const packValid = (p: Pack) => p.kind === 'patch' || p.kind === 'bulk' || packUnitMG(p) > 0;
    const countNum = num(count);
    const canAdd = !!pick && countNum > 0 && packValid(pack);
    const add = () => {
        if (!canAdd) return;
        onSave({ id: uuidv4(), route: pickRoute, ester: pickEster, pack, count: countNum, startedAt: Date.now() });
        setCount('');
        setAdding(false);
    };

    const statuses = supplies.map(s => supplyStatus(s, events, regimens, nowH));
    const packOptions = packKindsFor(pickRoute).map(k => ({ value: k, label: t(`supplies.pack.${k}`) }));

    const openRow = (s: Supply, remaining: number) => {
        if (openId === s.id) { setOpenId(null); return; }
        setOpenId(s.id);
        const unit = packUnitMG(s.pack);
        if (s.pack.kind === 'vial') {
            const whole = Math.floor(remaining / unit + 1e-9);
            setRecount(String(whole));
            setRecountMg(trim(remaining - whole * unit));
        } else {
            setRecount(trim(remaining / unit));
            setRecountMg('');
        }
    };
    const applyRecount = (s: Supply) => {
        const whole = num(recount);
        if (!(whole >= 0)) return;
        const extra = s.pack.kind === 'vial' ? (num(recountMg) || 0) / packUnitMG(s.pack) : 0;
        onSave({ ...s, count: whole + extra, startedAt: Date.now() });
        setOpenId(null);
    };

    return (
        <div className="relative pb-32">
            <PageHeader
                onBack={onBack}
                title={t('supplies.title')}
                actions={
                    <button
                        type="button"
                        onClick={() => setAdding(v => !v)}
                        className={`${headerAction} text-[var(--color-m3-primary)] dark:text-[var(--color-m3-primary-light)]`}
                    >
                        <Plus size={15} className={adding ? 'rotate-45' : ''} />
                        <span>{adding ? t('btn.cancel') : t('supplies.add')}</span>
                    </button>
                }
            />

            {/* The add form drops down from the title bar, the way the lab page's does. */}
            <div className="disclosure" data-open={adding} {...inertWhen(!adding)}>
                <div className="disclosure-inner">
                    <div className={`${PAGE_COLUMN} mt-3 mb-6`}>
                        {/* What, how it comes, what one holds, how many: the count last, on a row of its own. */}
                        <div className="grid grid-cols-2 gap-3">
                            <CustomSelect label={t('supplies.drug')} value={pick} onChange={choose} options={options} />
                            <CustomSelect label={t('supplies.pack')} value={pack.kind} onChange={k => setPack(defaultPack(k as PackKind))} options={packOptions} />
                            <PackFields pack={pack} onChange={setPack} t={t} />
                            <label className="block col-span-2">
                                <span className={labelCls}>{t('supplies.amount')} ({packUnit(pack, t)})</span>
                                <input
                                    type="number" inputMode="decimal" min="0" step="any"
                                    value={count}
                                    onChange={e => setCount(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') add(); }}
                                    className={`${inputCls} w-full`}
                                    style={{ fontSize: '16px' }}
                                />
                            </label>
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                            <button type="button" onClick={() => setAdding(false)} className={cancelBtn}>{t('btn.cancel')}</button>
                            <button type="button" onClick={add} disabled={!canAdd} className={confirmBtn}>{t('supplies.confirm_add')}</button>
                        </div>
                    </div>
                </div>
            </div>

            <div className={`${PAGE_COLUMN} mt-3 space-y-8`}>
                {statuses.length === 0 ? (
                    <p className={`text-sm ${muted}`}>{t('supplies.empty_list')}</p>
                ) : (
                    <div className={settingsSection}>
                        {statuses.map(({ supply, remaining, runOutH, dailyUse }) => {
                            const open = openId === supply.id;
                            const low = dailyUse !== null && (remaining <= 0 || (runOutH !== null && runOutH - nowH < leadDays * 24));
                            return (
                                <div key={supply.id}>
                                    <button
                                        type="button"
                                        onClick={() => openRow(supply, remaining)}
                                        aria-expanded={open}
                                        className="w-full flex items-center gap-3 py-4 text-start"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm font-medium ${on}`}>{supplyLabel(supply, t)}</p>
                                            <p className={`text-xs mt-0.5 leading-relaxed ${low ? 'text-amber-600 dark:text-amber-400' : muted}`}>
                                                {dailyUse === null || runOutH === null
                                                    ? t('supplies.not_in_use')
                                                    : fillNodes(t('supplies.runs_out'), { n: Math.max(0, Math.round((runOutH - nowH) / 24)), date: <span className="whitespace-nowrap">{dueLabel(runOutH, lang, false, nowH)}</span> })}
                                            </p>
                                        </div>
                                        <span className={`text-sm tabular-nums shrink-0 ${on}`}>{fill(t('supplies.left'), { n: remainingLabel(supply, remaining, t) })}</span>
                                        <ChevronDown size={16} className={`chev ${muted} shrink-0 ${open ? 'rotate-180' : ''}`} />
                                    </button>
                                    {/* `inert` keeps a collapsed row's inputs out of the tab order; the disclosure only hides them visually. */}
                                    <div className="disclosure" data-open={open} {...inertWhen(!open)}>
                                        <div className="disclosure-inner">
                                            <div className="pb-3 space-y-3">
                                                <p className={`text-xs ${muted}`}>{t('supplies.left_now')}</p>
                                                <div className="flex flex-wrap items-end gap-3">
                                                    <label className="block">
                                                        <span className={labelCls}>{packUnit(supply.pack, t)}</span>
                                                        <input type="number" inputMode="decimal" min="0" step="any" value={recount} onChange={e => setRecount(e.target.value)} className={`${inputCls} w-24`} style={{ fontSize: '16px' }} />
                                                    </label>
                                                    {supply.pack.kind === 'vial' && (
                                                        <label className="block">
                                                            <span className={labelCls}>{t('supplies.opened_mg')}</span>
                                                            <input type="number" inputMode="decimal" min="0" step="any" value={recountMg} onChange={e => setRecountMg(e.target.value)} className={`${inputCls} w-24`} style={{ fontSize: '16px' }} />
                                                        </label>
                                                    )}
                                                </div>
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => showDialog('confirm', t('supplies.delete_confirm'), () => onDelete(supply.id), { danger: true })}
                                                        className={`${headerAction} text-red-600 dark:text-red-400`}
                                                    >
                                                        {t('btn.delete')}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={!(num(recount) >= 0)}
                                                        onClick={() => applyRecount(supply)}
                                                        className={`${headerAction} text-[var(--color-m3-primary)] dark:text-[var(--color-m3-primary-light)] disabled:opacity-40`}
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

                <section className="flex items-center justify-between gap-4">
                    <p className={`text-[0.9375rem] ${on}`}>{t('supplies.lead')}</p>
                    <Tabs
                        compact
                        tabs={LEAD_DAYS.map(d => ({ id: String(d), label: fill(t('supplies.days'), { n: d }) }))}
                        value={String(LEAD_DAYS.includes(leadDays as typeof LEAD_DAYS[number]) ? leadDays : 14)}
                        onChange={v => onLeadDaysChange(Number(v))}
                    />
                </section>
            </div>
        </div>
    );
};

export default Supplies;
