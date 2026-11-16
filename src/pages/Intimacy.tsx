import React, { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { AddCancelLabel } from '../components/StableLabel';
import PageHeader, { PAGE_COLUMN, headerAction, headerActionAccent } from '../components/PageHeader';
import Segmented from '../components/Segmented';
import DateTimePicker from '../components/DateTimePicker';
import { SelectChevron } from '../components/CustomSelect';
import { settingsSection, rowBleed } from '../components/SettingsListItem';
import { useTranslation } from '../contexts/LanguageContext';
import { useDialog } from '../contexts/DialogContext';
import { inertWhen } from '../utils/inert';
import { fill } from '../utils/regimenText';
import { LOCALE_MAP } from '../utils/helpers';
import {
    INTIMACY_DURATION_MAX,
    INTIMACY_KINDS,
    INTIMACY_NOTE_MAX,
    IntimacyKind,
    IntimacyRecord,
} from '../utils/intimacy';

const on = 'text-[var(--text)]';
const muted = 'text-[var(--text-muted)]';
const labelCls = `block text-xs font-medium mb-1.5 ${on}`;
// The pair the supplies and lab forms close with.
const cancelBtn = 'min-w-[88px] px-4 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-hover)] rounded-md';
const confirmBtn = 'btn-primary min-w-[88px]';

type Orgasm = 'unset' | 'yes' | 'no';

interface IntimacyProps {
    onBack: () => void;
    records: IntimacyRecord[];
    onSave: (r: IntimacyRecord) => void;
    onDelete: (id: string) => void;
}

/**
 * Two hearts, one washed and one in outline leaning on it, for the empty
 * list. Drawn in the same hand as the other doodles (see DoseDoodle for the
 * rules): one line colour, one flat wash, paths a little off true, outlines
 * that overshoot where they close. Nothing in it is a body or a couple, so it
 * stands for anyone's record.
 */
const HeartsDoodle: React.FC<{ className?: string }> = ({ className = '' }) => (
    <svg
        viewBox="0 0 96 72"
        aria-hidden="true"
        focusable="false"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`text-[var(--illustration-line)] ${className}`}
    >
        <g transform="translate(10 4) scale(1.7)">
            <path
                className="fill-[var(--illustration-wash)]"
                stroke="none"
                d="M20 31 C 14 26.6, 8.4 22.4, 8.6 16.4 C 8.8 12, 12.4 9.4, 15.8 9.8 C 18 10, 19.4 11.6, 20 13.4 C 20.8 11.4, 22.4 9.8, 24.8 9.8 C 28.4 9.8, 31.6 12.6, 31.2 17 C 30.8 22.6, 25.6 26.8, 20 31 Z"
            />
            <path
                strokeWidth={1.45}
                d="M20 31 C 14 26.6, 8.4 22.4, 8.6 16.4 C 8.8 12, 12.4 9.4, 15.8 9.8 C 18 10, 19.4 11.6, 20 13.4 C 20.8 11.4, 22.4 9.8, 24.8 9.8 C 28.4 9.8, 31.6 12.6, 31.2 17 C 30.8 22.6, 25.6 26.8, 19.6 31.4"
            />
        </g>
        <g transform="translate(56 22) rotate(14 20 20) scale(1.05)">
            <path
                strokeWidth={2.2}
                d="M20 31 C 14 26.6, 8.4 22.4, 8.6 16.4 C 8.8 12, 12.4 9.4, 15.8 9.8 C 18 10, 19.4 11.6, 20 13.4 C 20.8 11.4, 22.4 9.8, 24.8 9.8 C 28.4 9.8, 31.6 12.6, 31.2 17 C 30.8 22.6, 25.6 26.8, 19.6 31.4"
            />
        </g>
        {/* A few strokes of shine off the washed heart */}
        <path d="M24.6 22.4 C 26 20.2, 28 18.8, 30.4 18.2" strokeWidth={1.8} />
        <path d="M82.4 12.6 C 83.6 10.8, 84.4 9.4, 85 7.6" strokeWidth={1.8} />
        <path d="M86.8 17.4 C 88.8 16.6, 90.4 16.2, 92.4 16" strokeWidth={1.8} />
    </svg>
);

const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

const Intimacy: React.FC<IntimacyProps> = ({ onBack, records, onSave, onDelete }) => {
    const { t, lang } = useTranslation();
    const { showDialog } = useDialog();

    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<IntimacyRecord | null>(null);
    const [dateStr, setDateStr] = useState(() => toLocalInput(new Date()));
    const [pickerOpen, setPickerOpen] = useState(false);
    const [kind, setKind] = useState<IntimacyKind>('solo');
    const [orgasm, setOrgasm] = useState<Orgasm>('unset');
    const [duration, setDuration] = useState('');
    const [satisfaction, setSatisfaction] = useState<number | null>(null);
    const [note, setNote] = useState('');

    const startNew = () => {
        setEditing(null);
        setDateStr(toLocalInput(new Date()));
        setKind('solo');
        setOrgasm('unset');
        setDuration('');
        setSatisfaction(null);
        setNote('');
        setPickerOpen(false);
        setOpen(true);
    };
    const startEdit = (r: IntimacyRecord) => {
        setEditing(r);
        setDateStr(toLocalInput(new Date(r.timeH * 3600000)));
        setKind(r.kind);
        setOrgasm(r.orgasm === undefined ? 'unset' : r.orgasm ? 'yes' : 'no');
        setDuration(r.durationMin ? String(r.durationMin) : '');
        setSatisfaction(r.satisfaction ?? null);
        setNote(r.note ?? '');
        setPickerOpen(false);
        setOpen(true);
        window.scrollTo?.({ top: 0, behavior: 'smooth' });
    };
    const close = () => {
        setOpen(false);
        setEditing(null);
    };

    const durationNum = duration.trim() === '' ? null : Number(duration);
    const durationOk = durationNum === null || (Number.isFinite(durationNum) && durationNum > 0);
    const timeH = new Date(dateStr).getTime() / 3600000;
    const canSave = Number.isFinite(timeH) && durationOk;

    const save = () => {
        if (!canSave) return;
        const record: IntimacyRecord = { id: editing?.id ?? uuidv4(), timeH, kind };
        if (orgasm !== 'unset') record.orgasm = orgasm === 'yes';
        if (durationNum !== null) record.durationMin = Math.min(INTIMACY_DURATION_MAX, Math.round(durationNum));
        if (satisfaction !== null) record.satisfaction = satisfaction;
        if (note.trim()) record.note = note.trim().slice(0, INTIMACY_NOTE_MAX);
        onSave(record);
        close();
    };

    const sorted = useMemo(() => [...records].sort((a, b) => b.timeH - a.timeH), [records]);
    const nowH = Date.now() / 3600000;
    const last30 = records.filter(r => r.timeH <= nowH && r.timeH > nowH - 30 * 24).length;

    const locale = LOCALE_MAP[lang] || 'en-US';
    const formatWhen = (d: Date) =>
        d.toLocaleString(locale, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });

    const details = (r: IntimacyRecord) =>
        [
            r.orgasm === undefined ? null : t(r.orgasm ? 'intimacy.orgasm_yes' : 'intimacy.orgasm_no'),
            r.durationMin ? fill(t('intimacy.minutes'), { n: r.durationMin }) : null,
            r.satisfaction ? fill(t('intimacy.felt'), { n: r.satisfaction }) : null,
        ]
            .filter(Boolean)
            .join(t('list.sep'));

    return (
        <div className="relative md:pb-32">
            <PageHeader
                onBack={onBack}
                title={t('intimacy.title')}
                actions={
                    <button type="button" onClick={() => (open ? close() : startNew())} className={headerActionAccent}>
                        <AddCancelLabel open={open} add={t('intimacy.add')} cancel={t('btn.cancel')} />
                    </button>
                }
            />

            {/* The form drops down from the title bar, as on the supplies page. */}
            <div className="disclosure" data-open={open} {...inertWhen(!open)}>
                <div className="disclosure-inner">
                    <div className={`${PAGE_COLUMN} mt-3 mb-6 space-y-5`}>
                        <div>
                            <button
                                type="button"
                                onClick={() => setPickerOpen(v => !v)}
                                className="w-full flex items-center justify-between py-2 text-start"
                            >
                                <span className={`text-sm ${on}`}>{t('intimacy.when')}</span>
                                <span className={`flex items-center gap-1.5 ${muted}`}>
                                    <span className="text-sm tabular-nums">{formatWhen(new Date(dateStr))}</span>
                                    <SelectChevron open={pickerOpen} />
                                </span>
                            </button>
                            <DateTimePicker
                                isOpen={pickerOpen}
                                inline
                                onClose={() => setPickerOpen(false)}
                                onConfirm={d => setDateStr(toLocalInput(d))}
                                initialDate={new Date(dateStr)}
                                mode="datetime"
                                title={t('intimacy.when')}
                            />
                        </div>

                        <div>
                            <span className={labelCls}>{t('intimacy.kind')}</span>
                            <Segmented<IntimacyKind>
                                aria-label={t('intimacy.kind')}
                                options={INTIMACY_KINDS.map(k => ({ id: k, label: t(`intimacy.kind.${k}`) }))}
                                value={kind}
                                onChange={setKind}
                            />
                        </div>

                        <div>
                            <span className={labelCls}>{t('intimacy.orgasm')}</span>
                            <Segmented<Orgasm>
                                aria-label={t('intimacy.orgasm')}
                                options={[
                                    { id: 'unset', label: t('intimacy.unset') },
                                    { id: 'yes', label: t('intimacy.yes') },
                                    { id: 'no', label: t('intimacy.no') },
                                ]}
                                value={orgasm}
                                onChange={setOrgasm}
                            />
                        </div>

                        <div>
                            <span className={labelCls}>{t('intimacy.satisfaction')}</span>
                            {/* Tap the chosen one again to leave it unsaid. */}
                            <div
                                className="flex items-center gap-2"
                                role="group"
                                aria-label={t('intimacy.satisfaction')}
                            >
                                {[1, 2, 3, 4, 5].map(n => {
                                    const chosen = satisfaction === n;
                                    return (
                                        <button
                                            key={n}
                                            type="button"
                                            aria-pressed={chosen}
                                            aria-label={fill(t('intimacy.rate'), { n })}
                                            onClick={() => setSatisfaction(chosen ? null : n)}
                                            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm tabular-nums transition-colors ${
                                                chosen
                                                    ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                                                    : `bg-[var(--surface-muted)] ${muted}`
                                            }`}
                                        >
                                            {n}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* .input-base fills its box and outranks a w- utility, so the width is set inline. */}
                        <label className="block">
                            <span className={labelCls}>{t('intimacy.duration')}</span>
                            <input
                                type="number"
                                inputMode="numeric"
                                min="1"
                                step="1"
                                value={duration}
                                onChange={e => setDuration(e.target.value)}
                                className="input-base tabular-nums"
                                style={{ fontSize: '16px', width: '8rem' }}
                            />
                        </label>

                        <label className="block">
                            <span className={labelCls}>{t('intimacy.note')}</span>
                            <input
                                type="text"
                                value={note}
                                onChange={e => setNote(e.target.value)}
                                maxLength={INTIMACY_NOTE_MAX}
                                placeholder={t('intimacy.note_placeholder')}
                                className="input-base"
                                style={{ fontSize: '16px' }}
                            />
                        </label>

                        <div className="flex items-center gap-2">
                            {editing && (
                                <button
                                    type="button"
                                    onClick={() =>
                                        showDialog(
                                            'confirm',
                                            t('intimacy.delete_confirm'),
                                            () => {
                                                onDelete(editing.id);
                                                close();
                                            },
                                            { danger: true, confirmLabel: t('btn.delete') },
                                        )
                                    }
                                    className={`${headerAction} text-[var(--danger)]`}
                                >
                                    {t('btn.delete')}
                                </button>
                            )}
                            <div className="ms-auto flex gap-2">
                                <button type="button" onClick={close} className={cancelBtn}>
                                    {t('btn.cancel')}
                                </button>
                                <button type="button" onClick={save} disabled={!canSave} className={confirmBtn}>
                                    {t('btn.save')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className={`${PAGE_COLUMN} mt-3`}>
                {sorted.length === 0 ? (
                    <div className={`flex flex-col items-center py-16 text-center ${muted}`}>
                        <HeartsDoodle className="w-24 h-auto mb-6" />
                        <p className="text-sm">{t('intimacy.empty')}</p>
                        <p className="mt-1 max-w-xs text-xs">{t('intimacy.empty_hint')}</p>
                    </div>
                ) : (
                    <>
                        <p className={`text-sm tabular-nums mb-1 ${muted}`}>
                            {fill(t('intimacy.last30'), { n: last30 })}
                        </p>
                        <div className={settingsSection}>
                            {sorted.map(r => {
                                const extra = details(r);
                                return (
                                    <button
                                        key={r.id}
                                        type="button"
                                        onClick={() => startEdit(r)}
                                        className={`w-full flex items-center gap-3 py-3.5 text-start ${rowBleed}`}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm ${on}`}>{t(`intimacy.kind.${r.kind}`)}</p>
                                            {(extra || r.note) && (
                                                <p className={`text-xs mt-0.5 truncate ${muted}`}>
                                                    {[extra, r.note].filter(Boolean).join(t('list.sep'))}
                                                </p>
                                            )}
                                        </div>
                                        <span className={`text-xs tabular-nums shrink-0 ${muted}`}>
                                            {formatWhen(new Date(r.timeH * 3600000))}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default Intimacy;
