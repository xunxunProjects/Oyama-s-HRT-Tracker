import React from 'react';
import { CloudOff, Merge, SkipForward } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';
import { useEscape } from '../hooks/useEscape';

interface BackupConflictModalProps {
    isOpen: boolean;
    onClose: () => void;
    cloudNewCount: number;
    localNewCount: number;
    onMerge: () => void;
}

const BackupConflictModal: React.FC<BackupConflictModalProps> = ({
    isOpen,
    onClose,
    cloudNewCount,
    localNewCount,
    onMerge,
}) => {
    const { t } = useTranslation();

    useEscape(onClose, isOpen);

    if (!isOpen) return null;

    const handleMerge = () => {
        onMerge();
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
            <div className="w-full md:max-w-sm safe-area-pb">
                <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-t-2xl md:rounded-xl shadow-lg p-6 md:p-5">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-lg shrink-0">
                            <CloudOff size={20} />
                        </div>
                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                            {t('backup.conflict_title')}
                        </h3>
                    </div>

                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-4">
                        {t('backup.conflict_desc')}
                    </p>

                    <div className="bg-gray-50 dark:bg-neutral-800 rounded-lg p-3 mb-5 space-y-1.5 border border-gray-200 dark:border-neutral-700">
                        {cloudNewCount > 0 && (
                            <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                                {(t('backup.conflict_cloud_new') as string).replace('{n}', String(cloudNewCount))}
                            </div>
                        )}
                        {localNewCount > 0 && (
                            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                                {(t('backup.conflict_local_new') as string).replace('{n}', String(localNewCount))}
                            </div>
                        )}
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 py-3 md:py-2 text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-neutral-600 rounded-xl md:rounded-md flex items-center justify-center gap-1.5"
                        >
                            <SkipForward size={15} />
                            {t('backup.conflict_skip')}
                        </button>
                        <button
                            onClick={handleMerge}
                            className="flex-1 py-3 md:py-2 text-sm font-semibold text-white bg-[var(--color-m3-primary)] rounded-xl md:rounded-md flex items-center justify-center gap-1.5"
                        >
                            <Merge size={15} />
                            {t('backup.conflict_merge')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BackupConflictModal;
