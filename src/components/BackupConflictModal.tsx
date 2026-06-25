import React from 'react';
import { Merge, SkipForward } from 'lucide-react';
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
                    </div>

                    <div className="flex gap-2">
                        <button onClick={onClose} className="btn-secondary flex-1">
                            <SkipForward size={15} />
                            {t('backup.conflict_skip')}
                        </button>
                        <button onClick={handleMerge} className="btn-primary flex-1">
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
