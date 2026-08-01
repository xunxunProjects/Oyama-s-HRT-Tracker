import React from 'react';
import { Merge, SkipForward } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';
import { useEscape } from '../hooks/useEscape';

interface BackupConflictModalProps {
    isOpen: boolean;
    onClose: () => void;
    cloudNewCount: number;
    localNewCount: number;
    /** Present on both sides under the same id but with different contents. */
    changedCount: number;
    /**
     * Whether merging would actually add anything. Merge only ever pulls
     * cloud -> local, so with nothing on the cloud this device lacks the button
     * is a no-op — offering it produced the "0 added" result people reported.
     */
    canMerge: boolean;
    onMerge: () => void;
}

const BackupConflictModal: React.FC<BackupConflictModalProps> = ({
    isOpen,
    onClose,
    cloudNewCount,
    localNewCount,
    changedCount,
    canMerge,
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
        <div className="modal-overlay">
            <div className="modal-shell">
                <div className="modal-card">
                    <h3 className="modal-title">{t('backup.conflict_title')}</h3>

                    <p className="text-sm text-muted leading-relaxed mb-4">
                        {t('backup.conflict_desc')}
                    </p>

                    <div className="callout mb-5 space-y-1.5">
                        {cloudNewCount > 0 && (
                            <div className="text-sm">
                                {(t('backup.conflict_cloud_new') as string).replace('{n}', String(cloudNewCount))}
                            </div>
                        )}
                        {localNewCount > 0 && (
                            <div className="text-sm">
                                {(t('backup.conflict_local_new') as string).replace('{n}', String(localNewCount))}
                            </div>
                        )}
                        {changedCount > 0 && (
                            <div className="text-sm">
                                {(t('backup.conflict_changed') as string).replace('{n}', String(changedCount))}
                            </div>
                        )}
                    </div>

                    {/* Merging only fills in records this device is missing; it never
                        overwrites one that already exists. Saying so matters most when
                        the only difference IS an edit, because then the merge button
                        genuinely does nothing and silence would look like a bug. */}
                    {changedCount > 0 && (
                        <p className="text-xs text-muted leading-relaxed mb-5 -mt-3">
                            {t('backup.conflict_changed_note')}
                        </p>
                    )}

                    <div className="flex gap-2">
                        <button onClick={onClose} className={canMerge ? 'btn-secondary flex-1' : 'btn-primary flex-1'}>
                            <SkipForward size={15} />
                            {canMerge ? t('backup.conflict_skip') : t('backup.conflict_dismiss')}
                        </button>
                        {canMerge && (
                            <button onClick={handleMerge} className="btn-primary flex-1">
                                <Merge size={15} />
                                {t('backup.conflict_merge')}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BackupConflictModal;
