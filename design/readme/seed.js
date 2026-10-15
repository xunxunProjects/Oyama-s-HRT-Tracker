// Sample records for the README screenshots, written before the app loads:
// weekly 4 mg estradiol valerate injections for twelve weeks, two trough lab
// results, a medication plan and a vial in supplies. Times are relative to now.
localStorage.setItem('app-hide-site-label', 'true');
localStorage.setItem('app-onboarded', 'true');
(() => {
    if (localStorage.getItem('__seeded')) return;
    const now = Date.now();
    const nowH = now / 3600000;
    const day = 24;
    const ev = [];
    for (let w = 12; w >= 0; w--) {
        const t = nowH - w * 7 * day - 4 * day - 3;
        if (t < nowH)
            ev.push({ id: 'ev' + w, route: 'injection', timeH: t, doseMG: 4, ester: 'EV', extras: {}, updatedAt: now });
    }
    localStorage.setItem('hrt-events', JSON.stringify(ev));
    localStorage.setItem(
        'hrt-lab-results',
        JSON.stringify([
            {
                id: 'l1',
                timeH: nowH - 5 * 7 * day - 4 * day - 3 - 2,
                concValue: 104,
                unit: 'pg/ml',
                assay: 'immuno',
                updatedAt: now,
            },
            {
                id: 'l2',
                timeH: nowH - 1 * 7 * day - 4 * day - 3 - 2,
                concValue: 97,
                unit: 'pg/ml',
                assay: 'lcms',
                updatedAt: now,
            },
        ]),
    );
    localStorage.setItem(
        'hrt-plan',
        JSON.stringify([
            { id: 'p1', route: 'injection', ester: 'EV', doseMG: 4, extras: {}, everyDays: 7, timesPerDay: 1 },
        ]),
    );
    localStorage.setItem(
        'hrt-supplies',
        JSON.stringify([
            {
                id: 's1',
                route: 'injection',
                ester: 'EV',
                pack: { kind: 'vial', ml: 10, mgPerMl: 5 },
                count: 2,
                startedAt: now - 60 * 86400000,
            },
        ]),
    );
    localStorage.setItem('hrt-weight', '60');
    localStorage.setItem('hrt-lang', 'en');
    localStorage.setItem('__seeded', '1');
})();
