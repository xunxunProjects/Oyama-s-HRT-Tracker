import React, { useState, useEffect } from 'react';
import DoseForm, { DoseTemplate } from './DoseForm';
import { useEscape } from '../hooks/useEscape';

export type { DoseTemplate };

interface DoseFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    eventToEdit?: any;
    onSave?: any;
    onDelete?: any;
    templates?: DoseTemplate[];
    onSaveTemplate?: any;
    onDeleteTemplate?: any;
}

const DoseFormModal: React.FC<DoseFormModalProps> = ({
    isOpen,
    onClose,
    eventToEdit,
    onSave,
    onDelete,
    templates = [],
    onSaveTemplate,
    onDeleteTemplate
}) => {
    const [isVisible, setIsVisible] = useState(false);
    const [isClosing, setIsClosing] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setIsVisible(true);
            setIsClosing(false);
        }
    }, [isOpen]);

    const handleClose = () => {
        setIsClosing(true);
        setTimeout(() => {
            setIsVisible(false);
            setIsClosing(false);
            onClose();
        }, 250); // Match the animation duration
    };

    useEscape(() => {
        // Prevent closing if DatePicker (z-[70]) is open
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
        <div className={`fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-50 ${isClosing ? 'animate-out fade-out duration-200' : 'animate-in fade-in duration-200'}`}>
            <div className={`bg-white dark:bg-zinc-900 rounded-t-[32px] md:rounded-[24px] shadow-xl w-full max-w-lg md:max-w-xl h-[92vh] md:max-h-[85vh] flex flex-col overflow-hidden transition-colors duration-300 ${isClosing ? 'animate-out slide-out-to-bottom duration-250' : 'animate-in slide-in-from-bottom duration-300'}`}>
                <DoseForm
                    eventToEdit={eventToEdit}
                    onSave={handleSave}
                    onDelete={onDelete}
                    onCancel={handleClose}
                    templates={templates}
                    onSaveTemplate={onSaveTemplate}
                    onDeleteTemplate={onDeleteTemplate}
                    isInline={false}
                />
            </div>
        </div>
    );
};

export default DoseFormModal;
