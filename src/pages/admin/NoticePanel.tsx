import type { FC } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Megaphone } from '../../components/icons';
import { settingsSection, rowBleed } from '../../components/SettingsListItem';
import { BusyLabel } from '../../components/StableLabel';
import CustomSelect, { SelectChevron } from '../../components/CustomSelect';
import DateTimePicker from '../../components/DateTimePicker';
import Segmented from '../../components/Segmented';
import { useAuth } from '../../contexts/AuthContext';
import { useDialog } from '../../contexts/DialogContext';
import { Lang } from '../../i18n/translations';
import { noticeService, NoticeLevel, SiteNotice } from '../../services/notice';
import {
    BusyState,
    dangerTextBtn,
    dateToLocalInput,
    errorMessage,
    formatWhen,
    fromLocalInput,
    muted,
    NOTICE_LANGS,
    on,
    rowBase,
    toLocalInput,
} from './shared';

export function useNotice({ active }: { active: boolean }) {
    const { token } = useAuth();
    const { showDialog } = useDialog();

    // `noticeLang` is which text is being edited: the default, or one
    // locale's own wording. A notice with only a default reads the same in
    // every language.
    const [notice, setNotice] = useState<SiteNotice | null>(null);
    const [noticeLoading, setNoticeLoading] = useState(false);
    const [noticeSaving, setNoticeSaving] = useState(false);
    const [noticeBody, setNoticeBody] = useState('');
    const [noticeI18n, setNoticeI18n] = useState<Partial<Record<Lang, string>>>({});
    const [noticeLevel, setNoticeLevel] = useState<NoticeLevel>('info');
    const [noticeStart, setNoticeStart] = useState('');
    const [noticeEnd, setNoticeEnd] = useState('');
    const [noticeLang, setNoticeLang] = useState<'default' | Lang>('default');
    const [pickerOpen, setPickerOpen] = useState<'start' | 'end' | null>(null);

    const applyNotice = (n: SiteNotice | null) => {
        setNotice(n);
        setNoticeBody(n?.body ?? '');
        setNoticeI18n(n?.i18n ?? {});
        setNoticeLevel(n?.level ?? 'info');
        setNoticeStart(toLocalInput(n?.startsAt ?? null));
        setNoticeEnd(toLocalInput(n?.expiresAt ?? null));
    };

    const fetchNotice = useCallback(async () => {
        if (!token) return;
        setNoticeLoading(true);
        try {
            applyNotice(await noticeService.getStored(token));
        } catch {
            showDialog('alert', 'Could not load the notice.');
        } finally {
            setNoticeLoading(false);
        }
    }, [token, showDialog]);

    // Loaded on opening the notice rather than on mount: the users list is
    // what the page opens on, and this is one request nobody asked for yet.
    useEffect(() => {
        if (active) void fetchNotice();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active]);

    const noticeTextFor = (id: 'default' | Lang): string => (id === 'default' ? noticeBody : (noticeI18n[id] ?? ''));

    const setNoticeTextFor = (id: 'default' | Lang, value: string) => {
        if (id === 'default') setNoticeBody(value);
        else setNoticeI18n(prev => ({ ...prev, [id]: value }));
    };

    const saveNotice = async () => {
        if (!token) return;
        const body = noticeBody.trim();
        if (!body) {
            showDialog('alert', 'Every language without its own wording reads the default, so it cannot be empty.');
            return;
        }
        const startsAt = fromLocalInput(noticeStart);
        const expiresAt = fromLocalInput(noticeEnd);
        if (startsAt != null && expiresAt != null && expiresAt <= startsAt) {
            showDialog('alert', 'The end has to come after the start.');
            return;
        }
        setNoticeSaving(true);
        try {
            applyNotice(
                await noticeService.save(token, { body, i18n: noticeI18n, level: noticeLevel, startsAt, expiresAt }),
            );
            showDialog(
                'alert',
                'Notice published. New visits see it right away, open tabs within ten minutes, and people who closed the last one see it again.',
            );
        } catch (e: unknown) {
            showDialog('alert', errorMessage(e) || 'Could not publish the notice.');
        } finally {
            setNoticeSaving(false);
        }
    };

    const clearNotice = () => {
        if (!token) return;
        showDialog(
            'confirm',
            'Take the banner down for everyone?',
            async () => {
                try {
                    await noticeService.clear(token);
                    applyNotice(null);
                    setNoticeLang('default');
                } catch {
                    showDialog('alert', 'Could not take the notice down.');
                }
            },
            { danger: true },
        );
    };

    // The wording a reader of the chosen language sees: its own when it has
    // one, the default otherwise.
    const noticePreview = noticeLang === 'default' ? noticeBody : noticeI18n[noticeLang]?.trim() || noticeBody;

    const noticeWindowLabel = (): string => {
        if (!notice) return 'Not showing';
        const now = Math.floor(Date.now() / 1000);
        if (notice.startsAt != null && now < notice.startsAt)
            return `Starts ${formatWhen(toLocalInput(notice.startsAt))}`;
        if (notice.expiresAt != null && now >= notice.expiresAt)
            return `Ended ${formatWhen(toLocalInput(notice.expiresAt))}`;
        if (notice.expiresAt != null) return `Showing until ${formatWhen(toLocalInput(notice.expiresAt))}`;
        return 'Showing now';
    };

    return {
        notice,
        noticeLoading,
        noticeSaving,
        noticeBody,
        setNoticeBody,
        noticeI18n,
        noticeLevel,
        setNoticeLevel,
        noticeStart,
        setNoticeStart,
        noticeEnd,
        setNoticeEnd,
        noticeLang,
        setNoticeLang,
        pickerOpen,
        setPickerOpen,
        noticeTextFor,
        setNoticeTextFor,
        saveNotice,
        clearNotice,
        noticePreview,
        noticeWindowLabel,
    };
}

export type NoticeState = ReturnType<typeof useNotice>;

export const NoticePanel: FC<{ state: NoticeState }> = ({ state }) => {
    const {
        notice,
        noticeLoading,
        noticeSaving,
        noticeBody,
        noticeLevel,
        setNoticeLevel,
        noticeStart,
        setNoticeStart,
        noticeEnd,
        setNoticeEnd,
        noticeLang,
        setNoticeLang,
        pickerOpen,
        setPickerOpen,
        noticeTextFor,
        setNoticeTextFor,
        saveNotice,
        clearNotice,
        noticePreview,
        noticeWindowLabel,
    } = state;

    if (noticeLoading) return <BusyState />;

    const scheduleRow = (which: 'start' | 'end') => {
        const value = which === 'start' ? noticeStart : noticeEnd;
        const set = which === 'start' ? setNoticeStart : setNoticeEnd;
        const open = pickerOpen === which;
        const label = which === 'start' ? 'Starts' : 'Ends';
        return (
            <div>
                <button
                    type="button"
                    onClick={() => setPickerOpen(open ? null : which)}
                    aria-expanded={open}
                    className={`${rowBase} ${rowBleed}`}
                >
                    <span className={`text-sm ${on}`}>{label}</span>
                    <span className={`flex items-center gap-1.5 text-sm ${muted}`}>
                        <span className="tabular-nums">
                            {value ? formatWhen(value) : which === 'start' ? 'Right away' : 'When taken down'}
                        </span>
                        <SelectChevron open={open} />
                    </span>
                </button>
                <DateTimePicker
                    isOpen={open}
                    inline
                    onClose={() => setPickerOpen(null)}
                    onConfirm={date => set(dateToLocalInput(date))}
                    initialDate={value ? new Date(value) : new Date()}
                    mode="datetime"
                    title={label}
                />
                {open && value && (
                    <div className="flex justify-end pb-3">
                        <button
                            type="button"
                            onClick={() => {
                                set('');
                                setPickerOpen(null);
                            }}
                            className={dangerTextBtn}
                        >
                            {which === 'start' ? 'Start right away' : 'No end'}
                        </button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div>
            <p className={`text-xs ${muted} mb-4`}>One banner at the top of the app, for everyone, signed in or not</p>

            <CustomSelect
                label="Wording for"
                value={noticeLang}
                onChange={v => setNoticeLang(v as 'default' | Lang)}
                options={NOTICE_LANGS.map(({ id, label }) => ({
                    value: id,
                    label,
                    description:
                        id === 'default'
                            ? 'For every language without its own'
                            : noticeTextFor(id).trim()
                              ? 'Own wording'
                              : 'Reads the default',
                }))}
            />

            <div className="mt-4">
                <label className="field-label mb-2" htmlFor="notice-text">
                    {noticeLang === 'default' ? 'Text' : 'Text, empty to use the default'}
                </label>
                <textarea
                    id="notice-text"
                    value={noticeTextFor(noticeLang)}
                    onChange={e => setNoticeTextFor(noticeLang, e.target.value)}
                    rows={4}
                    maxLength={2000}
                    className="input-base resize-y"
                />
                <p className="field-hint tabular-nums">
                    {noticeTextFor(noticeLang).length} of 2000, links starting https:// can be tapped
                </p>
            </div>

            <div className={`mt-2 ${settingsSection}`}>
                <div className={rowBase}>
                    <span className={`text-sm ${on}`}>Tone</span>
                    <Segmented
                        aria-label="Tone"
                        options={[
                            { id: 'info', label: 'Info' },
                            { id: 'warn', label: 'Warning' },
                        ]}
                        value={noticeLevel}
                        onChange={v => setNoticeLevel(v as NoticeLevel)}
                    />
                </div>
                {scheduleRow('start')}
                {scheduleRow('end')}
            </div>

            {noticePreview.trim() && (
                <div className="mt-4">
                    <p className="field-label mb-2">Preview</p>
                    <p
                        className={`flex items-start gap-1.5 text-xs whitespace-pre-wrap break-words ${
                            noticeLevel === 'warn' ? 'text-[var(--warning)]' : 'text-[var(--accent-ink)]'
                        }`}
                    >
                        <span className="icon-line">
                            {noticeLevel === 'warn' ? (
                                <Alert size={14} strokeWidth={1.75} />
                            ) : (
                                <Megaphone size={14} strokeWidth={1.75} />
                            )}
                        </span>
                        <span className="min-w-0">{noticePreview}</span>
                    </p>
                </div>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <span className={`text-xs ${muted} tabular-nums`}>{noticeWindowLabel()}</span>
                <div className="ml-auto flex items-center gap-2">
                    <button onClick={clearNotice} disabled={!notice} className={dangerTextBtn}>
                        Take down
                    </button>
                    <button
                        onClick={saveNotice}
                        disabled={noticeSaving || !noticeBody.trim()}
                        className="btn-primary disabled:opacity-45 disabled:pointer-events-none"
                    >
                        <BusyLabel busy={noticeSaving} size={16}>
                            {notice ? 'Update' : 'Publish'}
                        </BusyLabel>
                    </button>
                </div>
            </div>
        </div>
    );
};
