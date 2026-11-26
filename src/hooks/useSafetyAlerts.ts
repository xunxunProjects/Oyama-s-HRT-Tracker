import { useEffect, useMemo, useState } from 'react';
import {
    evaluateSafety,
    selectModalAlert,
    type DoseEvent,
    type LabResult,
    type SafetyAlert,
    type SimulationResult,
} from '../../logic';
import { useAuth } from '../contexts/AuthContext';
import {
    dismissSafetyAlert,
    loadSafetyDismissed,
    loadSafetyEnabled,
    saveSafetyEnabled,
} from '../utils/safetyState';

export function useSafetyAlerts({
    events,
    simulation,
    labResults,
    providedNowH,
}: {
    events: DoseEvent[];
    simulation: SimulationResult | null;
    labResults: LabResult[];
    providedNowH?: number;
}) {
    const { user } = useAuth();
    const owner = user?.id ?? 'local';
    const nowH = useMemo(
        () => providedNowH ?? Math.floor(Date.now() / 3_600_000),
        [providedNowH, events, simulation, labResults],
    );
    const [enabled, setEnabledState] = useState(() => loadSafetyEnabled(localStorage, owner));
    const [dismissed, setDismissed] = useState(() => loadSafetyDismissed(localStorage, owner));
    const [activeAlert, setActiveAlert] = useState<SafetyAlert | null>(null);
    const alerts = useMemo(
        () => (enabled ? evaluateSafety({ events, simulation, labResults, nowH }) : []),
        [enabled, events, simulation, labResults, nowH],
    );
    useEffect(() => {
        if (activeAlert) return;
        const next = selectModalAlert(alerts, dismissed);
        if (next) setActiveAlert(next);
    }, [alerts, dismissed, activeAlert]);
    useEffect(() => {
        setEnabledState(loadSafetyEnabled(localStorage, owner));
        setDismissed(loadSafetyDismissed(localStorage, owner));
        setActiveAlert(null);
    }, [owner]);
    const setEnabled = (value: boolean) => {
        saveSafetyEnabled(localStorage, owner, value);
        setEnabledState(value);
        if (!value) setActiveAlert(null);
    };
    const dismiss = () => {
        if (!activeAlert) return;
        const next = dismissSafetyAlert(localStorage, owner, activeAlert.id);
        setDismissed(next);
        setActiveAlert(null);
    };
    return { enabled, setEnabled, alerts, activeAlert, dismiss };
}
