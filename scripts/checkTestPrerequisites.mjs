import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Security suites skip themselves when node:sqlite or openssl is unavailable.
 * CI must fail loudly instead of reporting a green run with those suites
 * skipped. Dependencies are injectable so the detection logic is testable.
 */
export async function verifyTestPrerequisites({
    importModule = specifier => import(specifier),
    runCommand = (command, args) => execFileSync(command, args, { stdio: 'ignore' }),
} = {}) {
    const missing = [];
    try {
        await importModule('node:sqlite');
    } catch {
        missing.push('node:sqlite');
    }
    try {
        runCommand('openssl', ['version']);
    } catch {
        missing.push('openssl');
    }
    return missing;
}

async function main() {
    const missing = await verifyTestPrerequisites();
    if (missing.length > 0) {
        console.error(`Missing required test prerequisites: ${missing.join(', ')}`);
        process.exitCode = 1;
        return;
    }
    console.log('Test prerequisites present: node:sqlite, openssl');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await main();
}
