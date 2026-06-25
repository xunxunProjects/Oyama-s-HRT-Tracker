import { createPortal } from 'react-dom';
import React from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { useEscape } from '../hooks/useEscape';

const EstimateInfoModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
    const { t } = useTranslation();

    useEscape(onClose, isOpen);

    if (!isOpen) return null;

    return createPortal(
        <div className="modal-overlay z-[60]">
            <div className="modal-shell">
                <div className="modal-card">
                    <h3 className="modal-title">{t('modal.estimate.title')}</h3>

                    <div className="text-sm text-muted space-y-3 mb-5 leading-relaxed">
                        <p>{t('modal.estimate.p1')}</p>
                        <p className="callout text-body font-medium">
                            {t('modal.estimate.p2')}
                        </p>
                        <p>{t('modal.estimate.p3')}</p>
                        <p className="text-xs pt-1">
                            {t('modal.estimate.source')}{' '}
                            <a
                                href="https://transfemscience.org"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[var(--color-m3-primary)] dark:text-[var(--color-m3-primary-light)] underline underline-offset-2"
                            >
                                transfemscience.org
                            </a>
                        </p>
                    </div>

                    <button onClick={onClose} className="btn-primary w-full">
                        {t('btn.ok')}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default EstimateInfoModal;
