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
        <div className="modal-overlay">
            <div className="modal-shell">
            <div className="modal-card overflow-hidden p-0 w-full max-w-lg flex flex-col max-h-[90vh] md:max-h-[85vh]">

                {/* Header */}
                <div className="px-5 py-3 border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] flex items-center justify-between shrink-0">
                    <h2 className="text-[15px] font-semibold text-body">
                        {resultToEdit ? t('lab.edit_title') : t('lab.add_title')}
                    </h2>
                    <button onClick={handleClose} className="p-1 text-muted hover:text-body">
                        <X size={18} />
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
        </div>
    );
};

export default LabResultModal;
