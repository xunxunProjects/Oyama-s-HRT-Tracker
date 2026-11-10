import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import { Info, Mic } from '../components/icons';
import { useAuth } from '../contexts/AuthContext';
import { useDialog } from '../contexts/DialogContext';
import { useHRTMode } from '../contexts/HRTModeContext';
import { useTranslation } from '../contexts/LanguageContext';
import type { HRTMode } from '../domain/types';
import { passageIdForLang, passageKeyForId } from '../domain/voice/passage';
import { detectPitch, frameRms, summarizePitch } from '../domain/voice/pitch';
import { bucketForScore, scoreFromF0 } from '../domain/voice/score';
import type { VoiceCheck } from '../domain/voice/types';
import { fill } from '../utils/regimenText';
import { addVoiceCheck, clearAllVoiceChecks, loadVoiceChecks } from '../utils/voiceStorage';

const FRAME_MS = 40;
const RECORD_MS = 5000;
const MIN_RECORD_MS = 2000;
const FFT_SIZE = 4096;

type Status = 'idle' | 'requesting' | 'recording' | 'analyzing' | 'done' | 'error';

interface Recording {
    stream: MediaStream;
    ctx: AudioContext;
    frames: Float32Array[];
    startedAt: number;
    mode: HRTMode;
    owner: string;
    sampleRate: number;
    intervalId: number;
}

type AudioContextCtor = typeof AudioContext;

const isTauriShell = () => typeof window !== 'undefined' && '__TAURI__' in window;

const newCheckId = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const errorKeyFor = (err: unknown): string => {
    const name = typeof err === 'object' && err !== null ? (err as { name?: string }).name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'voice.error.permission';
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'voice.error.no_mic';
    if (name === 'NotReadableError' || name === 'TrackStartError') return 'voice.error.busy';
    return isTauriShell() ? 'voice.error.desktop' : 'voice.error.generic';
};

const Voice: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { t, lang } = useTranslation();
    const { mode } = useHRTMode();
    const { user } = useAuth();
    const { showDialog } = useDialog();
    const owner = user?.id ?? 'local';

    const [status, setStatus] = useState<Status>('idle');
    const [history, setHistory] = useState<VoiceCheck[]>(() => loadVoiceChecks(localStorage, owner, mode));
    const [result, setResult] = useState<VoiceCheck | null>(null);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [saveFailed, setSaveFailed] = useState(false);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [liveHz, setLiveHz] = useState<number | null>(null);
    const [level, setLevel] = useState(0);

    const recordingRef = useRef<Recording | null>(null);
    const aliveRef = useRef(true);

    const passageId = passageIdForLang(lang);
    const passage = t(passageKeyForId(passageId));
    const modeLabel = mode === 'transfem' ? t('voice.mode.transfem') : t('voice.mode.transmasc');

    const shownHistory = useMemo(() => history.filter(c => c.passageId === passageId), [history, passageId]);
    const chartHistory = shownHistory.slice(-12);

    const finishRecording = useCallback(
        (discard: boolean) => {
            const rec = recordingRef.current;
            if (!rec) return;
            recordingRef.current = null;
            window.clearInterval(rec.intervalId);
            rec.stream.getTracks().forEach(track => track.stop());
            void rec.ctx.close().catch(() => {});
            setElapsedMs(0);
            setLiveHz(null);
            setLevel(0);
            if (discard) {
                setStatus('idle');
                return;
            }

            const durationMs = performance.now() - rec.startedAt;
            if (durationMs < MIN_RECORD_MS) {
                setErrorKey('voice.error.too_short');
                setStatus('error');
                return;
            }
            if (rec.mode !== mode || rec.owner !== owner) {
                setErrorKey('voice.error.generic');
                setStatus('error');
                return;
            }

            setStatus('analyzing');
            window.setTimeout(() => {
                if (!aliveRef.current) return;
                const summary = summarizePitch(rec.frames, rec.sampleRate);
                if (!summary) {
                    setErrorKey('voice.error.too_quiet');
                    setStatus('error');
                    return;
                }
                const check: VoiceCheck = {
                    id: newCheckId(),
                    at: Date.now(),
                    medianF0: summary.medianF0,
                    p5: summary.p5,
                    p95: summary.p95,
                    score: Math.round(scoreFromF0(summary.medianF0, rec.mode)),
                    voicedRatio: summary.voicedRatio,
                    durationMs: Math.round(durationMs),
                    passageId,
                };
                setResult(check);
                setErrorKey(null);
                setStatus('done');
                try {
                    setHistory(addVoiceCheck(localStorage, rec.owner, rec.mode, check));
                    setSaveFailed(false);
                } catch {
                    setSaveFailed(true);
                }
            }, 50);
        },
        [mode, owner, passageId],
    );

    const startRecording = useCallback(async () => {
        if (recordingRef.current) return;
        setErrorKey(null);
        setResult(null);
        setSaveFailed(false);
        setStatus('requesting');

        if (typeof window === 'undefined' || !window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
            setErrorKey(isTauriShell() ? 'voice.error.desktop' : 'voice.error.unsupported');
            setStatus('error');
            return;
        }

        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
            });
        } catch (err) {
            setErrorKey(errorKeyFor(err));
            setStatus('error');
            return;
        }
        if (!aliveRef.current) {
            stream.getTracks().forEach(track => track.stop());
            return;
        }

        const Ctor: AudioContextCtor | undefined =
            window.AudioContext ?? (window as Window & { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
        if (!Ctor) {
            stream.getTracks().forEach(track => track.stop());
            setErrorKey('voice.error.unsupported');
            setStatus('error');
            return;
        }

        const ctx = new Ctor();
        try {
            await ctx.resume();
        } catch {
            // Some browsers start the context suspended until a gesture; the
            // recorder still works once the interval reads the analyser.
        }
        if (!aliveRef.current) {
            stream.getTracks().forEach(track => track.stop());
            void ctx.close().catch(() => {});
            return;
        }
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        analyser.smoothingTimeConstant = 0;
        source.connect(analyser);

        const rec: Recording = {
            stream,
            ctx,
            frames: [],
            startedAt: performance.now(),
            mode,
            owner,
            sampleRate: ctx.sampleRate,
            intervalId: 0,
        };
        recordingRef.current = rec;
        setElapsedMs(0);
        setLiveHz(null);
        setLevel(0);
        setStatus('recording');

        rec.intervalId = window.setInterval(() => {
            const active = recordingRef.current;
            if (!active) return;
            const frame = new Float32Array(analyser.fftSize);
            analyser.getFloatTimeDomainData(frame);
            active.frames.push(frame);
            const elapsed = performance.now() - active.startedAt;
            setElapsedMs(elapsed);
            setLevel(frameRms(frame));
            if (active.frames.length % 4 === 0) {
                const reading = detectPitch(frame, active.sampleRate);
                setLiveHz(reading ? reading.f0 : null);
            }
            if (elapsed >= RECORD_MS) finishRecording(false);
        }, FRAME_MS);
    }, [finishRecording, mode, owner]);

    useEffect(() => {
        setHistory(loadVoiceChecks(localStorage, owner, mode));
    }, [owner, mode]);

    useEffect(() => {
        aliveRef.current = true;
        return () => {
            aliveRef.current = false;
            finishRecording(true);
        };
    }, [finishRecording]);

    useEffect(() => {
        const onVisibility = () => {
            if (document.hidden && recordingRef.current) finishRecording(true);
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, [finishRecording]);

    const handleClear = () => {
        showDialog('confirm', t('voice.clear_confirm'), () => {
            clearAllVoiceChecks(localStorage, owner);
            setHistory([]);
            setResult(null);
            setStatus('idle');
        });
    };

    const scoreText = result ? (result.score > 0 ? `+${result.score}` : String(result.score)) : '';
    const bucketKey = result ? `voice.bucket.${bucketForScore(result.score)}` : '';
    const chartPoints = chartHistory
        .map((c, i) => {
            const x = chartHistory.length === 1 ? 160 : 16 + (i * 288) / (chartHistory.length - 1);
            const y = 12 + ((100 - c.score) / 200) * 72;
            return `${x},${y}`;
        })
        .join(' ');
    const card = 'rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5';

    return (
        <div className="relative md:pb-32">
            <PageHeader onBack={onBack} title={t('voice.title')} subtitle={t('voice.subtitle')} />

            <div className={`${PAGE_COLUMN} mt-4 space-y-6`}>
                <div className={card}>
                    <p className="text-sm font-semibold text-[var(--text)]">{modeLabel}</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{t('voice.mode.note')}</p>
                </div>

                <div className={card}>
                    <div className="flex items-center gap-2">
                        <Info size={17} className="text-[var(--accent-ink)]" aria-hidden="true" />
                        <h2 className="text-sm font-semibold text-[var(--text)]">{t('voice.intro.title')}</h2>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{t('voice.intro.body')}</p>
                </div>

                <div className={card}>
                    <p className="text-xs font-medium text-[var(--text-muted)]">{t('voice.passage.title')}</p>
                    <p className="mt-2 text-lg leading-8 text-[var(--text)]">{passage}</p>
                </div>

                <div className={card}>
                    <button
                        type="button"
                        onClick={status === 'recording' ? () => finishRecording(false) : startRecording}
                        disabled={status === 'requesting' || status === 'analyzing'}
                        className={`${status === 'recording' ? 'btn-danger' : 'btn-primary'} w-full tap-target`}
                    >
                        <Mic size={18} aria-hidden="true" />
                        {status === 'recording' ? t('voice.stop') : t('voice.start')}
                    </button>

                    {status === 'recording' && (
                        <div className="mt-4">
                            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                                <div
                                    className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-100"
                                    style={{ width: `${Math.min(100, (elapsedMs / RECORD_MS) * 100)}%` }}
                                />
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
                                <span>
                                    {fill(t('voice.remaining'), {
                                        n: Math.max(0, Math.ceil((RECORD_MS - elapsedMs) / 1000)),
                                    })}
                                </span>
                                <span aria-hidden="true">
                                    {liveHz ? fill(t('voice.live_hz'), { hz: Math.round(liveHz) }) : '—'}
                                </span>
                            </div>
                            <div
                                className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--surface-muted)]"
                                aria-label={t('voice.level')}
                                aria-hidden="true"
                            >
                                <div
                                    className="h-full rounded-full bg-[var(--accent-subtle)]"
                                    style={{ width: `${Math.min(100, level * 300)}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {status === 'analyzing' && (
                        <p className="mt-3 text-xs text-[var(--text-muted)]">{t('voice.analyzing')}</p>
                    )}

                    {status === 'error' && errorKey && (
                        <div className="mt-4">
                            <p role="alert" className="text-sm leading-6 text-[var(--danger)]">
                                {t(errorKey)}
                            </p>
                            <button
                                type="button"
                                onClick={startRecording}
                                className="btn-secondary mt-3 w-full tap-target"
                            >
                                {t('voice.result.retry')}
                            </button>
                        </div>
                    )}

                    <p className="sr-only" aria-live="polite">
                        {status === 'recording'
                            ? t('voice.recording')
                            : status === 'analyzing'
                              ? t('voice.analyzing')
                              : ''}
                    </p>
                </div>

                {result && (
                    <div className={card} aria-live="polite">
                        <p className="text-xs font-medium text-[var(--text-muted)]">{t('voice.result.title')}</p>
                        <div className="mt-2 flex items-end gap-3">
                            <span className="text-5xl font-semibold tabular-nums leading-none text-[var(--text)]">
                                {scoreText}
                            </span>
                            <span className="pb-1 text-sm font-medium text-[var(--accent-ink)]">{t(bucketKey)}</span>
                        </div>
                        <p className="mt-3 text-sm text-[var(--text-muted)]">
                            {fill(t('voice.result.median'), { hz: Math.round(result.medianF0) })}
                            {' · '}
                            {fill(t('voice.result.range'), {
                                low: Math.round(result.p5),
                                high: Math.round(result.p95),
                            })}
                        </p>

                        <div className="relative mt-5 h-2 rounded-full bg-gradient-to-r from-[var(--surface-muted)] via-[var(--accent-subtle)] to-[var(--accent)]">
                            <span
                                className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-[var(--surface)] bg-[var(--accent)]"
                                style={{ left: `calc(${(result.score + 100) / 2}% - 8px)` }}
                            />
                        </div>
                        <div className="mt-1 flex justify-between text-[0.6875rem] text-[var(--text-muted)]">
                            <span>{t('voice.axis.far')}</span>
                            <span>{t('voice.axis.near')}</span>
                        </div>
                        <p className="mt-2 text-xs text-[var(--text-muted)]">
                            {mode === 'transfem' ? t('voice.axis.higher') : t('voice.axis.lower')}
                        </p>
                        {saveFailed && (
                            <p className="mt-3 text-xs leading-5 text-[var(--warning)]">{t('voice.save_failed')}</p>
                        )}
                    </div>
                )}

                <div className={card}>
                    <h2 className="text-sm font-semibold text-[var(--text)]">{t('voice.history.title')}</h2>
                    {chartHistory.length === 0 ? (
                        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{t('voice.history.empty')}</p>
                    ) : (
                        <>
                            <svg
                                viewBox="0 0 320 96"
                                className="mt-4 h-24 w-full"
                                role="img"
                                aria-label={t('voice.history.title')}
                            >
                                <line x1="16" y1="48" x2="304" y2="48" stroke="var(--border)" strokeDasharray="3 4" />
                                {chartHistory.length > 1 && (
                                    <polyline
                                        points={chartPoints}
                                        fill="none"
                                        stroke="var(--accent)"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                )}
                                {chartHistory.map((c, i) => {
                                    const x =
                                        chartHistory.length === 1 ? 160 : 16 + (i * 288) / (chartHistory.length - 1);
                                    const y = 12 + ((100 - c.score) / 200) * 72;
                                    return <circle key={c.id} cx={x} cy={y} r={2.5} fill="var(--accent)" />;
                                })}
                            </svg>
                            <div className="mt-3 divide-y divide-[var(--border)]">
                                {chartHistory
                                    .slice()
                                    .reverse()
                                    .map(c => (
                                        <div
                                            key={c.id}
                                            className="flex items-center justify-between gap-3 py-2 text-xs text-[var(--text-muted)] tabular-nums"
                                        >
                                            <span>
                                                {fill(t('voice.history.date_score'), {
                                                    date: new Date(c.at).toLocaleDateString(lang, {
                                                        month: 'short',
                                                        day: 'numeric',
                                                    }),
                                                    score: c.score > 0 ? `+${c.score}` : c.score,
                                                    hz: Math.round(c.medianF0),
                                                })}
                                            </span>
                                        </div>
                                    ))}
                            </div>
                        </>
                    )}
                </div>

                <div className="space-y-4 pb-8">
                    <p className="text-xs leading-6 text-[var(--text-muted)]">{t('voice.disclaimer')}</p>
                    <details className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
                        <summary className="cursor-pointer text-sm font-medium text-[var(--text)]">
                            {t('voice.evidence.title')}
                        </summary>
                        <ul className="mt-3 space-y-1.5 text-xs leading-5 text-[var(--text-muted)]">
                            <li>
                                <a
                                    className="underline underline-offset-2"
                                    href="https://pubmed.ncbi.nlm.nih.gov/36371270/"
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    Boogers 2022 · PMID 36371270
                                </a>
                            </li>
                            <li>
                                <a
                                    className="underline underline-offset-2"
                                    href="https://pubmed.ncbi.nlm.nih.gov/30503396/"
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    Hardy 2020 · PMID 30503396
                                </a>
                            </li>
                            <li>
                                <a
                                    className="underline underline-offset-2"
                                    href="https://pubmed.ncbi.nlm.nih.gov/26678122/"
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    Nygren 2016 · PMID 26678122
                                </a>
                            </li>
                            <li>
                                <a
                                    className="underline underline-offset-2"
                                    href="https://pubmed.ncbi.nlm.nih.gov/32104050/"
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    Kim 2020 · PMID 32104050
                                </a>
                            </li>
                            <li>
                                <a
                                    className="underline underline-offset-2"
                                    href="https://pubmed.ncbi.nlm.nih.gov/35382956/"
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    Bush 2024 · PMID 35382956
                                </a>
                            </li>
                        </ul>
                    </details>
                    <button type="button" onClick={handleClear} className="btn-ghost tap-target text-[var(--danger)]">
                        {t('voice.clear')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Voice;
