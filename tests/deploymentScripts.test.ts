import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
    chmodSync,
    copyFileSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const tempDirs: string[] = [];

afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
}

function fakeBin(commands: Record<string, string>): string {
    const dir = tempDir('hrt-scripts-bin-');
    for (const [name, body] of Object.entries(commands)) {
        const path = join(dir, name);
        writeFileSync(path, `#!/bin/sh\n${body}\n`);
        chmodSync(path, 0o755);
    }
    return dir;
}

function pathWith(bin: string): string {
    return `${bin}:/usr/bin:/bin:/usr/local/bin`;
}

function fakeCommands(
    options: {
        nodeVersion?: string;
        docker?: boolean;
        daemon?: boolean;
        portOccupied?: boolean;
        containerExists?: boolean;
        containerProject?: string;
    } = {},
): Record<string, string> {
    const nodeVersion = options.nodeVersion ?? 'v22.23.4';
    const docker = options.docker ?? true;
    const daemon = options.daemon ?? true;
    const portOccupied = options.portOccupied ?? false;
    const containerExists = options.containerExists ?? false;
    const containerProject = options.containerProject ?? 'oyama-hrt';

    return {
        node: `if [ "\${1:-}" = "--version" ]; then printf '%s\\n' '${nodeVersion}'; exit 0; fi\nexit 0`,
        npm: `printf '%s\\n' '10.9.0'`,
        git: `printf '%s\\n' 'git version 2.45.0'`,
        make: `printf '%s\\n' 'GNU Make 4.4'`,
        'g++': `printf '%s\\n' 'g++ (Debian 12.2.0) 12.2.0'`,
        python3: `printf '%s\\n' 'Python 3.11.2'`,
        openssl: `case "\${1:-}" in\n  version) printf '%s\\n' 'OpenSSL 3.0.11' ;;\n  rand) printf '%s\\n' 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2W3x4Y5z6A7b8C9d0' ;;\n  *) exit 0 ;;\nesac`,
        curl: `exit 0`,
        ss: portOccupied ? `printf '%s\\n' 'LISTEN 0 128 127.0.0.1:8787 0.0.0.0:*'` : `exit 0`,
        docker: docker
            ? `case "\${1:-}" in\n  --version) printf '%s\\n' 'Docker version 29.0.0, build test' ;;\n  info) exit ${daemon ? 0 : 1} ;;\n  compose)\n    if [ "\${2:-}" = "version" ]; then printf '%s\\n' 'Docker Compose version v2.30.0'; exit 0; fi\n    exit 0 ;;\n  inspect)\n    if [ "${containerExists ? '1' : '0'}" = "1" ]; then\n      if [ "\${2:-}" = "-f" ]; then printf '%s\\n' '${containerProject}'; else printf '%s\\n' 'container'; fi\n      exit 0\n    fi\n    exit 1 ;;\n  port) printf '%s\\n' '127.0.0.1:8787'; exit 0 ;;\n  *) exit 0 ;;\nesac`
            : `exit 127`,
    };
}

function runScript(
    script: string,
    args: string[],
    env: NodeJS.ProcessEnv = {},
    cwd = repoRoot,
): ReturnType<typeof spawnSync> {
    return spawnSync(join(cwd, script), args, {
        cwd,
        env: { ...process.env, ...env },
        encoding: 'utf8',
    });
}

function copyDeployProject(): string {
    const dir = tempDir('hrt-deploy-');
    for (const file of [
        'Dependency-Detection.sh',
        'docker-install.sh',
        'compose.yaml',
        '.env.docker.example',
        'package.json',
    ]) {
        copyFileSync(join(repoRoot, file), join(dir, file));
    }
    chmodSync(join(dir, 'Dependency-Detection.sh'), 0o755);
    chmodSync(join(dir, 'docker-install.sh'), 0o755);
    mkdirSync(join(dir, 'docker'));
    return dir;
}

describe('compose.yaml', () => {
    it('parameterizes the published host and port with safe defaults', () => {
        const compose = readFileSync(join(repoRoot, 'compose.yaml'), 'utf8');
        expect(compose).toContain('${HRT_BIND_HOST:-127.0.0.1}:${HRT_PORT:-8787}:8787');
    });
});

describe('Dependency-Detection.sh', () => {
    it('prints usage for --help', () => {
        const result = runScript('Dependency-Detection.sh', ['--help']);
        expect(result.status).toBe(0);
        expect(String(result.stdout)).toContain('--vps');
        expect(String(result.stdout)).toContain('--docker');
        expect(String(result.stdout)).toContain('--json');
    });

    it('rejects Node older than the security baseline on the VPS path', () => {
        const bin = fakeBin(fakeCommands({ nodeVersion: 'v22.23.3' }));
        const result = runScript('Dependency-Detection.sh', ['--vps'], { PATH: pathWith(bin) });
        expect(result.status).toBe(1);
        expect(String(result.stdout)).toContain('22.23.3');
        expect(String(result.stdout)).toContain('22.23.4');
    });

    it('fails an app checkout older than 1.5.1', () => {
        const dir = copyDeployProject();
        writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '1.5.0' }, null, 2));
        const bin = fakeBin(fakeCommands());
        const result = runScript('Dependency-Detection.sh', ['--docker'], { PATH: pathWith(bin) }, dir);
        expect(result.status).toBe(1);
        expect(String(result.stdout)).toContain('1.5.0');
        expect(String(result.stdout)).toContain('1.5.1');
    });

    it('reports the app version and accepts 1.5.1', () => {
        const dir = copyDeployProject();
        const bin = fakeBin(fakeCommands());
        const result = runScript('Dependency-Detection.sh', ['--docker'], { PATH: pathWith(bin) }, dir);
        expect(result.status).toBe(0);
        expect(String(result.stdout)).toContain('app version');
        expect(String(result.stdout)).toContain('1.5.1');
    });

    it('accepts a ready Docker host without the Node toolchain', () => {
        const bin = fakeBin(fakeCommands());
        const result = runScript('Dependency-Detection.sh', ['--docker'], { PATH: pathWith(bin) });
        expect(result.status).toBe(0);
        expect(String(result.stdout)).not.toContain('Node.js');
        expect(String(result.stdout)).toContain('Docker Compose');
    });

    it('ignores an old Node.js on the Docker path', () => {
        const bin = fakeBin(fakeCommands({ nodeVersion: 'v22.23.3' }));
        const result = runScript('Dependency-Detection.sh', ['--docker'], { PATH: pathWith(bin) });
        expect(result.status).toBe(0);
        expect(String(result.stdout)).not.toContain('22.23.3');
    });

    it('reports a stopped Docker daemon', () => {
        const bin = fakeBin(fakeCommands({ daemon: false }));
        const result = runScript('Dependency-Detection.sh', ['--docker'], { PATH: pathWith(bin) });
        expect(result.status).toBe(1);
        expect(String(result.stdout)).toMatch(/daemon|Docker daemon/i);
    });

    it('reports an occupied port', () => {
        const bin = fakeBin(fakeCommands({ portOccupied: true }));
        const result = runScript('Dependency-Detection.sh', ['--docker'], { PATH: pathWith(bin) });
        expect(result.status).toBe(1);
        expect(String(result.stdout)).toContain('8787');
        expect(String(result.stdout)).toMatch(/port|listen/i);
    });

    it('accepts the port when the existing hrt-tracker container owns it', () => {
        const bin = fakeBin(
            fakeCommands({
                portOccupied: true,
                containerExists: true,
                containerProject: 'oyama-hrt',
            }),
        );
        const result = runScript('Dependency-Detection.sh', ['--docker'], { PATH: pathWith(bin) });
        expect(result.status).toBe(0);
        expect(String(result.stdout)).toContain('existing hrt-tracker container');
    });

    it('emits machine-readable JSON for the Docker path', () => {
        const bin = fakeBin(fakeCommands());
        const result = runScript('Dependency-Detection.sh', ['--docker', '--json'], {
            PATH: pathWith(bin),
        });
        expect(result.status).toBe(0);
        const parsed = JSON.parse(String(result.stdout)) as {
            mode: string;
            ok: boolean;
            checks: Array<{ name: string; status: string }>;
        };
        expect(parsed.mode).toBe('docker');
        expect(parsed.ok).toBe(true);
        expect(parsed.checks.some(check => check.name === 'Docker Compose')).toBe(true);
        expect(parsed.checks.some(check => check.name === 'node')).toBe(false);
        expect(parsed.checks.some(check => check.name === 'npm')).toBe(false);
    });
});

describe('docker-install.sh', () => {
    it('prints usage for --help', () => {
        const result = runScript('docker-install.sh', ['--help']);
        expect(result.status).toBe(0);
        expect(String(result.stdout)).toContain('--mode');
        expect(String(result.stdout)).toContain('--dry-run');
    });

    it('plans a loopback deployment without writing .env', () => {
        const dir = copyDeployProject();
        const bin = fakeBin(fakeCommands());
        const result = runScript(
            'docker-install.sh',
            ['--dry-run', '--yes', '--mode', 'loopback'],
            { PATH: pathWith(bin) },
            dir,
        );
        expect(result.status).toBe(0);
        expect(existsSync(join(dir, '.env'))).toBe(false);
        expect(String(result.stdout)).toContain('127.0.0.1:8787');
    });

    it('does not modify an existing .env during a dry run', () => {
        const dir = copyDeployProject();
        const envPath = join(dir, '.env');
        writeFileSync(envPath, 'JWT_SECRET=A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6\n');
        chmodSync(envPath, 0o644);
        const bin = fakeBin(fakeCommands());
        const result = runScript(
            'docker-install.sh',
            ['--dry-run', '--yes', '--mode', 'loopback'],
            { PATH: pathWith(bin) },
            dir,
        );
        expect(result.status).toBe(0);
        expect(statSync(envPath).mode & 0o777).toBe(0o644);
    });

    it('plans a domain deployment with the proxy origin and client-IP source', () => {
        const dir = copyDeployProject();
        const bin = fakeBin(fakeCommands());
        const result = runScript(
            'docker-install.sh',
            [
                '--dry-run',
                '--yes',
                '--mode',
                'proxy',
                '--domain',
                'hrt.example.com',
                '--public-port',
                '8443',
                '--proxy',
                'caddy',
            ],
            { PATH: pathWith(bin) },
            dir,
        );
        expect(result.status).toBe(0);
        expect(String(result.stdout)).toContain('PUBLIC_APP_ORIGIN=https://hrt.example.com:8443');
        expect(String(result.stdout)).toContain('TRUSTED_IP_SOURCE=x-forwarded-for');
        expect(String(result.stdout)).toContain('Caddy');
    });

    it('plans a LAN deployment with an explicit no-TLS warning', () => {
        const dir = copyDeployProject();
        const bin = fakeBin(fakeCommands());
        const result = runScript(
            'docker-install.sh',
            ['--dry-run', '--yes', '--mode', 'lan', '--port', '18787'],
            { PATH: pathWith(bin) },
            dir,
        );
        expect(result.status).toBe(0);
        expect(String(result.stdout)).toContain('HRT_BIND_HOST=0.0.0.0');
        expect(String(result.stdout)).toContain('HRT_PORT=18787');
        expect(String(result.stdout)).toMatch(/no TLS|without TLS/i);
    });

    it('creates a private .env and never prints the generated secret', () => {
        const dir = copyDeployProject();
        const bin = fakeBin(fakeCommands());
        const result = runScript('docker-install.sh', ['--yes', '--mode', 'loopback'], { PATH: pathWith(bin) }, dir);
        expect(result.status).toBe(0);

        const envPath = join(dir, '.env');
        const env = readFileSync(envPath, 'utf8');
        const secret = /^JWT_SECRET=(.*)$/m.exec(env)?.[1];
        expect(secret).toBeTruthy();
        expect(secret?.length).toBeGreaterThanOrEqual(32);
        expect(env).toContain('HRT_BIND_HOST=127.0.0.1');
        expect(env).toContain('HRT_PORT=8787');
        expect(statSync(envPath).mode & 0o777).toBe(0o600);
        expect(String(result.stdout) + String(result.stderr)).not.toContain(secret);
        expect(existsSync(join(dir, 'data'))).toBe(true);
    });

    it('refuses to rotate an existing weak JWT_SECRET', () => {
        const dir = copyDeployProject();
        writeFileSync(join(dir, '.env'), 'JWT_SECRET=short\n');
        const bin = fakeBin(fakeCommands());
        const result = runScript('docker-install.sh', ['--yes', '--mode', 'loopback'], { PATH: pathWith(bin) }, dir);
        expect(result.status).toBe(1);
        expect(String(result.stderr)).toContain('JWT_SECRET');
        expect(readFileSync(join(dir, '.env'), 'utf8')).toContain('JWT_SECRET=short');
        expect(String(result.stdout) + String(result.stderr)).not.toContain('short');
    });

    it('refuses to take over a container owned by another Compose project', () => {
        const dir = copyDeployProject();
        const bin = fakeBin(fakeCommands({ containerExists: true, containerProject: 'someone-else' }));
        const result = runScript('docker-install.sh', ['--yes', '--mode', 'loopback'], { PATH: pathWith(bin) }, dir);
        expect(result.status).toBe(1);
        expect(String(result.stderr)).toMatch(/container|Compose project/i);
    });
});
