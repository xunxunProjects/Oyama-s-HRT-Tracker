import React, { useState, useEffect } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { LabResult } from '../../logic';
import { X } from 'lucide-react';
import LabResultForm from './LabResultForm';
import { useEscape } from '../hooks/useEscape';

interface LabResultModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (result: LabResult) => void;
    onDelete?: (id: string) => void;
    resultToEdit?: LabResult | null;
}

const LabResultModal = ({ isOpen, onClose, onSave, onDelete, resultToEdit }: LabResultModalProps) => {
    const { t } = useTranslation();
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (isOpen) setIsVisible(true);
    }, [isOpen]);

    const handleClose = () => {
        setIsVisible(false);
        onClose();
    };

    useEscape(() => {
        if (!document.querySelector('.z-\\[70\\]')) {
            handleClose();
        }
    }, isOpen);

    if (!isVisible && !isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center z-50">
            <div className="bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] rounded-t-[var(--radius-xl)] md:rounded-[var(--radius-xl)] shadow-[var(--shadow-m3-3)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] md:max-h-[85vh]">

                {/* Header */}
                <div className="px-6 py-4 border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] flex items-center justify-between shrink-0">
                    <h2 className="text-base font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">
                        {resultToEdit ? t('lab.edit_title') : t('lab.add_title')}
                    </h2>
                    <button onClick={handleClose} className="p-1.5 hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container-high)] rounded-lg">
                        <X size={18} className="text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]" />
                    </button>
                </div>

                <div className="flex-1 overflow-hidden">
                    <LabResultForm
                        resultToEdit={resultToEdit}
                        onSave={(res) => {
                            onSave(res);
                            handleClose();
                        }}
                        onCancel={handleClose}
                        onDelete={(id) => {
                            if (onDelete) {
                                onDelete(id);
                                handleClose();
                            }
                        }}
                    />
                </div>
            </div>
        </div>
    );
};

export default LabResultModal;
