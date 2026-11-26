import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const ENTRY_BUDGET_KIB = 550;
const PRECACHE_BUDGET_KIB = 3 * 1024;
const dist = 'dist';

const fail = message => {
    console.error(`bundle-size: ${message}`);
    process.exit(1);
};

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const match = html.match(/src="(?:\/)?(assets\/index-[^"]+\.js)"/);
if (!match) fail('could not find the entry script in dist/index.html');

const entryPath = match[1];
const entry = readFileSync(join(dist, entryPath));
const rawKiB = entry.length / 1024;
const gzipKiB = gzipSync(entry).length / 1024;
const budget = Number(process.env.BUNDLE_BUDGET_KB ?? ENTRY_BUDGET_KIB);
if (!Number.isFinite(budget) || budget <= 0) fail(`invalid BUNDLE_BUDGET_KB: ${process.env.BUNDLE_BUDGET_KB}`);

console.log(`entry ${entryPath}: ${rawKiB.toFixed(1)} KiB raw, ${gzipKiB.toFixed(1)} KiB gzip`);
if (gzipKiB > budget) {
    fail(`entry is ${gzipKiB.toFixed(1)} KiB gzip, over the ${budget} KiB budget`);
}

const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
const precacheMatch = sw.match(/precacheAndRoute\(\[(.*?)\],\s*\{/s);
if (!precacheMatch) fail('could not find the precache manifest in dist/sw.js');
const precacheUrls = [...precacheMatch[1].matchAll(/url:"([^"]+)"/g)].map(match => match[1].replace(/^\/+/, ''));
if (precacheUrls.length === 0) fail('no precache entries found in dist/sw.js');
const duplicateUrls = [...new Set(precacheUrls.filter((url, index) => precacheUrls.indexOf(url) !== index))];
if (duplicateUrls.length > 0) {
    fail(`duplicate precache entries:\n${duplicateUrls.map(url => `  ${url}`).join('\n')}`);
}

const entries = precacheUrls.map(url => {
    try {
        return { url, bytes: statSync(join(dist, url)).size };
    } catch {
        fail(`precache entry ${url} is missing from dist`);
    }
});

const totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
const totalKiB = totalBytes / 1024;
const precacheBudget = Number(process.env.PRECACHE_BUDGET_KIB ?? PRECACHE_BUDGET_KIB);
if (!Number.isFinite(precacheBudget) || precacheBudget <= 0) {
    fail(`invalid PRECACHE_BUDGET_KIB: ${process.env.PRECACHE_BUDGET_KIB}`);
}
if (totalKiB > precacheBudget) {
    fail(`precache is ${totalKiB.toFixed(1)} KiB raw, over the ${precacheBudget} KiB budget`);
}

const isEntry = url => url === entryPath;
const isEntryCss = url => /^assets\/index-[^/]+\.css$/.test(url);
const isOptionalRegister = url => url === 'registerSW.js';
const unexpectedJs = entries.filter(
    entry => entry.url.endsWith('.js') && !isEntry(entry.url) && !isOptionalRegister(entry.url),
);
const unexpectedCss = entries.filter(entry => entry.url.endsWith('.css') && !isEntryCss(entry.url));
if (!entries.some(entry => isEntry(entry.url))) fail(`entry ${entryPath} is not in the precache`);
if (unexpectedJs.length > 0) {
    fail(`non-shell JS in the precache:\n${unexpectedJs.map(entry => `  ${entry.url}`).join('\n')}`);
}
if (unexpectedCss.length > 0) {
    fail(`non-shell CSS in the precache:\n${unexpectedCss.map(entry => `  ${entry.url}`).join('\n')}`);
}

const assets = readdirSync(join(dist, 'assets')).filter(file => file.endsWith('.js'));
const lazyAssets = assets
    .map(file => `assets/${file}`)
    .filter(url => url !== entryPath)
    .map(url => ({ url, bytes: statSync(join(dist, url)).size }));
const leaked = lazyAssets.filter(entry => precacheUrls.includes(entry.url));
if (leaked.length > 0) {
    fail(`lazy chunk(s) leaked into the precache:\n${leaked.map(entry => `  ${entry.url}`).join('\n')}`);
}

if (!sw.includes('route-chunks-v1')) fail('route-chunks-v1 runtime cache is missing from dist/sw.js');
if (!sw.includes('route-styles-v1')) fail('route-styles-v1 runtime cache is missing from dist/sw.js');
if (!sw.includes('static-assets-v1')) fail('static-assets-v1 runtime cache is missing from dist/sw.js');
if (!sw.includes('NetworkOnly')) fail('API NetworkOnly route is missing from dist/sw.js');

const apiRoute = sw.indexOf('NetworkOnly');
const chunkRoute = sw.indexOf('route-chunks-v1');
if (apiRoute < 0 || chunkRoute < 0 || apiRoute > chunkRoute) {
    fail('API NetworkOnly route must be registered before the asset runtime caches');
}

const jsEntries = entries.filter(entry => entry.url.endsWith('.js')).length;
const cssEntries = entries.filter(entry => entry.url.endsWith('.css')).length;
const otherEntries = entries.length - jsEntries - cssEntries;
console.log(
    `precache: ${entries.length} entries, ${totalKiB.toFixed(1)} KiB raw ` +
        `(${jsEntries} JS, ${cssEntries} CSS, ${otherEntries} other)`,
);

const largestLazy = [...lazyAssets].sort((a, b) => b.bytes - a.bytes).slice(0, 3);
const largestText = largestLazy.map(entry => `${entry.url} ${(entry.bytes / 1024).toFixed(1)} KiB`).join(', ');
console.log(`lazy JS: ${lazyAssets.length} chunks outside the precache (largest: ${largestText})`);
