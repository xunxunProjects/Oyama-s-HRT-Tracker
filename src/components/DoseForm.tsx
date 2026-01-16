import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from '../contexts/LanguageContext';
import { useDialog } from '../contexts/DialogContext';
import CustomSelect from './CustomSelect';
import { getRouteIcon } from '../utils/helpers';
import { Route, Ester, ExtraKey, DoseEvent, SL_TIER_ORDER, SublingualTierParams, getBioavailabilityMultiplier, getToE2Factor } from '../../logic';
import { Calendar, X, Clock, Info, Save, Trash2, Bookmark, BookmarkCheck } from 'lucide-react';

export interface DoseTemplate {
    id: string;
    name: string;
    route: Route;
    ester: Ester;
    doseMG: number;
    extras: Partial<Record<ExtraKey, number>>;
    createdAt: number;
}

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
    low: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200',
    medium: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200',
    high: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
    very_high: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200',
    above: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200'
};

const LEVEL_CONTAINER_STYLES: Record<DoseLevelKey | 'neutral', string> = {
    low: 'bg-emerald-50 border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-900/30',
    medium: 'bg-sky-50 border-sky-100 dark:bg-sky-900/10 dark:border-sky-900/30',
    high: 'bg-amber-50 border-amber-100 dark:bg-amber-900/10 dark:border-amber-900/30',
    very_high: 'bg-rose-50 border-rose-100 dark:bg-rose-900/10 dark:border-rose-900/30',
    above: 'bg-red-50 border-red-100 dark:bg-red-900/10 dark:border-red-900/30',
    neutral: 'bg-gray-50 border-gray-200 dark:bg-gray-800/50 dark:border-gray-700'
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

interface DoseFormProps {
    eventToEdit: DoseEvent | null;
    onSave: (event: DoseEvent) => void;
    onCancel: () => void;
    onDelete: (id: string) => void;
    templates: DoseTemplate[];
    onSaveTemplate: (template: DoseTemplate) => void;
    onDeleteTemplate: (id: string) => void;
    isInline?: boolean;
}

const DoseForm: React.FC<DoseFormProps> = ({ eventToEdit, onSave, onCancel, onDelete, templates = [], onSaveTemplate, onDeleteTemplate, isInline = false }) => {
    const { t } = useTranslation();
    const { showDialog } = useDialog();
    const dateInputRef = useRef<HTMLInputElement>(null);
    const isInitializingRef = useRef(false);
    const [showTemplateMenu, setShowTemplateMenu] = useState(false);
    const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
    const [templateName, setTemplateName] = useState('');

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
        isInitializingRef.current = true;
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
            } else {
                setPatchMode("dose");
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
                    const safeTheta = (typeof thetaVal === 'number' && Number.isFinite(thetaVal)) ? thetaVal : 0.11;
                    const hold = Math.max(1, Math.min(60, holdFromTheta(safeTheta)));
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

        // Use timeout to allow state to settle
        const timer = setTimeout(() => {
            isInitializingRef.current = false;
        }, 0);
        return () => clearTimeout(timer);
    }, [eventToEdit]); // Removed isOpen dependency as component mounts only when needed

    const handleRawChange = (val: string) => {
        setRawDose(val);
        setLastEditedField('raw');
        const v = parseFloat(val);
        if (!isNaN(v)) {
            const factor = getToE2Factor(ester) || 1;
            const e2Equivalent = v * factor;
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
        if (isInitializingRef.current || lastEditedField !== 'raw' || !rawDose) return;
        handleRawChange(rawDose);
    }, [bioMultiplier, ester, route]);

    useEffect(() => {
        if (isInitializingRef.current || lastEditedField !== 'bio' || !e2Dose) return;
        handleE2Change(e2Dose);
    }, [bioMultiplier, ester, route]);

    const [isSaving, setIsSaving] = useState(false);

    const handleSaveAsTemplate = () => {
        if (!templateName.trim()) {
            showDialog('alert', t('template.name_required'));
            return;
        }

        const template: DoseTemplate = {
            id: uuidv4(),
            name: templateName.trim(),
            route,
            ester,
            doseMG: parseFloat(rawDose) || 0,
            extras: {},
            createdAt: Date.now()
        };

        if (route === Route.sublingual && slExtras) {
            Object.assign(template.extras, slExtras);
        }
        if (route === Route.gel) {
            template.extras[ExtraKey.gelSite] = gelSite;
        }
        if (route === Route.patchApply && patchMode === 'rate') {
            template.extras[ExtraKey.releaseRateUGPerDay] = parseFloat(patchRate) || 0;
        }

        onSaveTemplate(template);
        setShowSaveTemplateDialog(false);
        setTemplateName('');
        showDialog('alert', t('template.saved'));
    };

    const handleLoadTemplate = (template: DoseTemplate) => {
        setRoute(template.route);
        setEster(template.ester);
        setRawDose(template.doseMG.toFixed(3));

        const factor = getToE2Factor(template.ester) || 1;
        const e2Val = template.doseMG * factor;
        setE2Dose(e2Val.toFixed(3));

        if (template.route === Route.patchApply && template.extras[ExtraKey.releaseRateUGPerDay]) {
            setPatchMode('rate');
            setPatchRate(template.extras[ExtraKey.releaseRateUGPerDay].toString());
        }

        if (template.route === Route.sublingual) {
            if (template.extras[ExtraKey.sublingualTier] !== undefined) {
                setSlTier(template.extras[ExtraKey.sublingualTier]);
                setUseCustomTheta(false);
            } else if (template.extras[ExtraKey.sublingualTheta] !== undefined) {
                const theta = template.extras[ExtraKey.sublingualTheta];
                const hold = Math.max(1, Math.min(60, holdFromTheta(typeof theta === 'number' ? theta : 0.11)));
                setCustomHoldValue(hold);
                setCustomHoldInput(hold.toString());
                setUseCustomTheta(true);
            }
        }

        if (template.route === Route.gel && template.extras[ExtraKey.gelSite] !== undefined) {
            setGelSite(template.extras[ExtraKey.gelSite]);
        }

        setShowTemplateMenu(false);
        showDialog('alert', t('template.loaded'));
    };

    const handleSave = () => {
        if (isSaving) return;
        setIsSaving(true);
        let timeH = new Date(dateStr).getTime() / 3600000;
        if (isNaN(timeH)) {
            timeH = new Date().getTime() / 3600000;
        }

        let e2Equivalent = parseFloat(e2Dose);
        if (isNaN(e2Equivalent)) e2Equivalent = 0;

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
            if (!rawDose || rawDose.trim() === '' || !Number.isFinite(raw) || raw <= 0) {
                showDialog('alert', nonPositiveMsg);
                setIsSaving(false);
                return;
            }
            finalDose = raw;
        } else if (route !== Route.patchRemove) {
            if (!e2Dose || e2Dose.trim() === '' || !Number.isFinite(e2Equivalent) || e2Equivalent <= 0) {
                showDialog('alert', nonPositiveMsg);
                setIsSaving(false);
                return;
            }
            const factor = getToE2Factor(ester) || 1;
            finalDose = (ester === Ester.E2) ? e2Equivalent : e2Equivalent / factor;
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
    };

    const availableEsters = useMemo(() => {
        switch (route) {
            case Route.injection:
                return [Ester.EB, Ester.EV, Ester.EC, Ester.EN];
            case Route.oral:
                return [Ester.E2, Ester.EV, Ester.CPA];
            case Route.sublingual:
                return [Ester.E2, Ester.EV];
            default:
                return [Ester.E2];
        }
    }, [route]);

    useEffect(() => {
        if (!availableEsters.includes(ester)) {
            setEster(availableEsters[0]);
        }
    }, [availableEsters, ester]);

    const doseGuide = useMemo(() => {
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
        <div className={`flex flex-col h-full bg-white dark:bg-gray-900 transition-colors duration-300 ${isInline ? 'rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-800' : ''}`}>

            {/* Save Template Dialog Overlay */}
            {showSaveTemplateDialog && createPortal(
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] transition-all duration-300">
                    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4 border border-gray-100 dark:border-gray-800 animate-in zoom-in-95">
                        <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('template.save_title')}</h4>
                        <input
                            type="text"
                            value={templateName}
                            onChange={(e) => setTemplateName(e.target.value)}
                            placeholder={t('template.name_placeholder')}
                            className="w-full p-3 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-pink-300 outline-none mb-4 placeholder-gray-400 dark:placeholder-gray-500"
                            autoFocus
                        />
                        <div className="flex gap-3">
                            <button
                                onClick={() => { setShowSaveTemplateDialog(false); setTemplateName(''); }}
                                className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 font-semibold transition-colors"
                            >
                                {t('btn.cancel')}
                            </button>
                            <button
                                onClick={handleSaveAsTemplate}
                                className="flex-1 px-4 py-2 bg-pink-500 text-white rounded-full hover:bg-pink-600 font-semibold shadow-lg shadow-pink-200 dark:shadow-none transition-colors"
                            >
                                {t('btn.save')}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Header */}
            {!isInline && (
                <div className="p-6 md:p-8 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50 shrink-0 transition-colors duration-300">
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                        {eventToEdit ? t('modal.dose.edit_title') : t('modal.dose.add_title')}
                    </h3>
                    <div className="flex gap-2">
                        {/* Templates Button */}
                        {!eventToEdit && templates.length > 0 && (
                            <div className="relative">
                                <button
                                    onClick={() => setShowTemplateMenu(!showTemplateMenu)}
                                    className="p-2.5 bg-amber-50 dark:bg-amber-900/20 rounded-full hover:bg-amber-100 dark:hover:bg-amber-900/40 transition border border-amber-100 dark:border-amber-900/30"
                                    title={t('template.load_title')}
                                >
                                    <Bookmark size={20} className="text-amber-600 dark:text-amber-500" />
                                </button>
                                {showTemplateMenu && (
                                    <div className="absolute right-0 top-12 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 w-64 max-h-80 overflow-y-auto z-20">
                                        <div className="p-2">
                                            {templates.map((template: DoseTemplate) => (
                                                <div key={template.id} className="group flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg">
                                                    <button
                                                        onClick={() => handleLoadTemplate(template)}
                                                        className="flex-1 text-left"
                                                    >
                                                        <div className="text-sm font-semibold text-gray-900 dark:text-white">{template.name}</div>
                                                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                            {t(`route.${template.route}`)} · {t(`ester.${template.ester}`)} · {template.doseMG.toFixed(2)} mg
                                                        </div>
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            showDialog('confirm', t('template.delete_confirm'), () => {
                                                                onDeleteTemplate(template.id);
                                                            });
                                                        }}
                                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition"
                                                    >
                                                        <Trash2 size={14} className="text-red-500" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        <button onClick={onCancel} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition">
                            <X size={20} className="text-gray-500 dark:text-gray-400" />
                        </button>
                    </div>
                </div>
            )}

            {/* Inline Header (Simpler) */}
            {isInline && (
                <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50 rounded-t-[2rem]">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white px-2">
                        {t('modal.dose.add_title')}
                    </h3>
                    <div className="flex gap-2">
                        {!eventToEdit && templates.length > 0 && (
                            <div className="relative">
                                <button
                                    onClick={() => setShowTemplateMenu(!showTemplateMenu)}
                                    className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-full hover:bg-amber-100 dark:hover:bg-amber-900/40 transition border border-amber-100 dark:border-amber-900/30"
                                >
                                    <Bookmark size={16} className="text-amber-600 dark:text-amber-500" />
                                </button>
                                {showTemplateMenu && (
                                    <div className="absolute right-0 top-10 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 w-64 max-h-80 overflow-y-auto z-20">
                                        <div className="p-2">
                                            {templates.map((template: DoseTemplate) => (
                                                <div key={template.id} className="group flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg">
                                                    <button
                                                        onClick={() => handleLoadTemplate(template)}
                                                        className="flex-1 text-left"
                                                    >
                                                        <div className="text-sm font-semibold text-gray-900 dark:text-white">{template.name}</div>
                                                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                            {t(`route.${template.route}`)} · {t(`ester.${template.ester}`)} · {template.doseMG.toFixed(2)} mg
                                                        </div>
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            showDialog('confirm', t('template.delete_confirm'), () => {
                                                                onDeleteTemplate(template.id);
                                                            });
                                                        }}
                                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition"
                                                    >
                                                        <Trash2 size={14} className="text-red-500" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        <button onClick={onCancel} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition">
                            <X size={16} className="text-gray-500 dark:text-gray-400" />
                        </button>
                    </div>
                </div>
            )}

            <div className={`space-y-6 flex-1 overflow-y-auto ${isInline ? 'p-4' : 'p-6'}`}>
                {/* Time */}
                <div className="space-y-2">
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('field.time')}</label>
                    <div className="flex items-center gap-3">
                        <input
                            ref={dateInputRef}
                            type="datetime-local"
                            value={dateStr}
                            onChange={e => setDateStr(e.target.value)}
                            className="text-xl font-bold text-gray-900 dark:text-white font-mono bg-transparent border-none p-0 focus:ring-0 focus:outline-none"
                        />
                        <button
                            onClick={() => dateInputRef.current?.focus()}
                            className="p-2 bg-gray-50 dark:bg-gray-800 hover:bg-pink-50 dark:hover:bg-pink-900/20 text-gray-400 dark:text-gray-500 hover:text-pink-500 dark:hover:text-pink-400 rounded-2xl transition-colors"
                        >
                            <Calendar size={20} />
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
                                <div className="p-1 bg-gray-100 dark:bg-gray-800 rounded-xl flex">
                                    <button
                                        onClick={() => setPatchMode("dose")}
                                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${patchMode === "dose" ? "bg-white dark:bg-gray-700 shadow text-gray-800 dark:text-gray-200" : "text-gray-500 dark:text-gray-400"}`}
                                    >
                                        {t('field.patch_total')}
                                    </button>
                                    <button
                                        onClick={() => setPatchMode("rate")}
                                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${patchMode === "rate" ? "bg-white dark:bg-gray-700 shadow text-gray-800 dark:text-gray-200" : "text-gray-500 dark:text-gray-400"}`}
                                    >
                                        {t('field.patch_rate')}
                                    </button>
                                </div>
                                <div className="text-xs text-amber-700 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 p-3 rounded-xl">
                                    {t('beta.patch')}
                                </div>
                            </div>
                        )}

                        {/* Dose Inputs */}
                        {(route !== Route.patchApply || patchMode === "dose") && (
                            <>
                                <div className="grid grid-cols-2 gap-4">
                                    {(ester !== Ester.E2) && (
                                        <div className={`space-y-2 ${(ester === Ester.EV && (route === Route.injection || route === Route.sublingual || route === Route.oral)) || ester === Ester.CPA ? 'col-span-2' : ''}`}>
                                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('field.dose_raw')}</label>
                                            <input
                                                type="number" inputMode="decimal"
                                                min="0"
                                                step="0.001"
                                                value={rawDose} onChange={e => handleRawChange(e.target.value)}
                                                className="w-full p-4 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-pink-300/50 outline-none font-mono text-gray-900 dark:text-white font-bold"
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
                                                className="w-full p-4 bg-pink-50/50 dark:bg-pink-900/20 border border-pink-100 dark:border-pink-900/30 rounded-2xl focus:ring-2 focus:ring-pink-300/50 outline-none font-bold text-pink-500 dark:text-pink-400 font-mono"
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
                            <div className={`p-4 rounded-2xl border ${guideContainerClass} flex gap-3 transition-colors duration-300`}>
                                <Info className="w-5 h-5 text-gray-600 dark:text-gray-400 shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{t('dose.guide.title')}</span>
                                        {doseGuide.level && (
                                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${guideBadgeClass}`}>
                                                {t(`dose.guide.level.${doseGuide.level}`)}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-700 dark:text-gray-300">
                                        {t('dose.guide.current')}: {doseGuide.value !== null ? `${formatGuideNumber(doseGuide.value)} ${guideUnitLabel}` : t('dose.guide.current_blank')}
                                    </p>
                                    {guideRangeText && (
                                        <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">
                                            {t('dose.guide.reference')}: {guideRangeText}
                                        </p>
                                    )}
                                    {doseGuide.showRateHint && (
                                        <p className="text-xs text-amber-700 dark:text-amber-500 leading-relaxed">
                                            {t('dose.guide.patch_rate_hint')}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Sublingual Specifics - Uses CustomSelect Dropdown implemented recently */}
                        {route === Route.sublingual && (
                            <div className="space-y-4">
                                <CustomSelect
                                    label={t('field.sl_duration')}
                                    value={useCustomTheta ? "-1" : slTier.toString()}
                                    onChange={(val) => {
                                        if (val === "-1") {
                                            setUseCustomTheta(true);
                                        } else {
                                            setUseCustomTheta(false);
                                            setSlTier(parseInt(val));
                                        }
                                    }}
                                    options={[
                                        { value: "0", label: t('sl.mode.quick') },
                                        { value: "1", label: t('sl.mode.casual') },
                                        { value: "2", label: t('sl.mode.standard') },
                                        { value: "3", label: t('sl.mode.strict') },
                                        { value: "-1", label: `${t('sl.custom_mode')}...` },
                                    ]}
                                />

                                {useCustomTheta && (
                                    <div className="space-y-2 animate-in slide-in-from-top-2 fade-in duration-200">
                                        <div className="relative">
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
                                                className="w-full p-4 border border-teal-100 dark:border-teal-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-2xl focus:ring-2 focus:ring-teal-500/50 outline-none font-bold text-center text-lg placeholder-gray-300 dark:placeholder-gray-600 transition-shadow"
                                                placeholder="e.g. 7.5"
                                            />
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400 dark:text-gray-500 pointer-events-none">min</span>
                                        </div>
                                        <div className="text-center text-xs font-medium text-teal-500/70 dark:text-teal-400/70">
                                            {t('sl.custom_range')}
                                        </div>
                                    </div>
                                )}

                                <div className="flex gap-3 items-start p-3 bg-teal-50/50 dark:bg-teal-900/10 rounded-xl border border-teal-100 dark:border-teal-900/30">
                                    <Info className="w-4 h-4 text-teal-500 shrink-0 mt-0.5" />
                                    <div className="flex-1 space-y-1">
                                        <p className="text-xs text-teal-700 dark:text-teal-300 leading-relaxed">
                                            {t('sl.instructions')}
                                        </p>
                                        <p className="text-[10px] font-mono font-medium text-teal-500/70 dark:text-teal-400/70">
                                            θ ≈ {useCustomTheta ? customTheta.toFixed(3) : currentTheta.toFixed(2)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Footer Buttons */}
            <div className={`p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50 flex justify-between items-center shrink-0 transition-colors duration-300 ${isInline ? 'rounded-b-[2rem]' : ''}`}>
                <button
                    onClick={() => setShowSaveTemplateDialog(true)}
                    className="px-4 py-2.5 text-gray-500 dark:text-gray-400 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-900/20 rounded-full transition-all flex items-center gap-2 text-sm font-semibold"
                >
                    <Bookmark size={16} />
                    {isInline ? '' : t('template.save_as')}
                </button>
                {eventToEdit && (
                    <button
                        onClick={() => {
                            onDelete(eventToEdit.id);
                            onCancel();
                        }}
                        className="p-2.5 text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-all"
                    >
                        <Trash2 size={20} />
                    </button>
                )}

                <div className="flex gap-3 ml-auto">
                    {/* Inline Cancel is smaller */}
                    <button
                        onClick={onCancel}
                        className={`px-4 py-3.5 bg-gray-100/80 dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 font-bold text-[15px] transition-all active:scale-[0.98] ${isInline ? 'hidden md:block' : ''}`}
                    >
                        {t('btn.cancel')}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-6 py-3.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-full hover:bg-gray-800 dark:hover:bg-white font-bold text-[15px] shadow-xl shadow-gray-900/10 dark:shadow-none transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:hover:scale-100 flex items-center justify-center gap-2"
                    >
                        {isSaving ? (
                            <div className="w-5 h-5 border-2 border-white/30 dark:border-gray-900/30 border-t-white dark:border-t-gray-900 rounded-full animate-spin" />
                        ) : (
                            <>
                                <Save size={18} />
                                <span>{t('btn.save')}</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DoseForm;
