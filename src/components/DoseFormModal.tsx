import React, { useState, useEffect, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from '../contexts/LanguageContext';
import { useDialog } from '../contexts/DialogContext';
import CustomSelect from './CustomSelect';
import { getRouteIcon } from '../utils/helpers';
import { Route, Ester, ExtraKey, DoseEvent, SL_TIER_ORDER, SublingualTierParams, getBioavailabilityMultiplier, getToE2Factor } from '../../logic';
import { Calendar, X, Clock, Info, Save, Trash2 } from 'lucide-react';

type DoseLevelKey = 'low' | 'medium' | 'high' | 'very_high' | 'above';

type DoseGuideConfig = {
    unitKey: 'mg_day' | 'ug_day' | 'mg_week';
    thresholds: [number, number, number, number];
    requiresRate?: boolean;
};

const DOSE_GUIDE_CONFIG: Partial<Record<Route, DoseGuideConfig>> = {
    [Route.oral]: { unitKey: 'mg_day', thresholds: [2, 4, 8, 12] },
    [Route.sublingual]: { unitKey: 'mg_day', thresholds: [1, 2, 4, 6] },
    [Route.patchApply]: { unitKey: 'ug_day', thresholds: [100, 200, 400, 600], requiresRate: true },
    [Route.gel]: { unitKey: 'mg_day', thresholds: [1.5, 3, 6, 9] },
    [Route.injection]: { unitKey: 'mg_week', thresholds: [1, 2, 4, 6] },
};

const LEVEL_BADGE_STYLES: Record<DoseLevelKey, string> = {
    low: 'bg-emerald-100 text-emerald-800',
    medium: 'bg-sky-100 text-sky-800',
    high: 'bg-amber-100 text-amber-800',
    very_high: 'bg-rose-100 text-rose-800',
    above: 'bg-red-100 text-red-800'
};

const LEVEL_CONTAINER_STYLES: Record<DoseLevelKey | 'neutral', string> = {
    low: 'bg-emerald-50 border-emerald-100',
    medium: 'bg-sky-50 border-sky-100',
    high: 'bg-amber-50 border-amber-100',
    very_high: 'bg-rose-50 border-rose-100',
    above: 'bg-red-50 border-red-100',
    neutral: 'bg-gray-50 border-gray-200'
};

const formatGuideNumber = (val: number) => {
    if (Number.isInteger(val)) return val.toString();
    const rounded = val < 1 ? val.toFixed(2) : val.toFixed(1);
    return rounded.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
};

const SL_POINTS = SL_TIER_ORDER
    .map((k, idx) => ({ idx, key: k, hold: SublingualTierParams[k].hold, theta: SublingualTierParams[k].theta }))
    .sort((a, b) => a.hold - b.hold);

const thetaFromHold = (holdMin: number): number => {
    if (holdMin <= 0) return 0;
    if (SL_POINTS.length === 0) return 0.11;
    const h = Math.max(1, holdMin);
    // Linear interpolation with endpoint extrapolation
    for (let i = 0; i < SL_POINTS.length - 1; i++) {
        const p1 = SL_POINTS[i];
        const p2 = SL_POINTS[i + 1];
        if (h >= p1.hold && h <= p2.hold) {
            const t = (h - p1.hold) / (p2.hold - p1.hold || 1);
            return Math.min(1, Math.max(0, p1.theta + (p2.theta - p1.theta) * t));
        }
    }
    // Extrapolate below first or above last segment
    if (h < SL_POINTS[0].hold) {
        const p1 = SL_POINTS[0];
        const p2 = SL_POINTS[1];
        const slope = (p2.theta - p1.theta) / (p2.hold - p1.hold || 1);
        return Math.min(1, Math.max(0, p1.theta + (h - p1.hold) * slope));
    }
    const pLast = SL_POINTS[SL_POINTS.length - 1];
    const pPrev = SL_POINTS[SL_POINTS.length - 2];
    const slope = (pLast.theta - pPrev.theta) / (pLast.hold - pPrev.hold || 1);
    return Math.min(1, Math.max(0, pLast.theta + (h - pLast.hold) * slope));
};

const holdFromTheta = (thetaVal: number): number => {
    if (SL_POINTS.length === 0) return 10;
    const th = thetaVal;
    for (let i = 0; i < SL_POINTS.length - 1; i++) {
        const p1 = SL_POINTS[i];
        const p2 = SL_POINTS[i + 1];
        const minTh = Math.min(p1.theta, p2.theta);
        const maxTh = Math.max(p1.theta, p2.theta);
        if (th >= minTh && th <= maxTh) {
            const t = (th - p1.theta) / (p2.theta - p1.theta || 1);
            return p1.hold + (p2.hold - p1.hold) * t;
        }
    }
    // Extrapolate
    if (th < SL_POINTS[0].theta) {
        const p1 = SL_POINTS[0];
        const p2 = SL_POINTS[1];
        const slope = (p2.hold - p1.hold) / (p2.theta - p1.theta || 1);
        return Math.max(1, p1.hold + (th - p1.theta) * slope);
    }
    const pLast = SL_POINTS[SL_POINTS.length - 1];
    const pPrev = SL_POINTS[SL_POINTS.length - 2];
    const slope = (pLast.hold - pPrev.hold) / (pLast.theta - pPrev.theta || 1);
    return Math.max(1, pLast.hold + (th - pLast.theta) * slope);
};

const DoseFormModal = ({ isOpen, onClose, eventToEdit, onSave, onDelete }: any) => {
    const { t } = useTranslation();
    const { showDialog } = useDialog();
    const dateInputRef = useRef<HTMLInputElement>(null);
    
    // Form State
    const [dateStr, setDateStr] = useState("");
    const [route, setRoute] = useState<Route>(Route.injection);
    const [ester, setEster] = useState<Ester>(Ester.EV);
    
    const [rawDose, setRawDose] = useState("");
    const [e2Dose, setE2Dose] = useState("");
    
    const [patchMode, setPatchMode] = useState<"dose" | "rate">("dose");
    const [patchRate, setPatchRate] = useState("");

    const [gelSite, setGelSite] = useState(0); // Index in GEL_SITE_ORDER

    const [slTier, setSlTier] = useState(2);
    const [useCustomTheta, setUseCustomTheta] = useState(false);
    const [customHoldInput, setCustomHoldInput] = useState<string>("10");
    const [customHoldValue, setCustomHoldValue] = useState<number>(10);
    const [lastEditedField, setLastEditedField] = useState<'raw' | 'bio'>('bio');

    const slExtras = useMemo(() => {
        if (route !== Route.sublingual) return null;
        if (useCustomTheta) {
            const theta = thetaFromHold(customHoldValue);
            return { [ExtraKey.sublingualTheta]: theta };
        }
        return { [ExtraKey.sublingualTier]: slTier };
    }, [route, useCustomTheta, customHoldValue, slTier]);

    const bioMultiplier = useMemo(() => {
        const extrasForCalc = slExtras ?? {};
        if (route === Route.gel) {
            extrasForCalc[ExtraKey.gelSite] = gelSite;
        }
        return getBioavailabilityMultiplier(route, ester, extrasForCalc);
    }, [route, ester, slExtras, gelSite]);

    useEffect(() => {
        if (isOpen) {
            if (eventToEdit) {
                const d = new Date(eventToEdit.timeH * 3600000);
                const iso = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
                setDateStr(iso);
                setRoute(eventToEdit.route);
                setEster(eventToEdit.ester);
                
                if (eventToEdit.route === Route.patchApply && eventToEdit.extras[ExtraKey.releaseRateUGPerDay]) {
                    setPatchMode("rate");
                    setPatchRate(eventToEdit.extras[ExtraKey.releaseRateUGPerDay].toString());
                    setE2Dose("");
                    setRawDose("");
                    setLastEditedField('bio');
                } else {
                    setPatchMode("dose");
                    // Fix: Show E2 Equivalent (MW only), not Bioavailable dose
                    const factor = getToE2Factor(eventToEdit.ester);
                    const e2Val = eventToEdit.doseMG * factor;
                    setE2Dose(e2Val.toFixed(3));

                    if (eventToEdit.ester !== Ester.E2) {
                        setRawDose(eventToEdit.doseMG.toFixed(3));
                        setLastEditedField('raw');
                    } else {
                        setRawDose(eventToEdit.doseMG.toFixed(3));
                        setLastEditedField('bio');
                    }
                }

                if (eventToEdit.route === Route.sublingual) {
                    if (eventToEdit.extras[ExtraKey.sublingualTier] !== undefined) {
                         setSlTier(eventToEdit.extras[ExtraKey.sublingualTier]);
                         setUseCustomTheta(false);
                         const tierKey = SL_TIER_ORDER[eventToEdit.extras[ExtraKey.sublingualTier]] || 'standard';
                         const hold = SublingualTierParams[tierKey]?.hold ?? 10;
                         setCustomHoldValue(hold);
                         setCustomHoldInput(hold.toString());
                    } else if (eventToEdit.extras[ExtraKey.sublingualTheta] !== undefined) {
                        const thetaVal = eventToEdit.extras[ExtraKey.sublingualTheta];
                        setUseCustomTheta(true);
                        const hold = holdFromTheta(typeof thetaVal === 'number' ? thetaVal : 0.11);
                        setCustomHoldValue(hold);
                        setCustomHoldInput(hold.toString());
                    } else {
                        setUseCustomTheta(false);
                        setCustomHoldValue(10);
                        setCustomHoldInput("10");
                    }
                } else {
                    setUseCustomTheta(false);
                    setCustomHoldValue(10);
                    setCustomHoldInput("10");
                }

                if (eventToEdit.route === Route.gel) {
                    setGelSite(eventToEdit.extras[ExtraKey.gelSite] ?? 0);
                } else {
                    setGelSite(0);
                }

            } else {
                const now = new Date();
                const iso = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
                setDateStr(iso);
                setRoute(Route.injection);
                setEster(Ester.EV);
                setRawDose("");
                setE2Dose("");
                setPatchMode("dose");
                setPatchRate("");
                setSlTier(2);
                setGelSite(0);
                setUseCustomTheta(false);
                setCustomHoldValue(10);
                setCustomHoldInput("10");
                setLastEditedField('bio');
            }
        }
    }, [isOpen, eventToEdit]);

    const handleRawChange = (val: string) => {
        setRawDose(val);
        setLastEditedField('raw');
        const v = parseFloat(val);
        if (!isNaN(v)) {
            const factor = getToE2Factor(ester) || 1;
            const e2Equivalent = v * factor; // convert compound mg -> E2 equivalent (pre-bio)
            setE2Dose(e2Equivalent.toFixed(3));
        } else {
            setE2Dose("");
        }
    };

    const handleE2Change = (val: string) => {
        setE2Dose(val);
        setLastEditedField('bio');
        const v = parseFloat(val);
        if (!isNaN(v)) {
            const factor = getToE2Factor(ester) || 1;
            if (ester === Ester.E2) {
                setRawDose(v.toFixed(3));
            } else {
                setRawDose((v / factor).toFixed(3));
            }
        } else {
            setRawDose("");
        }
    };

    useEffect(() => {
        if (lastEditedField === 'raw' && rawDose) {
            handleRawChange(rawDose);
        }
    }, [bioMultiplier, ester, route]);

    useEffect(() => {
        if (lastEditedField === 'bio' && e2Dose) {
            handleE2Change(e2Dose);
        }
    }, [bioMultiplier, ester, route]);

    const [isSaving, setIsSaving] = useState(false);

    const handleSave = () => {
        if (isSaving) return;
        setIsSaving(true);
        let timeH = new Date(dateStr).getTime() / 3600000;
        if (isNaN(timeH)) {
            timeH = new Date().getTime() / 3600000;
        }
        
        let e2Equivalent = parseFloat(e2Dose);
        if (isNaN(e2Equivalent)) e2Equivalent = 0;
        // For EV injection/sublingual/oral, derive E2-equivalent from raw dose (hidden field) to avoid drift
        if (ester === Ester.EV && (route === Route.injection || route === Route.sublingual || route === Route.oral)) {
            const rawVal = parseFloat(rawDose);
            if (Number.isFinite(rawVal)) {
                const factor = getToE2Factor(ester) || 1;
                e2Equivalent = rawVal * factor;
            }
        }
        let finalDose = 0;

        const extras: any = {};
        const nonPositiveMsg = t('error.nonPositive');

        // Validate sublingual custom hold time
        if (route === Route.sublingual && useCustomTheta) {
            if (!Number.isFinite(customHoldValue) || customHoldValue < 1) {
                showDialog('alert', t('error.slHoldMinOne'));
                setIsSaving(false);
                return;
            }
        }

        if (route === Route.patchApply && patchMode === "rate") {
            const rateVal = parseFloat(patchRate);
            if (!Number.isFinite(rateVal) || rateVal <= 0) {
                showDialog('alert', nonPositiveMsg);
                setIsSaving(false);
                return;
            }
            finalDose = 0;
            extras[ExtraKey.releaseRateUGPerDay] = rateVal;
        } else if (route === Route.patchApply && patchMode === "dose") {
            const raw = parseFloat(rawDose);
            if (!Number.isFinite(raw) || raw <= 0) {
                showDialog('alert', nonPositiveMsg);
                setIsSaving(false);
                return;
            }
            finalDose = raw; // patch input is compound dose on patch
        } else if (route !== Route.patchRemove) {
            if (!Number.isFinite(e2Equivalent) || e2Equivalent <= 0) {
                showDialog('alert', nonPositiveMsg);
                setIsSaving(false);
                return;
            }
            const factor = getToE2Factor(ester) || 1;
            finalDose = (ester === Ester.E2) ? e2Equivalent : e2Equivalent / factor; // store compound mg
        }

        if (route === Route.sublingual && slExtras) {
            Object.assign(extras, slExtras);
        }

        if (route === Route.gel) {
            extras[ExtraKey.gelSite] = gelSite;
        }

        const newEvent: DoseEvent = {
            id: eventToEdit?.id || uuidv4(),
            route,
            ester: (route === Route.patchRemove || route === Route.patchApply || route === Route.gel) ? Ester.E2 : ester,
            timeH,
            doseMG: finalDose,
            extras
        };

        onSave(newEvent);
        setIsSaving(false);
        onClose();
    };

    // Calculate availableEsters unconditionally
    const availableEsters = useMemo(() => {
    switch (route) {
        case Route.injection: 
            return [Ester.EB, Ester.EV, Ester.EC, Ester.EN];
        
        // === 修改开始 ===
        // 把 Oral (口服) 单独提出来，加上 Ester.CPA
        case Route.oral: 
            return [Ester.E2, Ester.EV, Ester.CPA]; 

        // 舌下含服保持原样 (CPA 一般不含服)
        case Route.sublingual: 
            return [Ester.E2, Ester.EV];
        // === 修改结束 ===

        default: 
            return [Ester.E2];
    }
}, [route]);

    // Ensure ester is valid when route changes (e.g. switching from Injection to Gel should force E2)
    useEffect(() => {
        if (!availableEsters.includes(ester)) {
            setEster(availableEsters[0]);
        }
    }, [availableEsters, ester]);

    const doseGuide = useMemo(() => {
        // CPA 没有剂量提示，因为参考范围不同
        if (ester === Ester.CPA) return null;

        const cfg = DOSE_GUIDE_CONFIG[route];
        if (!cfg) return null;
        if (route === Route.patchApply && patchMode === "dose" && cfg.requiresRate) {
            return { config: cfg, level: null, value: null, showRateHint: true as const };
        }
        const rawVal = route === Route.patchApply ? parseFloat(patchRate) : parseFloat(e2Dose);
        const value = Number.isFinite(rawVal) && rawVal > 0 ? rawVal : null;

        let level: DoseLevelKey | null = null;
        if (value !== null) {
            const [low, medium, high, veryHigh] = cfg.thresholds;
            if (value <= low) level = 'low';
            else if (value <= medium) level = 'medium';
            else if (value <= high) level = 'high';
            else if (value <= veryHigh) level = 'very_high';
            else level = 'above';
        }

        return { config: cfg, level, value, showRateHint: false as const };
    }, [route, patchMode, patchRate, e2Dose, ester]);

    if (!isOpen) return null;

    const tierKey = SL_TIER_ORDER[slTier] || "standard";
    const currentTheta = SublingualTierParams[tierKey]?.theta || 0.11;

    const customTheta = thetaFromHold(customHoldValue);

    const guideUnitLabel = doseGuide?.config ? t(`dose.guide.unit.${doseGuide.config.unitKey}`) : "";
    const guideRangeText = doseGuide?.config
        ? [
            `${t('dose.guide.level.low')} ≤ ${formatGuideNumber(doseGuide.config.thresholds[0])} ${guideUnitLabel}`,
            `${t('dose.guide.level.medium')} ≤ ${formatGuideNumber(doseGuide.config.thresholds[1])} ${guideUnitLabel}`,
            `${t('dose.guide.level.high')} ≤ ${formatGuideNumber(doseGuide.config.thresholds[2])} ${guideUnitLabel}`,
            `${t('dose.guide.level.very_high')} ≤ ${formatGuideNumber(doseGuide.config.thresholds[3])} ${guideUnitLabel}`,
        ].join(' · ')
        : "";
    const guideContainerClass = doseGuide
        ? (
            doseGuide.level
                ? LEVEL_CONTAINER_STYLES[doseGuide.level]
                : (doseGuide.showRateHint ? LEVEL_CONTAINER_STYLES.high : LEVEL_CONTAINER_STYLES.neutral)
        )
        : LEVEL_CONTAINER_STYLES.neutral;
    const guideBadgeClass = doseGuide?.level ? LEVEL_BADGE_STYLES[doseGuide.level] : "";

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-50 animate-in fade-in duration-200">
            <div className="bg-white rounded-t-3xl md:rounded-3xl shadow-md shadow-gray-900/10 w-full max-w-lg md:max-w-2xl h-[90vh] md:max-h-[85vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
                <div className="p-6 md:p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
                    <h3 className="text-xl font-semibold text-gray-900">
                        {eventToEdit ? t('modal.dose.edit_title') : t('modal.dose.add_title')}
                    </h3>
                    <button onClick={onClose} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition">
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                    {/* Time */}
                    <div className="space-y-2">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('field.time')}</label>
                        <div className="flex items-center gap-3">
                            <input 
                                ref={dateInputRef}
                                type="datetime-local" 
                                value={dateStr} 
                                onChange={e => setDateStr(e.target.value)} 
                                className="text-xl font-bold text-gray-900 font-mono bg-transparent border-none p-0 focus:ring-0 focus:outline-none"
                            />
                            <button 
                                onClick={() => dateInputRef.current?.focus()}
                                className="p-2 bg-gray-100 hover:bg-pink-100 text-gray-600 hover:text-pink-600 rounded-lg transition-colors"
                            >
                                <Calendar size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Route */}
                    <CustomSelect
                        label={t('field.route')}
                        value={route}
                        onChange={(val) => setRoute(val as Route)}
                        options={Object.values(Route).map(r => ({
                            value: r,
                            label: t(`route.${r}`),
                            icon: getRouteIcon(r)
                        }))}
                    />

                    {route === Route.patchRemove && (
                        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 p-3 rounded-xl">
                            {t('beta.patch_remove')}
                        </div>
                    )}

                    {route !== Route.patchRemove && (
                        <>
                            {/* Ester Selection */}
                            {availableEsters.length > 1 && (
                                <CustomSelect
                                    label={t('field.ester')}
                                    value={ester}
                                    onChange={(val) => setEster(val as Ester)}
                                    options={availableEsters.map(e => ({
                                        value: e,
                                        label: t(`ester.${e}`),
                                    }))}
                                />
                            )}

                            {/* Gel Site Selector */}
                            {route === Route.gel && (
                                <div className="mb-4 space-y-2">
                                    <label className="block text-sm font-bold text-gray-700">{t('field.gel_site')}</label>
                                    <div className="p-4 bg-gray-50 border border-dashed border-gray-200 rounded-xl text-gray-400 text-sm font-medium select-none">
                                        {t('gel.site_disabled')}
                                    </div>
                                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 p-3 rounded-xl">
                                        {t('beta.gel')}
                                    </div>
                                </div>
                            )}

                            {/* Patch Mode */}
                            {route === Route.patchApply && (
                                <div className="space-y-2">
                                    <div className="p-1 bg-gray-100 rounded-xl flex">
                                        <button 
                                            onClick={() => setPatchMode("dose")} 
                                            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${patchMode === "dose" ? "bg-white shadow text-gray-800" : "text-gray-500"}`}
                                        >
                                            {t('field.patch_total')}
                                        </button>
                                        <button 
                                            onClick={() => setPatchMode("rate")} 
                                            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${patchMode === "rate" ? "bg-white shadow text-gray-800" : "text-gray-500"}`}
                                        >
                                            {t('field.patch_rate')}
                                        </button>
                                    </div>
                                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 p-3 rounded-xl">
                                        {t('beta.patch')}
                                    </div>
                                </div>
                            )}

                            {/* Dose Inputs */}
                            {(route !== Route.patchApply || patchMode === "dose") && (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        {(ester !== Ester.E2) && (
                                            <div className={`space-y-2 ${ (ester === Ester.EV && (route === Route.injection || route === Route.sublingual || route === Route.oral)) || ester === Ester.CPA ? 'col-span-2' : '' }`}>
                                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">{t('field.dose_raw')}</label>
                                                <input
                                                    type="number" inputMode="decimal"
                                                    min="0"
                                                    step="0.001"
                                                    value={rawDose} onChange={e => handleRawChange(e.target.value)}
                                                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-300 outline-none font-mono"
                                                    placeholder="0.0"
                                                />
                                            </div>
                                        )}
                                        {!(ester === Ester.EV && (route === Route.injection || route === Route.sublingual || route === Route.oral)) && ester !== Ester.CPA && (
                                            <div className={`space-y-2 ${(ester === Ester.E2 && route !== Route.gel && route !== Route.oral && route !== Route.sublingual) ? "col-span-2" : ""}`}>
                                                <label className="block text-xs font-bold text-pink-400 uppercase tracking-wider">
                                                    {route === Route.patchApply ? t('field.dose_raw') : t('field.dose_e2')}
                                                </label>
                                                <input
                                                    type="number" inputMode="decimal"
                                                    min="0"
                                                    step="0.001"
                                                    value={e2Dose} onChange={e => handleE2Change(e.target.value)}
                                                    className="w-full p-4 bg-pink-50 border border-pink-200 rounded-xl focus:ring-2 focus:ring-pink-300 outline-none font-bold text-pink-500 font-mono"
                                                    placeholder="0.0"
                                                />
                                            </div>
                                        )}
                                    </div>
                                    {(ester === Ester.EV && (route === Route.injection || route === Route.sublingual || route === Route.oral)) && (
                                        <p className="text-xs text-gray-500 mt-1">
                                            {t('field.dose_e2')}: {e2Dose ? `${e2Dose} mg` : '--'}
                                        </p>
                                    )}
                                </>
                            )}

                            {route === Route.patchApply && patchMode === "rate" && (
                                <div className="space-y-2">
                                    <label className="block text-sm font-bold text-gray-700">{t('field.patch_rate')}</label>
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        min="0"
                                        step="1"
                                        value={patchRate}
                                        onChange={e => setPatchRate(e.target.value)}
                                        className="w-full p-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-300 outline-none"
                                        placeholder="e.g. 50"
                                    />
                                </div>
                            )}

                            {doseGuide && (
                                <div className={`p-4 rounded-2xl border ${guideContainerClass} flex gap-3`}>
                                    <Info className="w-5 h-5 text-gray-600 shrink-0 mt-0.5" />
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-gray-800">{t('dose.guide.title')}</span>
                                            {doseGuide.level && (
                                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${guideBadgeClass}`}>
                                                    {t(`dose.guide.level.${doseGuide.level}`)}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-700">
                                            {t('dose.guide.current')}: {doseGuide.value !== null ? `${formatGuideNumber(doseGuide.value)} ${guideUnitLabel}` : t('dose.guide.current_blank')}
                                        </p>
                                        {guideRangeText && (
                                            <p className="text-[11px] text-gray-600 leading-relaxed">
                                                {t('dose.guide.reference')}: {guideRangeText}
                                            </p>
                                        )}
                                        {doseGuide.showRateHint && (
                                            <p className="text-xs text-amber-700 leading-relaxed">
                                                {t('dose.guide.patch_rate_hint')}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Sublingual Specifics */}
                            {route === Route.sublingual && (
                                <div className="bg-teal-50 p-4 rounded-2xl border border-teal-100 space-y-4">
                                    <div className="flex justify-between items-center">
                                        <label className="text-sm font-bold text-teal-800 flex items-center gap-2">
                                            <Clock size={16} /> {t('field.sl_duration')}
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-semibold text-teal-700 flex items-center gap-1">
                                                {t('sl.custom_mode')}
                                                <span className="px-1 py-0.5 text-[9px] font-black rounded-md bg-white text-amber-600 border border-amber-100">β</span>
                                            </span>
                                            <div className={`w-10 h-6 rounded-full p-1 cursor-pointer transition-colors ${useCustomTheta ? 'bg-teal-500' : 'bg-gray-300'}`} onClick={() => setUseCustomTheta(!useCustomTheta)}>
                                                <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${useCustomTheta ? 'translate-x-4' : ''}`} />
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {!useCustomTheta ? (
                                        <div className="space-y-3">
                                            <input 
                                                type="range" min="0" max="3" step="1" 
                                                value={slTier} onChange={e => setSlTier(parseInt(e.target.value))} 
                                                className="w-full h-2 bg-teal-200 rounded-lg appearance-none cursor-pointer accent-teal-600"
                                            />
                                            <div className="flex justify-between text-xs font-medium text-teal-700">
                                                <span>{t('sl.mode.quick')}</span>
                                                <span>{t('sl.mode.casual')}</span>
                                                <span>{t('sl.mode.standard')}</span>
                                                <span>{t('sl.mode.strict')}</span>
                                            </div>
                                            <div className="text-xs text-teal-600 bg-white/50 p-2 rounded-lg flex justify-between items-center">
                                                <span>θ ≈ {currentTheta.toFixed(2)}</span>
                                                <span className="text-[11px] text-teal-500">{SublingualTierParams[tierKey]?.hold ?? 0} min</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <label className="block text-xs font-bold text-teal-700">{t('field.sl_duration')}</label>
                                            <input
                                                type="number"
                                                inputMode="decimal"
                                                min="1"
                                                max="60"
                                                step="0.5"
                                                value={customHoldInput}
                                                onChange={e => {
                                                    const raw = e.target.value;
                                                    setCustomHoldInput(raw);
                                                    if (raw.trim() === '') {
                                                        setCustomHoldValue(0);
                                                    } else {
                                                        const val = parseFloat(raw);
                                                        if (Number.isFinite(val)) {
                                                            setCustomHoldValue(val);
                                                        }
                                                    }
                                                }}
                                                className="w-full p-3 border border-teal-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none"
                                                placeholder="e.g. 7.5"
                                            />
                                            <div className="text-xs text-teal-600">
                                                θ ≈ {customTheta.toFixed(3)} · {t('sl.custom_hint')} · {t('sl.custom_range')}
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex gap-3 items-start p-3 bg-white rounded-xl border border-teal-100">
                                        <Info className="w-5 h-5 text-teal-500 shrink-0 mt-0.5" />
                                        <p className="text-xs text-teal-700 leading-relaxed text-justify">
                                            {t('sl.instructions')}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex gap-3 shrink-0 safe-area-pb">
                    {eventToEdit && (
                        <button 
                            onClick={() => {
                                onClose();
                                if (onDelete) onDelete(eventToEdit.id);
                            }} 
                            className="w-16 h-14 flex items-center justify-center bg-red-50 text-red-500 rounded-xl hover:bg-red-100 border border-red-100 transition-colors"
                        >
                            <Trash2 size={20} />
                        </button>
                    )}
                    <button 
                        onClick={handleSave} 
                        disabled={isSaving}
                        className={`flex-1 h-14 bg-[#f6c4d7] text-white text-lg font-bold rounded-xl hover:bg-[#f3b4cb] active:scale-[0.98] transition-all flex items-center justify-center gap-2 ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                        {isSaving ? (
                            <>
                                <span className="w-4 h-4 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
                                <span>{t('btn.save')}</span>
                            </>
                        ) : (
                            <>
                                <Save size={20} /> {t('btn.save')}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DoseFormModal;
