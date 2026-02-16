import React, { useState, useEffect, useRef, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import getCroppedImg from '../utils/cropImage';
import { X, Check } from 'lucide-react';

interface AvatarUploadProps {
    username: string;
    token: string;
    onUploadSuccess?: () => void;
}

export const AvatarUpload: React.FC<AvatarUploadProps> = ({ username, token, onUploadSuccess }) => {
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Cropping State
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
    const [isCropModalOpen, setIsCropModalOpen] = useState(false);

    const [cacheBuster, setCacheBuster] = useState('');
    const [imageError, setImageError] = useState(false);
    const [isImageLoaded, setIsImageLoaded] = useState(false);

    // Construct URL directly - no async fetch delay
    const avatarUrl = `/api/user/avatar/${username}${cacheBuster ? `?t=${cacheBuster}` : ''}`;

    // Removed useEffect for initial avatar fetch as it's now handled by img onError/onLoad

    const onCropComplete = useCallback((croppedArea: any, croppedAreaPixels: any) => {
        setCroppedAreaPixels(croppedAreaPixels);
    }, []);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            if (file.size > 5 * 1024 * 1024) {
                setError('File size must be less than 5MB');
                return;
            }
            if (!['image/jpeg', 'image/png'].includes(file.type)) {
                setError('Only JPEG and PNG images are allowed');
                return;
            }

            const reader = new FileReader();
            reader.addEventListener('load', () => {
                setImageSrc(reader.result?.toString() || null);
                setIsCropModalOpen(true);
                setError(null);
            });
            reader.readAsDataURL(file);
        }
    };

    const handleUpload = async () => {
        if (!imageSrc || !croppedAreaPixels) return;

        setIsUploading(true);
        try {
            const croppedImageBlob = await getCroppedImg(imageSrc, croppedAreaPixels);

            if (!croppedImageBlob) throw new Error('Failed to crop image');

            const res = await fetch('/api/user/avatar', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'image/jpeg',
                },
                body: croppedImageBlob,
            });

            if (!res.ok) throw new Error(await res.text());

            // Force refresh using timestamp
            setCacheBuster(Date.now().toString());
            setImageError(false);
            setIsImageLoaded(false); // Reset to show loading state if needed

            setIsCropModalOpen(false);
            setImageSrc(null);
            if (onUploadSuccess) onUploadSuccess();

        } catch (err: any) {
            setError(err.message || 'Failed to upload avatar');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <div className="flex flex-col items-center gap-4">
            <button
                type="button"
                className="relative group w-32 h-32 rounded-full overflow-hidden border-4 border-white shadow-lg cursor-pointer bg-gray-200 dark:border-zinc-700 focus:outline-none focus:ring-4 focus:ring-indigo-500/50"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Change avatar"
            >
                {/* Always try to render image, hide if error */}
                <img
                    src={avatarUrl}
                    alt={`${username}'s avatar`}
                    className={`w-full h-full object-cover absolute inset-0 z-10 ${imageError ? 'hidden' : 'block'}`}
                    onLoad={() => setImageError(false)}
                    onError={() => setImageError(true)}
                />

                {/* Fallback visible underneath or when image is transparent/hidden */}
                <div className="w-full h-full flex items-center justify-center text-4xl text-gray-400 dark:text-gray-500 font-bold bg-gray-100 dark:bg-zinc-800 absolute inset-0">
                    {username.charAt(0).toUpperCase()}
                </div>

                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-200 flex items-center justify-center z-20">
                    <span className="text-white opacity-0 group-hover:opacity-100 font-medium text-sm bg-black/50 px-2 py-1 rounded">
                        Change
                    </span>
                </div>
            </button>

            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/jpeg,image/png"
                className="hidden"
            />

            {isUploading && <p className="text-sm text-blue-500">Uploading...</p>}
            {error && <p className="text-sm text-red-500">{error}</p>}

            {/* Crop Modal */}
            {isCropModalOpen && imageSrc && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
                            <h3 className="font-bold text-lg">Crop Avatar</h3>
                            <button onClick={() => setIsCropModalOpen(false)} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="relative h-64 w-full bg-zinc-900">
                            <Cropper
                                image={imageSrc}
                                crop={crop}
                                zoom={zoom}
                                aspect={1}
                                onCropChange={setCrop}
                                onCropComplete={onCropComplete}
                                onZoomChange={setZoom}
                                showGrid={false}
                            />
                        </div>

                        <div className="p-4 space-y-4">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-medium">Zoom</span>
                                <input
                                    type="range"
                                    value={zoom}
                                    min={1}
                                    max={3}
                                    step={0.1}
                                    aria-labelledby="Zoom"
                                    onChange={(e) => setZoom(Number(e.target.value))}
                                    className="w-full accent-indigo-600 h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setIsCropModalOpen(false)}
                                    className="flex-1 py-2.5 rounded-xl font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleUpload}
                                    disabled={isUploading}
                                    className="flex-1 py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                                >
                                    {isUploading ? 'Saving...' : <><Check size={18} /> Save Avatar</>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
