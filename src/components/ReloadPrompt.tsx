import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useDialog } from '../contexts/DialogContext';
import { useTranslation } from '../contexts/LanguageContext';

const ReloadPrompt: React.FC = () => {
    const { t } = useTranslation();
    const { showDialog } = useDialog();
    const {
        offlineReady: [offlineReady, setOfflineReady],
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegistered(r) {
            console.log('SW Registered: ' + r);
        },
        onRegisterError(error) {
            console.log('SW registration error', error);
        },
    });

    const close = () => {
        setOfflineReady(false);
        setNeedRefresh(false);
    };

    React.useEffect(() => {
        if (offlineReady) {
            showDialog('alert', t('pwa.offline_ready'), close);
        }
    }, [offlineReady, showDialog, t]);

    React.useEffect(() => {
        if (needRefresh) {
            showDialog('confirm', t('pwa.update_available'), () => {
                updateServiceWorker(true);
            });
        }
    }, [needRefresh, showDialog, t, updateServiceWorker]);

    // We don't render anything visible because we use the DialogContext
    return null;
};

export default ReloadPrompt;
