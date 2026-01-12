import React, { useState, useEffect } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { LabResult } from '../../logic';
import { X, FlaskConical } from 'lucide-react';
import LabResultForm from './LabResultForm';

interface LabResultModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (result: LabResult) => void;
    onDelete?: (id: string) => void;
    resultToEdit?: LabResult | null;
}

const LabResultModal = ({ isOpen, onClose, onSave, onDelete, resultToEdit }: LabResultModalProps) => {
    const { t } = useTranslation();

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-50 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-900 rounded-t-3xl md:rounded-3xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] md:max-h-[85vh] animate-in slide-in-from-bottom duration-300 transition-colors duration-300">

                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-white dark:bg-gray-900 shrink-0 transition-colors duration-300">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <FlaskConical className="text-teal-500" size={20} />
                        {resultToEdit ? t('lab.edit_title') : t('lab.add_title')}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                        <X size={20} className="text-gray-500 dark:text-gray-400" />
                    </button>
                </div>

                <div className="flex-1 overflow-hidden">
                    <LabResultForm
                        resultToEdit={resultToEdit}
                        onSave={(res) => {
                            onSave(res);
                            onClose();
                        }}
                        onCancel={onClose}
                        onDelete={(id) => {
                            if (onDelete) {
                                onDelete(id);
                                onClose();
                            }
                        }}
                    />
                </div>
            </div>
        </div>
    );
};

export default LabResultModal;
