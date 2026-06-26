import React, { useState, useRef, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { ArrowLeft, ImagePlus, Check } from 'lucide-react';
import getCroppedImg from '../utils/cropImage';
import { useTranslation } from '../contexts/LanguageContext';
import { apiFetch } from '../services/apiClient';

const EditAvatar: React.FC<{ username: string; token: string; onBack: () => void }> = ({ username, token, onBack }) => {
    const { t } = useTranslation();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [avatarError, setAvatarError] = useState(false);
    const [cacheBuster] = useState(() => Date.now());

    const avatarUrl = `/api/user/avatar/${username}?t=${cacheBuster}`;
    const on = 'text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]';
    const muted = 'text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]';

    const onCropComplete = useCallback((_a: any, pixels: any) => setCroppedAreaPixels(pixels), []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        if (file.size > 5 * 1024 * 1024) { setError(t('avatar.error_size')); return; }
        if (!['image/jpeg', 'image/png'].includes(file.type)) { setError(t('avatar.error_type')); return; }
        const reader = new FileReader();
        reader.addEventListener('load', () => {
            setImageSrc(reader.result?.toString() || null);
            setZoom(1);
            setCrop({ x: 0, y: 0 });
            setError(null);
        });
        reader.readAsDataURL(file);
    };

    const resetPicker = () => {
        setImageSrc(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleUpload = async () => {
        if (!imageSrc || !croppedAreaPixels) return;
        setIsUploading(true);
        try {
            const blob = await getCroppedImg(imageSrc, croppedAreaPixels);
            if (!blob) throw new Error('Failed to crop image');
            const res = await apiFetch('/api/user/avatar', {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'image/jpeg' },
                body: blob,
            });
            if (!res.ok) throw new Error(await res.text());
            onBack();
        } catch (err: any) {
            setError(err.message || 'Failed to upload avatar');
            setIsUploading(false);
        }
    };

    return (
        <div className="relative pb-32">
            <div className="sticky top-0 z-20 bg-[var(--color-m3-surface-dim)] dark:bg-[var(--color-m3-dark-surface)] px-6 md:px-8 pt-8 pb-3">
                <button
                    onClick={onBack}
                    className="flex items-center gap-3 -ml-2 px-2 py-1.5 rounded-lg hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)]"
                >
                    <ArrowLeft size={18} className={`${muted} shrink-0`} />
                    <span className={`text-xl font-semibold ${on}`}>{t('avatar.title')}</span>
                </button>
            </div>

            <div className="px-6 md:px-8 mt-4 max-w-md space-y-5">
                {error && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg">
                        {error}
                    </div>
                )}

                {!imageSrc ? (
                    <div className="flex flex-col items-center gap-6 py-4">
                        <div className="w-36 h-36 rounded-full overflow-hidden relative bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container)]">
                            <img
                                src={avatarUrl}
                                alt={username}
                                className={`w-full h-full object-cover absolute inset-0 z-10 ${avatarError ? 'hidden' : 'block'}`}
                                onError={() => setAvatarError(true)}
                            />
                            <div className={`w-full h-full flex items-center justify-center text-5xl font-light absolute inset-0 ${muted}`}>
                                {username.charAt(0).toUpperCase()}
                            </div>
                        </div>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] text-[var(--color-m3-primary)] dark:text-[var(--color-m3-primary-light)] hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)] transition-colors"
                        >
                            <ImagePlus size={16} />
                            {t('avatar.change')}
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="relative h-72 w-full rounded-xl overflow-hidden bg-[var(--color-m3-dark-surface-dim)]">
                            <Cropper
                                image={imageSrc}
                                crop={crop}
                                zoom={zoom}
                                aspect={1}
                                cropShape="round"
                                onCropChange={setCrop}
                                onCropComplete={onCropComplete}
                                onZoomChange={setZoom}
                                showGrid={false}
                            />
                        </div>

                        <div className="flex items-center gap-3">
                            <span className={`text-xs font-medium shrink-0 ${muted}`}>{t('avatar.zoom')}</span>
                            <input
                                type="range"
                                value={zoom}
                                min={1}
                                max={3}
                                step={0.1}
                                aria-label={t('avatar.zoom')}
                                onChange={(e) => setZoom(Number(e.target.value))}
                                className="w-full h-1 rounded-lg appearance-none cursor-pointer bg-[var(--color-m3-surface-container-high)] dark:bg-[var(--color-m3-dark-surface-container-high)] accent-[var(--color-m3-primary)]"
                            />
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={resetPicker}
                                className="flex-1 py-3 rounded-lg font-medium text-sm text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)] transition-colors"
                            >
                                {t('btn.cancel')}
                            </button>
                            <button
                                onClick={handleUpload}
                                disabled={isUploading}
                                className="flex-1 py-3 rounded-lg font-medium text-sm text-white bg-[var(--color-m3-primary)] hover:bg-[var(--color-m3-primary-light)] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                            >
                                {isUploading ? '…' : <><Check size={16} /> {t('btn.save')}</>}
                            </button>
                        </div>
                    </>
                )}

                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/jpeg,image/png"
                    className="hidden"
                />
            </div>
        </div>
    );
};

export default EditAvatar;
