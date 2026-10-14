// Renders og.html to public/og.png at 1200 by 630.
// Run with Playwright available, e.g.: npx -p playwright node design/og/render.cjs
const path = require('path');
const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    await page.goto('file://' + path.join(__dirname, 'og.html'));
    await page.evaluate('document.fonts.ready');
    await page.screenshot({ path: path.join(__dirname, '../../public/og.png') });
    await browser.close();
})();
