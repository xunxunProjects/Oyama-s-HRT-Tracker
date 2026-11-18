import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const BUDGET_KB = 550;
const dist = 'dist';

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const match = html.match(/src="(?:\/)?(assets\/index-[^"]+\.js)"/);
if (!match) {
    console.error('bundle-size: could not find the entry script in dist/index.html');
    process.exit(1);
}

const entry = readFileSync(join(dist, match[1]));
const rawKiB = entry.length / 1024;
const gzipKiB = gzipSync(entry).length / 1024;
const budget = Number(process.env.BUNDLE_BUDGET_KB ?? BUDGET_KB);

console.log(`entry ${match[1]}: ${rawKiB.toFixed(1)} KiB raw, ${gzipKiB.toFixed(1)} KiB gzip`);
if (gzipKiB > budget) {
    console.error(`bundle-size: entry is ${gzipKiB.toFixed(1)} KiB gzip, over the ${budget} KiB budget`);
    process.exit(1);
}

const assets = readdirSync(join(dist, 'assets')).filter(file => file.endsWith('.js'));
const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
const missing = assets.filter(file => !sw.includes(file));
if (missing.length > 0) {
    console.error(`bundle-size: ${missing.length} JS asset(s) missing from the precache:`);
    for (const file of missing) console.error(`  ${file}`);
    process.exit(1);
}

console.log(`precache: ${assets.length} JS assets, all listed in sw.js`);
