const fs = require('fs');

const START_DATE = new Date('2024-01-01T00:00:00Z');
const END_DATE = new Date('2026-01-29T00:00:00Z');
const EPOCH = new Date('1970-01-01T00:00:00Z');

function toTimeH(date) {
    return (date.getTime() - EPOCH.getTime()) / (1000 * 60 * 60);
}

const events = [];
const labResults = [];

// Helper to add random jitter to time (± 2 hours)
function addJitter(date) {
    const jitterMs = (Math.random() - 0.5) * 4 * 60 * 60 * 1000;
    return new Date(date.getTime() + jitterMs);
}

// Generate Doses
let current = new Date(START_DATE);
while (current < END_DATE) {
    // 1. Sublingual EV: 2mg every 12 hours (approx 8am and 8pm)
    // Morning Dose
    let morning = new Date(current);
    morning.setHours(8, 0, 0, 0);
    morning = addJitter(morning);
    if (morning < END_DATE) {
        events.push({
            id: crypto.randomUUID(),
            route: 'sublingual',
            ester: 'EV',
            timeH: toTimeH(morning),
            doseMG: 2,
            extras: { sublingualTier: 2 }
        });
    }

    // Evening Dose
    let evening = new Date(current);
    evening.setHours(20, 0, 0, 0);
    evening = addJitter(evening);
    if (evening < END_DATE) {
        events.push({
            id: crypto.randomUUID(),
            route: 'sublingual',
            ester: 'EV',
            timeH: toTimeH(evening),
            doseMG: 2,
            extras: { sublingualTier: 2 }
        });
    }

    // 2. CPA (Oral): 12.5mg every day at 9am
    let cpaTime = new Date(current);
    cpaTime.setHours(9, 0, 0, 0);
    cpaTime = addJitter(cpaTime);
    if (cpaTime < END_DATE) {
        events.push({
            id: crypto.randomUUID(),
            route: 'oral',
            ester: 'CPA',
            timeH: toTimeH(cpaTime),
            doseMG: 12.5,
            extras: {}
        });
    }

    // Advance 1 day
    current.setDate(current.getDate() + 1);
}

// Generate Lab Results: Every 3 months (approx 90 days)
current = new Date(START_DATE);
current.setDate(current.getDate() + 30); // Start first lab after 1 month
while (current < END_DATE) {
    // Randomize result slightly around a target (e.g., 150 pg/mL for sublingual trough/peak mix)
    // Actually sublingual levels fluctuate wildly, but let's assume valid blood draws
    const baseLevel = 150 + (Math.random() * 100 - 50);

    labResults.push({
        id: crypto.randomUUID(),
        timeH: toTimeH(addJitter(current)),
        concValue: parseFloat(baseLevel.toFixed(1)),
        unit: 'pg/ml'
    });

    current.setDate(current.getDate() + 90);
}

const exportData = {
    meta: {
        version: 1,
        exportedAt: new Date().toISOString()
    },
    weight: 80,
    events: events,
    labResults: labResults,
    doseTemplates: [
        {
            id: crypto.randomUUID(),
            name: "Morning EV",
            route: "sublingual",
            ester: "EV",
            doseMG: 2,
            extras: { sublingualTier: 2 },
            createdAt: Date.now()
        },
        {
            id: crypto.randomUUID(),
            name: "CPA Daily",
            route: "oral",
            ester: "CPA",
            doseMG: 12.5,
            extras: {},
            createdAt: Date.now()
        }
    ]
};

fs.writeFileSync('test_data_2024_2026.json', JSON.stringify(exportData, null, 2));
console.log(`Generated ${events.length} events and ${labResults.length} lab results.`);
