import React, { useState, useEffect, useId } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { useDialog } from '../contexts/DialogContext';
import { LabResult, LabAssay, LAB_ASSAYS, isT_LabUnit, convertToPgMl, convertToNgDl } from '../../logic';
import { Check, Trash } from './icons';
import { v4 as uuidv4 } from 'uuid';
import DateTimePicker from './DateTimePicker';
import { SelectChevron } from './CustomSelect';
import Segmented from './Segmented';
import { LOCALE_MAP } from '../utils/helpers';
import { clinicalUnit } from '../utils/clinicalUnit';

type LabUnit = LabResult['unit'];

interface LabResultFormProps {
    resultToEdit?: LabResult | null;
    onSave: (result: LabResult) => void;
    onCancel: () => void;
    onDelete?: (id: string) => void;
    /** Units a new entry starts in: the ones the person's last lab of each
     *  hormone used, so a clinic that reports pg/mL isn't met with pmol/L on
     *  every entry. Without a past lab, pmol/L and ng/dL. */
    defaultE2Unit?: LabUnit;
    defaultTUnit?: LabUnit;
    /** The test method a new entry starts with: the last lab's, since a
     *  clinic tends to use the same one every time. */
    defaultAssay?: LabAssay;
}

// "Not sure" is stored as no assay at all.
type AssayChoice = LabAssay | 'unknown';
const ASSAY_CHOICES: AssayChoice[] = ['unknown', ...LAB_ASSAYS];
const withAssay = (choice: AssayChoice) => (choice === 'unknown' ? {} : { assay: choice });

const divider = 'border-b-(length:--hairline) border-[var(--border)]';

const E2_UNITS: LabUnit[] = ['pmol/l', 'pg/ml'];
const T_UNITS: LabUnit[] = ['ng/dl', 'nmol/l'];

// A lab value worth saving: a real number above zero. Calibration drops a zero
// anyway, so Save stays disabled rather than accepting one and doing nothing.
const parseLabValue = (s: string): number | null => {
    const n = parseFloat(s);
    return s.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
};

// The same value in the hormone's other unit, for display only. A number in
// the wrong unit is 3.67× (estradiol) or 29× (testosterone) off, and seeing
// "≈ 41 pg/mL" beside a 150 meant as pg/mL is what catches the slip.
const fmtApprox = (v: number) => (v >= 100 ? String(Math.round(v)) : v >= 1 ? v.toFixed(1) : v.toFixed(2));
const otherUnitReading = (value: number, unit: LabUnit, units: LabUnit[]): string | null => {
    const other = units.find(u => u !== unit);
    if (!other) return null;
    const toBase = isT_LabUnit(unit) ? convertToNgDl : convertToPgMl;
    return `≈ ${fmtApprox(toBase(value, unit) / toBase(1, other))} ${clinicalUnit(other)}`;
};

// One hormone's value + unit toggle. Reused for the estradiol row, the
// testosterone row, and (in edit mode) the single row matching whichever
// hormone the record being edited already belongs to.
const HormoneValueField: React.FC<{
    label: string;
    units: LabUnit[];
    unit: LabUnit;
    onUnitChange: (u: LabUnit) => void;
    value: string;
    onValueChange: (v: string) => void;
}> = ({ label, units, unit, onUnitChange, value, onValueChange }) => {
    const id = useId();
    const parsed = parseLabValue(value);
    const reading = parsed !== null ? otherUnitReading(parsed, unit, units) : null;
    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <label htmlFor={id} className="text-sm text-[var(--text)]">
                    {label}
                </label>
                <Segmented
                    options={units.map(u => ({ id: u, label: clinicalUnit(u) }))}
                    value={unit}
                    onChange={onUnitChange}
                    aria-label={label}
                />
            </div>
            {/* The other-unit reading sits inside the field, so it appears
                as you type without pushing the rows below it down. */}
            <div className="relative">
                <input
                    id={id}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    placeholder="0.0"
                    value={value}
                    onChange={e => onValueChange(e.target.value)}
                    aria-invalid={value.trim() !== '' && parsed === null}
                    className="input-base w-full text-[var(--text)] placeholder:text-[var(--text-muted)] tabular-nums"
                    style={{ fontSize: '16px', paddingInlineEnd: reading ? '7.5rem' : undefined }}
                />
                {reading && (
                    <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs text-[var(--text-muted)] tabular-nums">
                        {reading}
                    </span>
                )}
            </div>
        </div>
    );
};

const LabResultForm: React.FC<LabResultFormProps> = ({
    resultToEdit,
    onSave,
    onCancel,
    onDelete,
    defaultE2Unit = 'pmol/l',
    defaultTUnit = 'ng/dl',
    defaultAssay,
}) => {
    const { t, lang } = useTranslation();
    const { showDialog } = useDialog();
    const [dateStr, setDateStr] = useState('');
    const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

    // Editing an existing record: single value tied to that record's hormone.
    const [editUnit, setEditUnit] = useState<LabUnit>('pmol/l');
    const [editValue, setEditValue] = useState('');

    // Adding new: estradiol and testosterone are independent fields, so one
    // blood draw covering both markers can be logged as a single entry at a
    // single timestamp instead of two separate saves. The add form is
    // remounted each time it opens, so the starting units are read once here.
    const [e2Unit, setE2Unit] = useState<LabUnit>(defaultE2Unit);
    const [e2Value, setE2Value] = useState('');
    const [tUnit, setTUnit] = useState<LabUnit>(defaultTUnit);
    const [tValue, setTValue] = useState('');
    const [assay, setAssay] = useState<AssayChoice>(defaultAssay ?? 'unknown');

    useEffect(() => {
        if (resultToEdit) {
            const d = new Date(resultToEdit.timeH * 3600000);
            const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
            setDateStr(iso);
            setEditValue(resultToEdit.concValue.toString());
            setEditUnit(resultToEdit.unit);
            setAssay(resultToEdit.assay ?? 'unknown');
        } else {
            const now = new Date();
            const iso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
            setDateStr(iso);
            setE2Value('');
            setTValue('');
        }
    }, [resultToEdit]);

    const editNum = parseLabValue(editValue);
    const e2Num = parseLabValue(e2Value);
    const tNum = parseLabValue(tValue);
    // A field left empty is fine; one holding something that isn't a value
    // keeps Save disabled, rather than saving the other field and silently
    // dropping this one.
    const addFieldsOk = (e2Value.trim() === '' || e2Num !== null) && (tValue.trim() === '' || tNum !== null);

    const handleSave = () => {
        if (!dateStr) return;
        const timeH = new Date(dateStr).getTime() / 3600000;
        if (isNaN(timeH)) return;

        if (resultToEdit) {
            if (editNum === null) return;
            onSave({ id: resultToEdit.id, timeH, concValue: editNum, unit: editUnit, ...withAssay(assay) });
            return;
        }

        if (!addFieldsOk || (e2Num === null && tNum === null)) return;
        if (e2Num !== null) onSave({ id: uuidv4(), timeH, concValue: e2Num, unit: e2Unit, ...withAssay(assay) });
        if (tNum !== null) onSave({ id: uuidv4(), timeH, concValue: tNum, unit: tUnit, ...withAssay(assay) });
    };

    const canSave = resultToEdit ? editNum !== null : addFieldsOk && (e2Num !== null || tNum !== null);
    const formatWhen = (d: Date) =>
        d.toLocaleString(LOCALE_MAP[lang] || 'en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    const editIsT = isT_LabUnit(editUnit);

    return (
        <div className="flex flex-col h-full">
            <div className="flex-1">
                {/* Date row */}
                <button
                    type="button"
                    onClick={() => setIsDatePickerOpen(v => !v)}
                    className={`w-full flex items-center justify-between py-[18px] ${divider} text-start`}
                >
                    <span className="text-sm text-[var(--text)]">{t('lab.date')}</span>
                    <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
                        <span className="text-sm tabular-nums">{dateStr ? formatWhen(new Date(dateStr)) : '—'}</span>
                        <SelectChevron />
                    </div>
                </button>
                <DateTimePicker
                    isOpen={isDatePickerOpen}
                    inline
                    onClose={() => setIsDatePickerOpen(false)}
                    onConfirm={date => {
                        const iso = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
                            .toISOString()
                            .slice(0, 16);
                        setDateStr(iso);
                    }}
                    initialDate={dateStr ? new Date(dateStr) : new Date()}
                    mode="datetime"
                    title={t('lab.date')}
                />

                {resultToEdit ? (
                    <div className={`py-[18px] ${divider}`}>
                        <HormoneValueField
                            label={editIsT ? t('lab.value_t') : t('lab.value')}
                            units={editIsT ? T_UNITS : E2_UNITS}
                            unit={editUnit}
                            onUnitChange={setEditUnit}
                            value={editValue}
                            onValueChange={setEditValue}
                        />
                    </div>
                ) : (
                    <>
                        <div className={`py-[18px] ${divider}`}>
                            <HormoneValueField
                                label={t('lab.value')}
                                units={E2_UNITS}
                                unit={e2Unit}
                                onUnitChange={setE2Unit}
                                value={e2Value}
                                onValueChange={setE2Value}
                            />
                        </div>
                        <div className={`py-[18px] ${divider}`}>
                            <HormoneValueField
                                label={t('lab.value_t')}
                                units={T_UNITS}
                                unit={tUnit}
                                onUnitChange={setTUnit}
                                value={tValue}
                                onValueChange={setTValue}
                            />
                        </div>
                    </>
                )}

                {/* How it was measured. Optional, and for both hormones of a
                    draw at once: one blood sample goes through one lab. */}
                <div className={`py-[18px] ${divider}`}>
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-[var(--text)]">{t('lab.assay')}</span>
                        <Segmented<AssayChoice>
                            options={ASSAY_CHOICES.map(a => ({ id: a, label: t(`lab.assay.${a}`) }))}
                            value={assay}
                            onChange={setAssay}
                            aria-label={t('lab.assay')}
                        />
                    </div>
                    {/* One line on the chosen method, so the choice can be made without looking it up. */}
                    <p className="text-xs text-[var(--text-muted)] pt-2">{t(`lab.assay_desc.${assay}`)}</p>
                </div>
                {!resultToEdit && <p className="text-xs text-[var(--text-muted)] pt-2">{t('lab.dual_hint')}</p>}
            </div>

            {/* Footer */}
            <div className="pt-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                    {resultToEdit && onDelete && (
                        <button
                            // The question is the heading; the body names the one
                            // result going, as saved, so the right row is deleted.
                            onClick={() =>
                                showDialog(
                                    'confirm',
                                    `${resultToEdit.concValue} ${clinicalUnit(resultToEdit.unit)}\n${formatWhen(new Date(resultToEdit.timeH * 3600000))}`,
                                    () => {
                                        onDelete(resultToEdit.id);
                                        onCancel();
                                    },
                                    { danger: true, title: t('lab.delete_confirm'), confirmLabel: t('btn.delete') },
                                )
                            }
                            className="tap-target p-2 text-[var(--text-muted)] hover:text-[var(--danger)] rounded"
                            title={t('btn.delete')}
                            aria-label={t('btn.delete')}
                        >
                            <Trash size={16} />
                        </button>
                    )}
                </div>

                <div className="flex gap-2 ml-auto">
                    <button
                        onClick={onCancel}
                        className="min-w-[88px] px-4 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-hover)] rounded-md flex items-center justify-center"
                    >
                        {t('btn.cancel')}
                    </button>
                    <button onClick={handleSave} disabled={!canSave || !dateStr} className="btn-primary min-w-[88px]">
                        <Check size={14} />
                        {t('btn.save')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LabResultForm;
