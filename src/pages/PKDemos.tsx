import React, { useState } from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import Tabs from '../components/Tabs';
import { useTranslation } from '../contexts/LanguageContext';
import PKVisualization from './PKVisualization';
import PKCalculationSandbox from './PKCalculationSandbox';

type DemoTab = 'curve' | 'single';

/**
 * The two teaching pages behind one row of About: the simplified curve and
 * the single dose working, switched with tabs. Two rows made About a list of
 * ten.
 */
const PKDemos: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { t } = useTranslation();
    const [tab, setTab] = useState<DemoTab>('curve');
    return (
        <div className="md:pb-32">
            <PageHeader title={t('pk_demo.title')} onBack={onBack} />
            <div className={`${PAGE_COLUMN} mt-1`}>
                <Tabs<DemoTab>
                    tabs={[
                        { id: 'curve', label: t('pk_demo.tab.curve') },
                        { id: 'single', label: t('pk_demo.tab.single') },
                    ]}
                    value={tab}
                    onChange={setTab}
                />
                <div className="mt-5">{tab === 'curve' ? <PKVisualization /> : <PKCalculationSandbox />}</div>
            </div>
        </div>
    );
};

export default PKDemos;
