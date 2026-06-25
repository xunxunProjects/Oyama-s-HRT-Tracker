import React, { useState, useEffect } from 'react';
import DoseForm, { DoseTemplate } from './DoseForm';
import { QuickDose } from './dose_form/QuickDoseButtons';
import { useEscape } from '../hooks/useEscape';

export type { DoseTemplate, QuickDose };

interface DoseFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    eventToEdit?: any;
    onSave?: any;
    onDelete?: any;
    templates?: DoseTemplate[];
    onSaveTemplate?: any;
    onDeleteTemplate?: any;
    quickDoses?: QuickDose[];
    onAddQuickDose?: (dose: QuickDose) => void;
    onDeleteQuickDose?: (id: string) => void;
}

const DoseFormModal: React.FC<DoseFormModalProps> = ({
    isOpen,
    onClose,
    eventToEdit,
    onSave,
    onDelete,
    templates = [],
    onSaveTemplate,
    onDeleteTemplate,
    quickDoses = [],
    onAddQuickDose,
    onDeleteQuickDose
}) => {
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

    const handleSave = (event: any) => {
        if (onSave) {
            onSave(event);
        }
        handleClose();
    };

    if (!isVisible && !isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-shell modal-shell-wide">
            <div className="modal-card overflow-hidden p-0 w-full max-w-lg md:max-w-xl h-[92vh] md:max-h-[85vh] flex flex-col">

                <DoseForm
                    eventToEdit={eventToEdit}
                    onSave={handleSave}
                    onDelete={onDelete}
                    onCancel={handleClose}
                    templates={templates}
                    onSaveTemplate={onSaveTemplate}
                    onDeleteTemplate={onDeleteTemplate}
                    quickDoses={quickDoses}
                    onAddQuickDose={onAddQuickDose}
                    onDeleteQuickDose={onDeleteQuickDose}
                    isInline={false}
                />
            </div>
            </div>
        </div>
    );
};

export default DoseFormModal;
