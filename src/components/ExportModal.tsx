import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { QRCodeCanvas } from 'qrcode.react';
import { encryptData, DoseEvent, LabResult } from '../../logic';
import { X, QrCode, Download, Lock, Copy } from 'lucide-react';

const ExportModal = ({ isOpen, onClose, onExport, events, labResults, weight }: { isOpen: boolean, onClose: () => void, onExport: (encrypt: boolean) => void, events: DoseEvent[], labResults: LabResult[], weight: number }) => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<'qr' | 'json'>('qr');
    const [isEncrypted, setIsEncrypted] = useState(false);
    const [displayData, setDisplayData] = useState("");
    const [password, setPassword] = useState("");
    const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');

    const hasData = events.length > 0 || labResults.length > 0;
    const rawDataString = useMemo(() => hasData ? JSON.stringify({ weight, events, labResults }) : '', [events, weight, labResults, hasData]);
    const QR_CHAR_LIMIT = 1500; // guard against oversized payloads that crash QR generator
    const isTooLargeForQr = displayData.length > QR_CHAR_LIMIT;

    useEffect(() => {
        if (!isOpen) {
            setIsEncrypted(false);
            setActiveTab('qr');
        }
    }, [isOpen]);

    useEffect(() => {
        let active = true;
        const update = async () => {
            if (!isOpen || !rawDataString) {
                if (active) setDisplayData("");
                return;
            }
            if (isEncrypted) {
                const { data, password: pw } = await encryptData(rawDataString);
                if (active) {
                    setDisplayData(data);
                    setPassword(pw);
                }
            } else {
                if (active) {
                    setDisplayData(rawDataString);
                    setPassword("");
                }
            }
        };
        update();
        return () => { active = false; };
    }, [isOpen, isEncrypted, rawDataString]);

    const handleCopy = async () => {
        if (!displayData) return;
        try {
            await navigator.clipboard.writeText(displayData);
            setCopyState('copied');
            setTimeout(() => setCopyState('idle'), 2000);
        } catch (err) {
            console.error(err);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-50 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-900 rounded-t-3xl md:rounded-3xl shadow-md shadow-gray-900/10 w-full max-w-lg md:max-w-2xl p-6 md:p-8 flex flex-col max-h-[90vh] animate-in slide-in-from-bottom duration-300 safe-area-pb transition-colors duration-300">
                <div className="flex justify-between items-center mb-6 shrink-0">
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{t('export.title')}</h3>
                    <button onClick={onClose} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition">
                        <X size={20} className="text-gray-500 dark:text-gray-400" />
                    </button>
                </div>

                <div className="flex p-1 bg-gray-100 dark:bg-gray-800 rounded-xl mb-6 shrink-0 transition-colors">
                    <button
                        onClick={() => setActiveTab('qr')}
                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'qr' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
                    >
                        <QrCode size={16} />
                        QR Code
                    </button>
                    <button
                        onClick={() => setActiveTab('json')}
                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'json' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
                    >
                        <Download size={16} />
                        JSON
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0">
                    {activeTab === 'qr' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 p-3 rounded-xl transition-colors">
                                <label className="text-sm font-bold text-gray-700 dark:text-gray-300">{t('qr.encrypt_label')}</label>
                                <div
                                    className={`w-10 h-6 rounded-full p-1 cursor-pointer transition-colors ${isEncrypted ? 'bg-pink-400' : 'bg-gray-300 dark:bg-gray-600'}`}
                                    onClick={() => setIsEncrypted(!isEncrypted)}
                                >
                                    <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${isEncrypted ? 'translate-x-4' : ''}`} />
                                </div>
                            </div>

                            {displayData && !isTooLargeForQr ? (
                                <div className="flex flex-col items-center gap-4">
                                    <div className="bg-white p-4 rounded-2xl border border-gray-100 dark:border-gray-800 relative">
                                        <QRCodeCanvas value={displayData} size={200} includeMargin level="M" />
                                        {isEncrypted && (
                                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                <Lock className="text-pink-400/20 w-24 h-24" />
                                            </div>
                                        )}
                                    </div>

                                    {isEncrypted && password && (
                                        <div className="w-full bg-pink-50 dark:bg-pink-900/20 border border-pink-100 dark:border-pink-900/30 p-3 rounded-xl text-center">
                                            <p className="text-xs text-pink-400 font-bold uppercase mb-1">{t('export.password_title')}</p>
                                            <p className="font-mono font-bold text-gray-800 dark:text-gray-200 text-lg select-all">{password}</p>
                                        </div>
                                    )}

                                    <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-2">
                                        <button
                                            onClick={handleCopy}
                                            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-bold hover:bg-gray-800 dark:hover:bg-white/90 transition"
                                        >
                                            <Copy size={16} /> {copyState === 'copied' ? t('qr.copied') : t('qr.copy')}
                                        </button>
                                        <button
                                            onClick={() => onExport(isEncrypted)}
                                            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 text-sm font-bold hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition"
                                        >
                                            <Download size={16} /> {t('export.title')}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-8 text-gray-600 dark:text-gray-400 space-y-3">
                                    {isTooLargeForQr ? (
                                        <div className="mx-auto max-w-md text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
                                            <p className="text-base font-bold text-gray-900 dark:text-white">{t('qr.too_large')}</p>
                                            <p className="text-sm text-gray-700 dark:text-gray-300">{t('qr.too_large_desc') || t('drawer.save_hint')}</p>
                                            <div className="flex flex-col gap-2">
                                                <button
                                                    onClick={handleCopy}
                                                    className="inline-flex items-center justify-center px-3.5 py-2.5 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-bold hover:bg-gray-800 dark:hover:bg-white/90 transition"
                                                >
                                                    <Copy size={16} /> {copyState === 'copied' ? t('qr.copied') : t('qr.copy')}
                                                </button>
                                                <button
                                                    onClick={() => setActiveTab('json')}
                                                    className="inline-flex items-center justify-center px-3.5 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-800 dark:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600 transition"
                                                >
                                                    {t('qr.go_json')}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <p>{t('qr.export.empty')}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'json' && (
                        <div className="space-y-3">
                            <button onClick={() => onExport(false)} className="w-full py-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 font-bold rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition flex items-center justify-center gap-2">
                                <Download size={20} />
                                JSON
                            </button>
                            <button onClick={() => onExport(true)} className="w-full py-4 bg-pink-50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-900/30 text-pink-600 dark:text-pink-400 font-bold rounded-xl hover:bg-pink-100 dark:hover:bg-pink-900/40 hover:border-pink-300 dark:hover:border-pink-900/50 transition flex items-center justify-center gap-2">
                                <Lock size={20} />
                                JSON ({t('qr.encrypt_label')})
                            </button>
                            <p className="text-xs text-gray-400 text-center mt-4 leading-relaxed">
                                {t('drawer.save_hint')}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ExportModal;
