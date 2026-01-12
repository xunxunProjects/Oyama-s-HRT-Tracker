import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import jsQR from 'jsqr';
import { X, QrCode, Activity, ImageIcon, Upload } from 'lucide-react';

const ImportModal = ({ isOpen, onClose, onImportJson }: { isOpen: boolean; onClose: () => void; onImportJson: (text: string) => boolean }) => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<'qr' | 'json'>('qr');
    const [text, setText] = useState("");
    const [errorMsg, setErrorMsg] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const qrFileInputRef = useRef<HTMLInputElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (isOpen) {
            setText("");
            setErrorMsg("");
            setActiveTab('qr');
        }
    }, [isOpen]);

    const handleJsonFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const content = reader.result as string;
            if (onImportJson(content)) {
                onClose();
            }
        };
        reader.readAsText(file);
        e.target.value = "";
    };

    const handleTextImport = () => {
        if (onImportJson(text)) {
            onClose();
        }
    };

    const handleQrImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setErrorMsg('');
        const reader = new FileReader();
        reader.onload = () => {
            const img = new window.Image();
            img.onload = () => {
                const canvas = canvasRef.current;
                const ctx = canvas?.getContext('2d');
                if (!canvas || !ctx) return;
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, canvas.width, canvas.height);
                if (code?.data) {
                    if (onImportJson(code.data)) {
                        onClose();
                    }
                } else {
                    setErrorMsg(t('qr.error.decode'));
                }
            };
            img.onerror = () => setErrorMsg(t('qr.error.decode'));
            img.src = reader.result as string;
        };
        reader.readAsDataURL(file);
        e.target.value = "";
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-50 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-900 rounded-t-3xl md:rounded-3xl shadow-md shadow-gray-900/10 w-full max-w-lg md:max-w-2xl p-6 md:p-8 flex flex-col max-h-[90vh] animate-in slide-in-from-bottom duration-300 safe-area-pb transition-colors duration-300">
                <div className="flex justify-between items-center mb-6 shrink-0">
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{t('import.title')}</h3>
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
                        <Activity size={16} />
                        JSON
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0">
                    {activeTab === 'qr' && (
                        <div className="space-y-4">
                            <div className="p-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl flex flex-col items-center justify-center text-center hover:bg-gray-50 dark:hover:bg-gray-800/50 transition cursor-pointer" onClick={() => qrFileInputRef.current?.click()}>
                                <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 text-blue-500 rounded-full flex items-center justify-center mb-4">
                                    <ImageIcon size={32} />
                                </div>
                                <p className="text-sm font-bold text-gray-900 dark:text-white">{t('qr.import.file')}</p>
                                <p className="text-xs text-gray-400 mt-1">{t('qr.upload.hint')}</p>
                            </div>
                            <input type="file" accept="image/*" ref={qrFileInputRef} onChange={handleQrImageUpload} className="hidden" />

                            {errorMsg && (
                                <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-500 text-xs font-bold rounded-xl text-center">
                                    {errorMsg}
                                </div>
                            )}
                            <canvas ref={canvasRef} className="hidden" />
                        </div>
                    )}

                    {activeTab === 'json' && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">{t('import.text')}</label>
                                <textarea
                                    className="w-full h-32 p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-pink-300 outline-none font-mono text-xs text-gray-900 dark:text-white"
                                    placeholder={t('import.paste_hint')}
                                    value={text}
                                    onChange={e => setText(e.target.value)}
                                />
                                <button
                                    onClick={handleTextImport}
                                    disabled={!text.trim()}
                                    className="mt-2 w-full py-3 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-bold rounded-xl hover:bg-gray-800 dark:hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
                                >
                                    {t('drawer.import')}
                                </button>
                            </div>

                            <div className="relative flex py-2 items-center">
                                <div className="flex-grow border-t border-gray-200 dark:border-gray-700"></div>
                                <span className="flex-shrink-0 mx-4 text-gray-400 text-xs uppercase font-bold">OR</span>
                                <div className="flex-grow border-t border-gray-200 dark:border-gray-700"></div>
                            </div>

                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 font-bold rounded-xl hover:border-pink-300 dark:hover:border-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/10 hover:text-pink-500 transition flex items-center justify-center gap-2"
                            >
                                <Upload size={20} />
                                {t('import.file_btn')}
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="application/json"
                                className="hidden"
                                onChange={handleJsonFileChange}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ImportModal;
