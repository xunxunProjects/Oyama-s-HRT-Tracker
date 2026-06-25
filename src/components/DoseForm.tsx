import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from '../contexts/LanguageContext';
import { useDialog } from '../contexts/DialogContext';
import CustomSelect from './CustomSelect';
import DateTimePicker from './DateTimePicker';
import { Route, Ester, ExtraKey, DoseEvent, SL_TIER_ORDER, SublingualTierParams, getBioavailabilityMultiplier, getToE2Factor } from '../../logic';
import { Save, Trash2, Info, Bookmark, BookmarkPlus, X, ChevronDown, Check, AlertTriangle, ExternalLink } from 'lucide-react';
import InjectionFields from './dose_form/InjectionFields';
import OralFields from './dose_form/OralFields';
import SublingualFields from './dose_form/SublingualFields';
import GelFields from './dose_form/GelFields';
import PatchFields from './dose_form/PatchFields';
import QuickDoseButtons, { QuickDose } from './dose_form/QuickDoseButtons';
import { useHRTMode } from '../contexts/HRTModeContext';

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
};

const LEVEL_BADGE_STYLES: Record<DoseLevelKey, string> = {
    low: 'text-emerald-700 dark:text-emerald-300',
    medium: 'text-sky-700 dark:text-sky-300',
    high: 'text-amber-700 dark:text-amber-300',
    very_high: 'text-rose-700 dark:text-rose-300',
    above: 'text-red-700 dark:text-red-300'
};

const LEVEL_CONTAINER_STYLES: Record<DoseLevelKey | 'neutral', string> = {
    low: 'bg-emerald-50 border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-900/30',
    medium: 'bg-sky-50 border-sky-100 dark:bg-sky-900/10 dark:border-sky-900/30',
    high: 'bg-amber-50 border-amber-100 dark:bg-amber-900/10 dark:border-amber-900/30',
    very_high: 'bg-rose-50 border-rose-100 dark:bg-rose-900/10 dark:border-rose-900/30',
    above: 'bg-red-50 border-red-100 dark:bg-red-900/10 dark:border-red-900/30',
    neutral: 'bg-[var(--color-m3-surface-container)] border-[var(--color-m3-outline-variant)] dark:bg-[var(--color-m3-dark-surface-container-high)] dark:border-[var(--color-m3-dark-outline-variant)]'
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
    hideHeader?: boolean;
    quickDoses?: QuickDose[];
    onAddQuickDose?: (dose: QuickDose) => void;
    onDeleteQuickDose?: (id: string) => void;
}

const DoseForm: React.FC<DoseFormProps> = ({ eventToEdit, onSave, onCancel, onDelete, templates = [], onSaveTemplate, onDeleteTemplate, isInline = false, hideHeader = false, quickDoses, onAddQuickDose, onDeleteQuickDose }) => {
    const { t, lang } = useTranslation();
    const { showDialog } = useDialog();
    const dateInputRef = useRef<HTMLInputElement>(null);
    const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
    const isInitializingRef = useRef(false);
    const [showTemplateMenu, setShowTemplateMenu] = useState(false);
    const [showSaveTemplateInput, setShowSaveTemplateInput] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);
    const [templateName, setTemplateName] = useState('');

    // Form State
    const [dateStr, setDateStr] = useState("");
    const { isTransmasc } = useHRTMode();
    const [route, setRoute] = useState<Route>(Route.injection);
    const [ester, setEster] = useState<Ester>(isTransmasc ? Ester.TC : Ester.EV);

    const [rawDose, setRawDose] = useState("");
    const [e2Dose, setE2Dose] = useState("");

    const [patchMode, setPatchMode] = useState<"dose" | "rate">("rate");
    const [patchRate, setPatchRate] = useState("");
    const [patchWearDays, setPatchWearDays] = useState("");

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
        const extrasForCalc: Record<string, unknown> = slExtras ?? {};
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

            const wearH = eventToEdit.extras[ExtraKey.patchWearH];
            if (eventToEdit.route === Route.patchApply && typeof wearH === 'number' && Number.isFinite(wearH) && wearH > 0) {
                setPatchWearDays((wearH / 24).toString());
            } else {
                setPatchWearDays("");
            }

        } else {
            const now = new Date();
            const iso = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
            setDateStr(iso);
            setRoute(isTransmasc ? Route.injection : Route.sublingual);
            setEster(isTransmasc ? Ester.TC : Ester.EV);
            setRawDose("");
            setE2Dose("");
            setPatchMode("rate");
            setPatchRate("");
            setPatchWearDays("");
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
        if (route === Route.patchApply) {
            const wearDays = parseFloat(patchWearDays);
            if (Number.isFinite(wearDays) && wearDays > 0) {
                template.extras[ExtraKey.patchWearH] = wearDays * 24;
            }
        }

        onSaveTemplate(template);
        setShowSaveTemplateInput(false);
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
        if (template.route === Route.patchApply) {
            const wearH = template.extras[ExtraKey.patchWearH];
            setPatchWearDays(typeof wearH === 'number' && Number.isFinite(wearH) && wearH > 0 ? (wearH / 24).toString() : "");
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

        if (route === Route.patchApply) {
            const wearDays = parseFloat(patchWearDays);
            if (Number.isFinite(wearDays) && wearDays > 0) {
                extras[ExtraKey.patchWearH] = wearDays * 24;
            }
        }

        const newEvent: DoseEvent = {
            id: eventToEdit?.id || uuidv4(),
            route,
            ester: (route === Route.patchRemove || route === Route.patchApply || route === Route.gel)
                ? (isTransmasc ? Ester.T : Ester.E2)
                : ester,
            timeH,
            doseMG: finalDose,
            extras
        };

        onSave(newEvent);
        setIsSaving(false);
    };

    const availableEsters = useMemo(() => {
        if (isTransmasc) {
            switch (route) {
                case Route.injection:
                    return [Ester.TC, Ester.TE, Ester.TU];
                case Route.gel:
                    return [Ester.T];
                default:
                    return [Ester.T];
            }
        }
        switch (route) {
            case Route.injection:
                return [Ester.EB, Ester.EV, Ester.EC, Ester.EN, Ester.EU];
            case Route.oral:
                return [Ester.E2, Ester.EV, Ester.CPA];
            case Route.sublingual:
                return [Ester.E2, Ester.EV];
            default:
                return [Ester.E2];
        }
    }, [route, isTransmasc]);

    const availableRoutes = useMemo(() => {
        if (isTransmasc) {
            // Transmasc: no oral/sublingual; no patches (T patches are uncommon and
            // not realistically modeled with the current µg/day scheme).
            return Object.values(Route).filter(r =>
                r !== Route.oral && r !== Route.sublingual &&
                r !== Route.patchApply && r !== Route.patchRemove
            );
        }
        return Object.values(Route);
    }, [isTransmasc]);

    useEffect(() => {
        if (!availableRoutes.includes(route)) {
            setRoute(availableRoutes[0]);
        }
    }, [availableRoutes, route]);

    useEffect(() => {
        if (!availableEsters.includes(ester)) {
            setEster(availableEsters[0]);
        }
    }, [availableEsters, ester]);

    const doseGuide = useMemo(() => {
        if (ester === Ester.CPA) return null;
        // The built-in dose thresholds (DOSE_GUIDE_CONFIG) are calibrated for
        // feminizing HRT (E2). They would be misleading for testosterone dosing,
        // so skip the guide entirely in transmasc mode.
        if (isTransmasc) return null;
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
    }, [route, patchMode, patchRate, e2Dose, ester, isTransmasc]);

    const tierKey = SL_TIER_ORDER[slTier] || "standard";
    const currentTheta = SublingualTierParams[tierKey]?.theta || 0.11;
    const customTheta = thetaFromHold(customHoldValue);
    const guideUnitLabel = doseGuide?.config ? t(`dose.guide.unit.${doseGuide.config.unitKey}`) : "";
    const guideRangeText = doseGuide?.config
        ? `${doseGuide.config.thresholds.map((threshold) => `≤ ${formatGuideNumber(threshold)}`).join(' · ')} ${guideUnitLabel}`
        : "";
    const guideBadgeClass = doseGuide?.level ? LEVEL_BADGE_STYLES[doseGuide.level] : "";
    const confirmAndOpenExternal = (url: string) => {
        const host = (() => {
            try {
                return new URL(url).hostname.replace(/^www\./, '');
            } catch {
                return url;
            }
        })();
        const confirmText = t('drawer.model_confirm').replace('mahiro.uk', host);
        showDialog('confirm', confirmText, () => {
            window.open(url, '_blank', 'noopener,noreferrer');
        });
    };
    const renderLoadTemplateControl = () => {
        if (eventToEdit) return null;

        return (
            <div className="relative">
                <button
                    onClick={() => {
                        if (templates.length === 0) return;
                        setShowTemplateMenu(!showTemplateMenu);
                    }}
                    disabled={templates.length === 0}
                    className={`px-2 py-1 text-xs font-medium rounded flex items-center gap-1 ${
                        templates.length === 0
                            ? 'text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] opacity-40 cursor-not-allowed'
                            : 'text-[var(--color-m3-primary)] hover:bg-[var(--color-m3-primary-container)] dark:hover:bg-[var(--color-m3-primary-container)]/20'
                    }`}
                    title={t('template.load_title')}
                >
                    <Bookmark size={14} />
                    <span>{t('template.load_title')}</span>
                </button>
                {showTemplateMenu && templates.length > 0 && (
                    <div className="absolute right-0 top-full mt-1 bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] rounded-xl border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] w-64 max-h-64 overflow-y-auto z-50">
                        <div className="py-1">
                            {templates.map((template: DoseTemplate) => (
                                <div key={template.id} className="group flex items-center justify-between px-3 py-2.5 hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container-high)] border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] last:border-b-0">
                                    <button
                                        onClick={() => { handleLoadTemplate(template); setShowTemplateMenu(false); }}
                                        className="flex-1 text-left"
                                    >
                                        <div className="text-sm font-medium text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">{template.name}</div>
                                        <div className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] mt-0.5">
                                            {t(`route.${template.route}`)} · {template.doseMG.toFixed(2)} mg
                                        </div>
                                    </button>
                                    {templateToDelete === template.id ? (
                                        <div className="flex items-center gap-0.5 pl-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                                            <button onClick={() => { setTemplateToDelete(null); setShowTemplateMenu(false); onDeleteTemplate(template.id); }} className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded" title={t('btn.confirm')}>
                                                <Check size={13} />
                                            </button>
                                            <button onClick={() => setTemplateToDelete(null)} className="p-1 text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container-high)] rounded" title={t('btn.cancel')}>
                                                <X size={13} />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setTemplateToDelete(template.id);
                                            }}
                                            className="opacity-0 group-hover:opacity-100 p-1.5 text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] hover:text-red-500 rounded shrink-0"
                                            title={t('btn.delete')}
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full">

            {/* Save Template Dialog Overlay */}
            {/* Save Template Dialog Overlay (Removed) */}

            {/* Header */}
            {!isInline && !hideHeader && (
                <div className="px-6 py-4 border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] flex justify-between items-center shrink-0">
                    <h3 className="text-base font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">
                        {eventToEdit ? t('modal.dose.edit_title') : t('modal.dose.add_title')}
                    </h3>
                    <div className="flex gap-2 items-center">
                        {renderLoadTemplateControl()}
                        <button onClick={onCancel} className="p-1.5 hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container-high)] rounded-lg">
                            <X size={18} className="text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]" />
                        </button>
                    </div>
                </div>
            )}

            {/* Inline Header (Simpler) */}
            {isInline && !hideHeader && (
                <div className="pb-4 border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] flex justify-between items-center">
                    <span className="text-[13px] font-semibold uppercase tracking-wide text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                        {t('timeline.add_title')}
                    </span>
                    {renderLoadTemplateControl()}
                </div>
            )}

            <div className={`space-y-4 flex-1 overflow-y-auto ${!isInline ? 'px-6 pb-4' : hideHeader ? 'pb-2' : 'px-4 pb-4'}`}>
                {/* Time */}
                <div>
                    <button
                        type="button"
                        onClick={() => setIsDatePickerOpen(v => !v)}
                        className="w-full flex items-center justify-between py-[18px] border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] text-start"
                    >
                        <span className="text-[15px] text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">{t('field.time')}</span>
                        <div className="flex items-center gap-1.5 text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                            <span className="text-sm tabular-nums">
                                {dateStr ? new Date(dateStr).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                            </span>
                            <ChevronDown size={14} className={isDatePickerOpen ? 'rotate-180' : ''} />
                        </div>
                    </button>
                    <DateTimePicker
                        isOpen={isDatePickerOpen}
                        inline
                        onClose={() => setIsDatePickerOpen(false)}
                        onConfirm={(date) => {
                            const iso = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                            setDateStr(iso);
                            setIsDatePickerOpen(false);
                        }}
                        initialDate={dateStr ? new Date(dateStr) : new Date()}
                        mode="datetime"
                        title={t('field.time')}
                    />
                </div>

                {/* Route */}
                <CustomSelect
                    label={t('field.route')}
                    value={route}
                    onChange={(val) => setRoute(val as Route)}
                    options={availableRoutes.map(r => ({
                        value: r,
                        label: t(`route.${r}`)
                    }))}
                />

                {route === Route.patchRemove && (
                    <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 p-3 rounded-[var(--radius-md)]">
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
                                    label: t(`ester.${e}`)
                                }))}
                            />
                        )}

                        {quickDoses && onAddQuickDose && onDeleteQuickDose && (
                            <div className="mt-2">
                                <QuickDoseButtons
                                    route={route}
                                    ester={ester}
                                    quickDoses={quickDoses}
                                    currentDose={rawDose}
                                    onSelectDose={(val) => handleRawChange(val.toString())}
                                    onAddQuickDose={onAddQuickDose}
                                    onDeleteQuickDose={onDeleteQuickDose}
                                />
                            </div>
                        )}

                        <div className="mt-2">
                            {route === Route.injection && (
                                <InjectionFields
                                    ester={ester}
                                    rawDose={rawDose}
                                    e2Dose={e2Dose}
                                    onRawChange={handleRawChange}
                                    onE2Change={handleE2Change}
                                    isInitializing={isInitializingRef.current}
                                    route={route}
                                    lastEditedField={lastEditedField}
                                />
                            )}

                            {route === Route.oral && (
                                <OralFields
                                    ester={ester}
                                    rawDose={rawDose}
                                    e2Dose={e2Dose}
                                    onRawChange={handleRawChange}
                                    onE2Change={handleE2Change}
                                    isInitializing={isInitializingRef.current}
                                    route={route}
                                    lastEditedField={lastEditedField}
                                />
                            )}

                            {route === Route.sublingual && (
                                <SublingualFields
                                    ester={ester}
                                    rawDose={rawDose}
                                    e2Dose={e2Dose}
                                    onRawChange={handleRawChange}
                                    onE2Change={handleE2Change}
                                    slTier={slTier}
                                    setSlTier={setSlTier}
                                    useCustomTheta={useCustomTheta}
                                    setUseCustomTheta={setUseCustomTheta}
                                    customHoldInput={customHoldInput}
                                    setCustomHoldInput={setCustomHoldInput}
                                    customHoldValue={customHoldValue}
                                    setCustomHoldValue={setCustomHoldValue}
                                    holdFromTheta={holdFromTheta}
                                    thetaFromHold={thetaFromHold}
                                    isInitializing={isInitializingRef.current}
                                    route={route}
                                    lastEditedField={lastEditedField}
                                />
                            )}

                            {route === Route.gel && (
                                <GelFields
                                    gelSite={gelSite}
                                    setGelSite={setGelSite}
                                    e2Dose={e2Dose}
                                    onE2Change={handleE2Change}
                                    bioMultiplier={bioMultiplier}
                                />
                            )}

                            {route === Route.patchApply && (
                                <PatchFields
                                    patchMode={patchMode}
                                    setPatchMode={setPatchMode}
                                    patchRate={patchRate}
                                    setPatchRate={setPatchRate}
                                    rawDose={rawDose}
                                    onRawChange={handleRawChange}
                                    patchWearDays={patchWearDays}
                                    setPatchWearDays={setPatchWearDays}
                                    route={route}
                                />
                            )}
                        </div>

                        {/* Injection-specific guide from mtf.wiki */}
                        {route === Route.injection && !isTransmasc && (
                            <div className="mt-3 border-t border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] pt-3 space-y-3">
                                {/* Safety Warning */}
                                <div className="flex gap-2">
                                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                    <div>
                                        <span className="text-sm font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">{t('inj.guide.title')}</span>
                                        <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">{t('inj.guide.safety')}</p>
                                    </div>
                                </div>

                                {/* Usage & Dosage */}
                                <div className="space-y-1.5 pl-6">
                                    <p className="text-sm text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">{t('inj.guide.route_methods')}</p>
                                    <p className="text-xs font-medium text-red-600 dark:text-red-400">{t('inj.guide.route_warn')}</p>
                                    <p className="text-sm font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] mt-1">{t('inj.guide.dosage_title')}</p>
                                    <ul className="text-sm text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] space-y-0.5 list-disc list-inside">
                                        <li>{t('inj.guide.dosage_ev')}</li>
                                        <li>{t('inj.guide.dosage_ec')}</li>
                                    </ul>
                                    <a
                                        href="https://transfemscience.org/misc/injectable-e2-simulator/"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            confirmAndOpenExternal('https://transfemscience.org/misc/injectable-e2-simulator/');
                                        }}
                                        className="inline-flex items-center gap-1 text-sm text-[var(--color-m3-primary)] hover:underline mt-0.5"
                                    >
                                        {t('inj.guide.sim_link')}
                                        <ExternalLink size={13} />
                                    </a>
                                </div>

                                {/* Precautions */}
                                <div className="pl-6 space-y-1">
                                    <p className="text-sm font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">{t('inj.guide.notes_title')}</p>
                                    <ul className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] space-y-1.5 list-disc list-inside leading-relaxed">
                                        <li>{t('inj.guide.note_1')}</li>
                                        <li>{t('inj.guide.note_2')}</li>
                                        <li className="font-semibold text-red-600 dark:text-red-400">{t('inj.guide.note_3')}</li>
                                        <li><span className="font-semibold text-amber-700 dark:text-amber-400">{t('inj.guide.note_4')}</span></li>
                                        <li>{t('inj.guide.note_5')}</li>
                                        <li>{t('inj.guide.note_6')}</li>
                                        <li>{t('inj.guide.note_7')}</li>
                                        <li>{t('inj.guide.note_8')}</li>
                                        <li>{t('inj.guide.note_9')}</li>
                                    </ul>
                                </div>

                                {/* Source */}
                                <a
                                    href="https://mtf.wiki/zh-cn/docs/medicine/estrogen/injection"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        confirmAndOpenExternal('https://mtf.wiki/zh-cn/docs/medicine/estrogen/injection');
                                    }}
                                    className="inline-flex items-center gap-1 text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] hover:text-[var(--color-m3-primary)]"
                                >
                                    {t('inj.guide.source')}
                                    <ExternalLink size={12} />
                                </a>
                            </div>
                        )}

                        {/* CPA dosage hint */}
                        {ester === Ester.CPA && (
                            <div className="mt-3 p-3 rounded-[var(--radius-lg)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] bg-[var(--color-m3-surface-container-low)] dark:bg-[var(--color-m3-dark-surface-container)] flex gap-3">
                                <Info className="w-5 h-5 text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] shrink-0 mt-0.5" />
                                <div className="space-y-1.5">
                                    <span className="text-sm font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">{t('dose.guide.title')}</span>
                                    <ul className="space-y-1 mt-1">
                                        {(['rec', 'combo', 'ultralow'] as const).map(key => (
                                            <li key={key} className="flex items-start gap-1.5 text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] leading-relaxed">
                                                <span className="mt-1.5 w-1 h-1 rounded-full bg-[var(--color-m3-on-surface-variant)] dark:bg-[var(--color-m3-dark-on-surface-variant)] shrink-0" />
                                                {t(`dose.guide.cpa_hint.${key}`)}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        )}

                        {/* Dose guide for non-injection routes */}
                        {doseGuide && (
                            <div className="mt-2 pt-2 border-t border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] flex gap-2">
                                <Info className="w-3.5 h-3.5 text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] shrink-0 mt-0.5" />
                                <div className="space-y-0.5 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">{t('dose.guide.title')}</span>
                                        {doseGuide.level && (
                                            <span className={`text-xs font-medium ${guideBadgeClass}`}>
                                                {t(`dose.guide.level.${doseGuide.level}`)}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                                        {t('dose.guide.current')}: {doseGuide.value !== null ? `${formatGuideNumber(doseGuide.value)} ${guideUnitLabel}` : t('dose.guide.current_blank')}
                                    </p>
                                    {guideRangeText && (
                                        <p className="text-[10px] text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] leading-snug">
                                            {t('dose.guide.reference')}: {guideRangeText}
                                        </p>
                                    )}
                                    {doseGuide.showRateHint && (
                                        <p className="text-[11px] text-amber-700 dark:text-amber-500 leading-snug">
                                            {t('dose.guide.patch_rate_hint')}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Footer Buttons */}
            <div className={`flex flex-wrap gap-y-2 justify-between items-center shrink-0 border-t border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] ${!isInline ? 'px-6 py-3' : hideHeader ? 'py-2' : 'px-4 py-3'}`}>
                <div className="flex gap-2 items-center flex-wrap min-h-10 w-full sm:w-auto">

                    {/* Template Save Section */}
                    <div className="flex items-center">
                        <div className={`overflow-hidden flex items-center ${
                            showSaveTemplateInput ? 'w-[14rem] sm:w-[13.5rem] opacity-100' : 'w-0 opacity-0'
                        }`}>
                            <input
                                type="text"
                                value={templateName}
                                onChange={(e) => setTemplateName(e.target.value)}
                                placeholder={t('template.name_placeholder')}
                                className="flex-1 min-w-0 px-2.5 py-1.5 text-sm bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container-low)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] rounded-md focus:ring-1 focus:ring-[var(--color-m3-primary)]/30 focus:border-[var(--color-m3-primary)] outline-none text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]"
                                style={{ fontSize: '16px' }}
                            />
                            <button
                                onClick={handleSaveAsTemplate}
                                className="p-1.5 ml-1 text-[var(--color-m3-primary)] hover:bg-[var(--color-m3-primary-container)] dark:hover:bg-[var(--color-m3-primary-container)]/20 rounded shrink-0"
                            >
                                <Check size={18} />
                            </button>
                            <button
                                onClick={() => { setShowSaveTemplateInput(false); setTemplateName(''); }}
                                className="p-1.5 text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container-high)] rounded shrink-0"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        
                        <div className={`overflow-hidden ${
                            showSaveTemplateInput ? 'w-0 opacity-0' : 'w-[2.35rem] opacity-100'
                        }`}>
                            <button
                                onClick={() => {
                                    setShowSaveTemplateInput(true);
                                    setShowDeleteConfirm(false);
                                    setShowTemplateMenu(false);
                                }}
                                className="p-2 text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] hover:text-[var(--color-m3-primary)] rounded flex items-center justify-center"
                                title={t('template.save_title')}
                            >
                                <BookmarkPlus size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Delete Event Section (Only when editing) */}
                    {eventToEdit && (
                        <div className="flex items-center">
                            <div className={`overflow-hidden flex items-center ${
                                showDeleteConfirm ? 'w-[8.75rem] sm:w-40 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded opacity-100 pl-3 pr-1 py-1' : 'w-0 opacity-0 border border-transparent'
                            }`}>
                                <span className="text-xs text-red-600 dark:text-red-400 font-medium whitespace-nowrap grow">{t('dialog.confirm_title')}?</span>
                                <div className="flex items-center shrink-0 ml-2">
                                    <button
                                        onClick={() => {
                                            onDelete(eventToEdit.id);
                                            onCancel();
                                        }}
                                        className="p-1 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 rounded"
                                        title={t('btn.ok')}
                                    >
                                        <Check size={16} />
                                    </button>
                                    <button
                                        onClick={() => setShowDeleteConfirm(false)}
                                        className="p-1 text-gray-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                                        title={t('btn.cancel')}
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            </div>

                            <div className={`overflow-hidden ${
                                showDeleteConfirm ? 'w-0 opacity-0' : 'w-[2.35rem] opacity-100'
                            }`}>
                                <button
                                    onClick={() => {
                                        setShowDeleteConfirm(true);
                                        setShowSaveTemplateInput(false);
                                        setShowTemplateMenu(false);
                                    }}
                                    className="p-2 text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] hover:text-red-500 rounded flex items-center justify-center"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex gap-2 ml-auto shrink-0 w-full sm:w-auto justify-end">
                    {hideHeader && (
                        <button
                            onClick={onCancel}
                            className="flex-1 sm:flex-none sm:min-w-[88px] flex items-center justify-center px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-md text-sm"
                        >
                            {t('btn.cancel')}
                        </button>
                    )}
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex-1 sm:flex-none sm:min-w-[88px] px-4 py-2 bg-[var(--color-m3-primary)] hover:bg-[var(--color-m3-primary-light)] text-white rounded-md font-medium text-sm disabled:opacity-70 flex items-center justify-center gap-1.5"
                    >
                        {isSaving ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <Save size={16} />
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
