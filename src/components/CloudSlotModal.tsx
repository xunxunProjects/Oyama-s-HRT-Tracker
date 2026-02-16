import React, { useState, useEffect } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { CloudBackup, cloudService } from '../services/cloud';
import { X, Cloud, Upload, Download, RefreshCw, Merge, ChevronRight, Plus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useEscape } from '../hooks/useEscape';
import { useDialog } from '../contexts/DialogContext';

interface CloudSlotModalProps {
    isOpen: boolean;
    onClose: () => void;
    mode: 'save' | 'load';
    onSave: (slot: string) => Promise<void>;
    onLoad: (backup: CloudBackup, merge: boolean) => Promise<void>;
}

const SLOTS = ['Slot 1', 'Slot 2', 'Slot 3', 'Slot 4', 'Slot 5', 'Auto-Backup'];

const CloudSlotModal: React.FC<CloudSlotModalProps> = ({ isOpen, onClose, mode, onSave, onLoad }) => {
    const { t } = useTranslation();
    const { token } = useAuth();
    const { showDialog } = useDialog();
    const [backups, setBackups] = useState<CloudBackup[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

    useEscape(onClose, isOpen);

    useEffect(() => {
        if (isOpen && token) {
            fetchBackups();
        }
    }, [isOpen, token]);

    const fetchBackups = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const list = await cloudService.load(token);
            setBackups(list);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const getBackupForSlot = (slot: string) => {
        // Find the latest backup for this slot
        return backups.filter(b => b.slot === slot).sort((a, b) => b.created_at - a.created_at)[0];
    };

    const handleSlotClick = (slot: string) => {
        setSelectedSlot(slot);
        if (mode === 'save') {
            // For save, we just confirm? or just do it? 
            // Let's ask via standard dialog in parent or just do it.
            // Parent implementation: await onSave(slot); onClose();
            // Maybe verify overwrite if slot exists
            const existing = getBackupForSlot(slot);
            if (existing) {
                showDialog('confirm', t('cloud.overwrite_confirm').replace('{slot}', slot), async () => {
                    await onSave(slot);
                    onClose();
                });
            } else {
                onSave(slot).then(onClose);
            }
        }
    };

    const handleLoadAction = (slot: string, merge: boolean) => {
        const backup = getBackupForSlot(slot);
        if (!backup) return;
        onLoad(backup, merge).then(onClose);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200 p-4">
            <div className="bg-[var(--color-m3-surface-container-high)] dark:bg-[var(--color-m3-dark-surface-container-high)] rounded-[var(--radius-xl)] shadow-[var(--shadow-m3-3)] w-full max-w-md flex flex-col max-h-[85vh] animate-m3-decelerate safe-area-pb transition-colors duration-300 overflow-hidden">

                {/* Header */}
                <div className="px-6 pt-6 pb-4 shrink-0 flex justify-between items-center border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]">
                    <div>
                        <h3 className="font-display text-lg font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] tracking-tight">
                            {mode === 'save' ? t('cloud.save_title') : t('cloud.load_title')}
                        </h3>
                        <p className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                            {mode === 'save' ? t('cloud.save_desc') : t('cloud.load_desc')}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-[var(--radius-full)] hover:bg-[var(--color-m3-surface-container-highest)] dark:hover:bg-[var(--color-m3-dark-surface-container-highest)] transition">
                        <X size={20} className="text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-3">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <RefreshCw className="animate-spin text-[var(--color-m3-primary)]" />
                        </div>
                    ) : (
                        SLOTS.map(slot => {
                            const backup = getBackupForSlot(slot);
                            return (
                                <div key={slot} className="group relative bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container-low)] rounded-[var(--radius-lg)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] p-4 hover:border-[var(--color-m3-primary)] dark:hover:border-[var(--color-m3-primary)] transition-all">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-2">
                                            <Cloud size={18} className={backup ? "text-[var(--color-m3-primary)]" : "text-[var(--color-m3-outline)]"} />
                                            <span className="font-bold text-sm text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">{slot}</span>
                                        </div>
                                        {backup && (
                                            <span className="text-[10px] bg-[var(--color-m3-surface-variant)] dark:bg-[var(--color-m3-dark-surface-variant)] px-2 py-0.5 rounded-full text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                                                {new Date(backup.created_at * 1000).toLocaleDateString()}
                                            </span>
                                        )}
                                    </div>

                                    {backup ? (
                                        <div className="space-y-1">
                                            <p className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                                                {new Date(backup.created_at * 1000).toLocaleTimeString()}
                                            </p>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-[var(--color-m3-outline)] italic">{t('cloud.empty_slot')}</p>
                                    )}

                                    {/* Actions Overlay / Buttons */}
                                    <div className="mt-4 flex gap-2 justify-end">
                                        {mode === 'save' ? (
                                            <button
                                                onClick={() => handleSlotClick(slot)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--color-m3-primary-container)] text-[var(--color-m3-on-primary-container)] text-xs font-bold hover:opacity-80 transition"
                                            >
                                                <Upload size={14} />
                                                {t('cloud.save')}
                                            </button>
                                        ) : (
                                            backup ? (
                                                <>
                                                    <button
                                                        onClick={() => handleLoadAction(slot, true)}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--color-m3-secondary-container)] text-[var(--color-m3-on-secondary-container)] text-xs font-bold hover:opacity-80 transition"
                                                    >
                                                        <Merge size={14} />
                                                        {t('cloud.merge')}
                                                    </button>
                                                    <button
                                                        onClick={() => handleLoadAction(slot, false)}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--color-m3-tertiary-container)] text-[var(--color-m3-on-tertiary-container)] text-xs font-bold hover:opacity-80 transition"
                                                    >
                                                        <Download size={14} />
                                                        {t('cloud.overwrite')}
                                                    </button>

                                                </>
                                            ) : (
                                                <span className="text-xs text-[var(--color-m3-outline)] py-1.5 px-2">{t('cloud.no_data')}</span>
                                            )
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};

export default CloudSlotModal;
