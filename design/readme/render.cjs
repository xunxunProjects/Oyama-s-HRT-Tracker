// Makes the README pictures in docs/images: four app screenshots and the
// hero picture, each in a light and a dark version.
//
// Start the app first (npm run dev), then, on a Mac so the words are in SF Pro:
//   npx -p playwright node design/readme/render.cjs [app url]
// The app url defaults to http://localhost:5173.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const APP = process.argv[2] || 'http://localhost:5173/';
const OUT = path.join(__dirname, '../../docs/images');
const seed = fs.readFileSync(path.join(__dirname, 'seed.js'), 'utf8');

async function screenshots(browser, theme) {
    const context = await browser.newContext({
        viewport: { width: 393, height: 852 },
        deviceScaleFactor: 2,
        colorScheme: theme,
    });
    await context.addInitScript(seed);
    const page = await context.newPage();
    const shot = name => page.screenshot({ path: path.join(OUT, `screenshot-${name}-${theme}.png`) });
    const tab = async label => {
        await page.locator('button:visible', { hasText: label }).last().click();
        await page.waitForTimeout(1200);
    };

    await page.goto(APP, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    await shot('overview');
    await tab('History');
    await shot('history');
    await tab('Labs');
    await shot('labs');
    await tab('History');
    await page.getByText('Add Dose').first().click();
    await page.waitForTimeout(1200);
    await shot('dose');
    await context.close();
}

async function hero(browser, theme) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.5 });
    await page.goto('file://' + path.join(__dirname, 'hero.html') + '?theme=' + theme);
    await page.evaluate('document.fonts.ready');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(OUT, `hero-${theme}.png`) });
    await page.close();
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch();
    for (const theme of ['light', 'dark']) {
        await screenshots(browser, theme);
        await hero(browser, theme);
    }
    await browser.close();
})();
