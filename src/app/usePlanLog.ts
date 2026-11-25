import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { type DoseEvent } from '../../logic';
import { planEvent, type PlanItem } from '../utils/plan';

interface PlanLogOptions {
    events: DoseEvent[];
    addEvent: (event: DoseEvent) => void;
    deleteEvent: (id: string) => void;
}

/**
 * One tap on the Overview logs a plan item's dose. Every dose logged this way
 * is kept, newest last, so the taps can be taken back one at a time: three
 * doses in a day are three taps and three undos.
 */
export const usePlanLog = ({ events, addEvent, deleteEvent }: PlanLogOptions) => {
    const [planLogs, setPlanLogs] = useState<{ itemId: string; eventId: string }[]>([]);

    const handleLogPlanItem = (item: PlanItem) => {
        const eventId = uuidv4();
        addEvent(planEvent(item, eventId, Date.now()));
        setPlanLogs(logs => [...logs, { itemId: item.id, eventId }]);
    };

    const handleUndoPlanLog = (itemId: string) => {
        const last = [...planLogs]
            .reverse()
            .find(log => log.itemId === itemId && events.some(e => e.id === log.eventId));
        if (!last) return;
        deleteEvent(last.eventId);
        setPlanLogs(logs => logs.filter(log => log !== last));
    };

    // Items with a tap still on record to take back. A dose deleted elsewhere is gone from here too.
    const undoableIds = planLogs.filter(log => events.some(e => e.id === log.eventId)).map(log => log.itemId);

    return { handleLogPlanItem, handleUndoPlanLog, undoableIds };
};
