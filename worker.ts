import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  JWT_SECRET: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  PUBLIC_APP_ORIGIN?: string;
  AVATAR_BUCKET: R2Bucket;
  /** Set to 'development' only in local config; anything else means production. */
  ENVIRONMENT?: string;
}

// Rate limiting backed by D1 so limits are enforced across Cloudflare's
// distributed, ephemeral Worker isolates (an in-memory Map is per-isolate and
// effectively unenforceable, leaving login brute-force unthrottled).
let rateLimitEnsured = false;
async function ensureRateLimitTable(env: Env): Promise<void> {
  if (rateLimitEnsured) return;
  try {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS rate_limits (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        reset_time INTEGER NOT NULL
      )`
    ).run();
    rateLimitEnsured = true;
  } catch (e) {
    console.error('Failed to ensure rate_limits table:', e);
  }
}

async function checkRateLimit(env: Env, key: string, maxRequests = 5, windowMs = 60000): Promise<boolean> {
  await ensureRateLimitTable(env);
  const now = Date.now();
  try {
    // One statement: read, expire-or-increment and write happen atomically inside
    // SQLite. The previous SELECT -> compare -> UPDATE sequence was three separate
    // round-trips across independent Worker invocations with no transaction, so
    // concurrent requests all read the same stale count — a burst against a cold
    // key every window slipped through together.
    const row = await env.DB.prepare(
      `INSERT INTO rate_limits (key, count, reset_time) VALUES (?1, 1, ?2)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN rate_limits.reset_time < ?3 THEN 1 ELSE rate_limits.count + 1 END,
         reset_time = CASE WHEN rate_limits.reset_time < ?3 THEN ?2 ELSE rate_limits.reset_time END
       RETURNING count`
    ).bind(key, now + windowMs, now).first() as { count: number } | null;

    // Opportunistic cleanup of expired rows to keep the table small.
    if (Math.random() < 0.05) {
      await env.DB.prepare('DELETE FROM rate_limits WHERE reset_time < ?').bind(now).run();
    }

    return (row?.count ?? 1) <= maxRequests;
  } catch (e) {
    // Fail open on DB errors — never lock every user out due to an infra hiccup.
    console.error('Rate limit check failed:', e);
    return true;
  }
}

function withSecurityHeaders(response: Response): Response {
  const newResponse = new Response(response.body, response);
  newResponse.headers.set('X-Content-Type-Options', 'nosniff');
  newResponse.headers.set('X-Frame-Options', 'DENY');
  newResponse.headers.set('X-XSS-Protection', '1; mode=block');
  newResponse.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; object-src 'none'; base-uri 'self';");
  return newResponse;
}

// Timing-safe string comparison
function timingSafeEqual(a: string, b: string): boolean {
  try {
    const enc = new TextEncoder();
    const aBytes = enc.encode(a);
    const bBytes = enc.encode(b);

    // Use a fixed length for comparison to avoid leaking actual length
    // We'll use 512 as a safe upper bound for these credentials
    const TARGET_LEN = 512;
    const aFixed = new Uint8Array(TARGET_LEN);
    const bFixed = new Uint8Array(TARGET_LEN);

    // Fill with data, but keep comparison length constant
    aFixed.set(aBytes.slice(0, TARGET_LEN));
    bFixed.set(bBytes.slice(0, TARGET_LEN));

    let result = 0;
    // Always compare TARGET_LEN bytes
    for (let i = 0; i < TARGET_LEN; i++) {
      result |= aFixed[i] ^ bFixed[i];
    }

    // Also include length comparison in the result to avoid length leaks
    // and ensuring we don't truncate valid but long matches
    return (result === 0) && (aBytes.length === bBytes.length) && (aBytes.length <= TARGET_LEN);
  } catch (e) {
    return false;
  }
}

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,30}$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

// Dosage shares are deliberately minimal snapshots. Static shares are
// immutable; live shares may replace this sanitized payload when the owner
// syncs their current dosage data. The server reconstructs the shape instead
// of storing the submitted object verbatim so accidental account/profile
// fields can never be exposed by a public link.
const MAX_SHARE_REQUEST_BYTES = 2 * 1024 * 1024;
const MAX_SHARE_EVENTS = 10_000;
const MAX_SHARE_SIMULATION_POINTS = 100_000;
const MAX_ACTIVE_SHARES_PER_USER = 20;
const MAX_EXPIRED_SHARE_TOMBSTONES_PER_USER = 20;
const MAX_SHARE_LIFETIME_SECONDS = 365 * 24 * 60 * 60;
const SHARE_TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url
const SHARE_ROUTES = new Set(['sublingual', 'injection', 'patchApply', 'patchRemove', 'gel', 'oral']);
const SHARE_ESTERS = new Set(['E2', 'EB', 'EV', 'EC', 'EN', 'EU', 'CPA', 'T', 'TC', 'TE', 'TU']);
const TRANSFEM_ESTERS = new Set(['E2', 'EB', 'EV', 'EC', 'EN', 'EU', 'CPA']);
const TRANSMASC_ESTERS = new Set(['T', 'TC', 'TE', 'TU']);
const SHARE_EXTRA_KEYS = new Set([
  'concentrationMGmL', 'areaCM2', 'releaseRateUGPerDay', 'sublingualTheta',
  'sublingualTier', 'gelSite', 'patchWearH',
]);

interface DosageShareSnapshot {
  version: 1;
  mode: 'transfem' | 'transmasc';
  timezone: string;
  createdAt: number;
  events: Array<{
    id: string;
    route: string;
    timeH: number;
    doseMG: number;
    ester: string;
    extras: Record<string, number>;
  }>;
  simulation: null | {
    timeH: number[];
    concPGmL: number[];
    concPGmL_E2: number[];
    concPGmL_CPA: number[];
    concNGdL_T: number[];
    auc: number;
  };
}

function isJsonObject(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isValidIanaTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

function sanitizeShareSnapshot(raw: unknown): { snapshot?: DosageShareSnapshot; error?: string } {
  if (!isJsonObject(raw)) return { error: 'snapshot must be an object' };
  if (raw.version !== 1) return { error: 'snapshot.version must be 1' };
  if (raw.mode !== 'transfem' && raw.mode !== 'transmasc') return { error: 'snapshot.mode is invalid' };
  if (!isValidIanaTimezone(raw.timezone)) return { error: 'snapshot.timezone must be a valid IANA timezone' };
  if (typeof raw.createdAt !== 'number' || !Number.isSafeInteger(raw.createdAt) || raw.createdAt <= 0 || raw.createdAt > 8_640_000_000_000_000) {
    return { error: 'snapshot.createdAt must be a valid epoch-millisecond timestamp' };
  }
  if (!Array.isArray(raw.events)) return { error: 'snapshot.events must be an array' };
  if (raw.events.length > MAX_SHARE_EVENTS) return { error: `snapshot.events may contain at most ${MAX_SHARE_EVENTS} entries` };

  const modeEsters = raw.mode === 'transfem' ? TRANSFEM_ESTERS : TRANSMASC_ESTERS;
  const eventIds = new Set<string>();
  const events: DosageShareSnapshot['events'] = [];
  for (let i = 0; i < raw.events.length; i++) {
    const event = raw.events[i];
    const path = `snapshot.events[${i}]`;
    if (!isJsonObject(event)) return { error: `${path} must be an object` };
    if (typeof event.id !== 'string' || event.id.length < 1 || event.id.length > 128) return { error: `${path}.id is invalid` };
    if (eventIds.has(event.id)) return { error: `${path}.id must be unique` };
    eventIds.add(event.id);
    if (typeof event.route !== 'string' || !SHARE_ROUTES.has(event.route)) return { error: `${path}.route is invalid` };
    if (typeof event.ester !== 'string' || !SHARE_ESTERS.has(event.ester) || !modeEsters.has(event.ester)) return { error: `${path}.ester is invalid for this mode` };
    if (typeof event.timeH !== 'number' || !Number.isFinite(event.timeH) || Math.abs(event.timeH) > 100_000_000) return { error: `${path}.timeH is invalid` };
    if (typeof event.doseMG !== 'number' || !Number.isFinite(event.doseMG) || event.doseMG < 0 || event.doseMG > 1_000_000) return { error: `${path}.doseMG is invalid` };
    if (!isJsonObject(event.extras)) return { error: `${path}.extras must be an object` };

    const extras: Record<string, number> = {};
    for (const [key, value] of Object.entries(event.extras)) {
      if (!SHARE_EXTRA_KEYS.has(key)) return { error: `${path}.extras contains an unsupported field` };
      if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1_000_000_000) return { error: `${path}.extras.${key} is invalid` };
      extras[key] = value;
    }
    events.push({
      id: event.id,
      route: event.route,
      timeH: event.timeH,
      doseMG: event.doseMG,
      ester: event.ester,
      extras,
    });
  }

  let simulation: DosageShareSnapshot['simulation'] = null;
  if (raw.simulation !== null) {
    if (!isJsonObject(raw.simulation)) return { error: 'snapshot.simulation must be an object or null' };
    const arrayFields = ['timeH', 'concPGmL', 'concPGmL_E2', 'concPGmL_CPA', 'concNGdL_T'] as const;
    const arrays: Record<(typeof arrayFields)[number], number[]> = {} as any;
    let pointCount: number | null = null;
    for (const field of arrayFields) {
      const values = raw.simulation[field];
      if (!Array.isArray(values)) return { error: `snapshot.simulation.${field} must be an array` };
      if (values.length > MAX_SHARE_SIMULATION_POINTS) return { error: `snapshot.simulation may contain at most ${MAX_SHARE_SIMULATION_POINTS} points` };
      if (pointCount === null) pointCount = values.length;
      if (values.length !== pointCount) return { error: 'snapshot.simulation arrays must have equal lengths' };
      const clean: number[] = [];
      for (let i = 0; i < values.length; i++) {
        const value = values[i];
        if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e20) {
          return { error: `snapshot.simulation.${field}[${i}] is invalid` };
        }
        clean.push(value);
      }
      arrays[field] = clean;
    }
    for (let i = 1; i < arrays.timeH.length; i++) {
      if (arrays.timeH[i] < arrays.timeH[i - 1]) return { error: 'snapshot.simulation.timeH must be sorted' };
    }
    if (typeof raw.simulation.auc !== 'number' || !Number.isFinite(raw.simulation.auc) || Math.abs(raw.simulation.auc) > 1e30) {
      return { error: 'snapshot.simulation.auc is invalid' };
    }
    simulation = {
      timeH: arrays.timeH,
      concPGmL: arrays.concPGmL,
      concPGmL_E2: arrays.concPGmL_E2,
      concPGmL_CPA: arrays.concPGmL_CPA,
      concNGdL_T: arrays.concNGdL_T,
      auc: raw.simulation.auc,
    };
  }

  return {
    snapshot: {
      version: 1,
      mode: raw.mode,
      timezone: raw.timezone,
      createdAt: raw.createdAt,
      events,
      simulation,
    },
  };
}

const WEAK_SECRETS = new Set([
  'secret', 'fallback-secret', 'fallback_secret', 'test-secret',
  'dev-secret', 'default', 'password', '123456', 'changeme',
]);

function validateJWTSecret(secret: string | undefined): string {
  if (!secret) throw new Error('JWT_SECRET environment variable must be set.');
  if (secret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters long.');
  const lowerSecret = secret.toLowerCase();
  for (const weak of WEAK_SECRETS) {
    if (lowerSecret.includes(weak)) throw new Error(`JWT_SECRET contains weak pattern "${weak}".`);
  }
  return secret;
}

function validateUsername(username: string): boolean {
  return USERNAME_REGEX.test(username);
}

function validatePassword(password: string): { valid: boolean; error?: string } {
  if (password.length < MIN_PASSWORD_LENGTH) return { valid: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long` };
  if (password.length > MAX_PASSWORD_LENGTH) return { valid: false, error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters long` };
  return { valid: true };
}

let cachedJWTSecret: string | null = null;
function getValidatedJWTSecret(env: Env): string {
  if (cachedJWTSecret === null) cachedJWTSecret = validateJWTSecret(env.JWT_SECRET);
  return cachedJWTSecret;
}

// Lazily ensure the transparency deletion_log table exists.
// This lets the feature deploy without requiring a manual migration on
// existing databases. Cached per worker instance.
// --- TOTP Helpers (RFC 6238 / RFC 4226) ---
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input: string): Uint8Array<ArrayBuffer> {
  const clean = input.toUpperCase().replace(/\s/g, '').replace(/=+$/, '');
  const bytes: number[] = [];
  let buf = 0, bitsLeft = 0;
  for (let i = 0; i < clean.length; i++) {
    const val = BASE32_CHARS.indexOf(clean[i]);
    if (val < 0) throw new Error(`Invalid base32 char: ${clean[i]}`);
    buf = (buf << 5) | val;
    bitsLeft += 5;
    if (bitsLeft >= 8) {
      bitsLeft -= 8;
      bytes.push((buf >> bitsLeft) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

function base32Encode(bytes: Uint8Array): string {
  let result = '';
  let buf = 0, bitsLeft = 0;
  for (const byte of bytes) {
    buf = (buf << 8) | byte;
    bitsLeft += 8;
    while (bitsLeft >= 5) {
      bitsLeft -= 5;
      result += BASE32_CHARS[(buf >> bitsLeft) & 0x1f];
    }
  }
  if (bitsLeft > 0) result += BASE32_CHARS[(buf << (5 - bitsLeft)) & 0x1f];
  return result;
}

function generateTOTPSecret(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

async function hotp(secret: string, counter: number): Promise<string> {
  const keyBytes = base32Decode(secret);
  const counterBuf = new ArrayBuffer(8);
  const view = new DataView(counterBuf);
  view.setUint32(0, Math.floor(counter / 0x100000000), false);
  view.setUint32(4, counter % 0x100000000, false);
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, counterBuf);
  const hmac = new Uint8Array(sig);
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return (code % 1_000_000).toString().padStart(6, '0');
}

async function verifyTOTP(secret: string, token: string, windowSize = 1): Promise<boolean> {
  return (await matchTOTPStep(secret, token, windowSize)) !== null;
}

/** The 30-second step a code matches, or null. Needed so it can be consumed. */
async function matchTOTPStep(secret: string, token: string, windowSize = 1): Promise<number | null> {
  if (!/^\d{6}$/.test(token)) return null;
  const T = Math.floor(Date.now() / 1000 / 30);
  for (let i = -windowSize; i <= windowSize; i++) {
    if (await hotp(secret, T + i) === token) return T + i;
  }
  return null;
}

/**
 * Verify a TOTP code and burn it, so the same six digits can't be presented
 * twice. The ±1 step window means a code stayed valid for up to 90 seconds;
 * without consumption, anyone who observed one inside that window could reuse
 * it. RFC 6238 §5.2 requires one-time acceptance. Backup codes already did this
 * via their used_at column — this brings TOTP in line.
 */
async function consumeTOTP(env: Env, userId: string, secret: string, token: string): Promise<boolean> {
  const step = await matchTOTPStep(secret, token);
  if (step === null) return false;
  const row = await env.DB.prepare('SELECT totp_last_step FROM users WHERE id = ?').bind(userId).first() as { totp_last_step: number | null } | null;
  if (row?.totp_last_step != null && step <= row.totp_last_step) return false;
  await env.DB.prepare('UPDATE users SET totp_last_step = ? WHERE id = ?').bind(step, userId).run();
  return true;
}

// --- Sessions table lazy creation ---
// Revoke sessions left idle beyond this window (seconds). Shorter than the
// 7-day JWT lifetime so inactivity caps how long a stolen token survives.
const SESSION_IDLE_TIMEOUT_SECONDS = 3 * 24 * 60 * 60; // 3 days

let sessionsEnsured = false;
async function ensureSessions(env: Env): Promise<void> {
  if (sessionsEnsured) return;
  try {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch()),
        last_used_at INTEGER DEFAULT (unixepoch()),
        device_info TEXT,
        ip TEXT
      )`
    ).run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)').run();
    sessionsEnsured = true;
  } catch (e) {
    console.error('Failed to ensure sessions table:', e);
  }
}

// --- TOTP secret column lazy creation ---
let totpColumnEnsured = false;
async function ensureTotpColumn(env: Env): Promise<void> {
  if (totpColumnEnsured) return;
  try {
    await env.DB.prepare('ALTER TABLE users ADD COLUMN totp_secret TEXT').run();
  } catch (_) {
    // Column likely already exists
  }
  try {
    // Highest TOTP step already accepted for this user, so a code cannot be
    // replayed inside its validity window. See consumeTOTP.
    await env.DB.prepare('ALTER TABLE users ADD COLUMN totp_last_step INTEGER').run();
  } catch (_) {
    // Column likely already exists
  }
  totpColumnEnsured = true;
}

let deletionLogEnsured = false;
async function ensureDeletionLog(env: Env): Promise<void> {
  if (deletionLogEnsured) return;
  try {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS deletion_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reason TEXT NOT NULL,
        user_created_at INTEGER,
        deleted_at INTEGER DEFAULT (unixepoch())
      )`
    ).run();
    // Best-effort indexes
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_deletion_log_deleted_at ON deletion_log(deleted_at)').run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_deletion_log_reason ON deletion_log(reason)').run();
    deletionLogEnsured = true;
  } catch (e) {
    console.error('Failed to ensure deletion_log table:', e);
  }
}

async function logDeletion(env: Env, reason: 'self' | 'admin', userCreatedAt: number | null): Promise<void> {
  try {
    await ensureDeletionLog(env);
    await env.DB.prepare('INSERT INTO deletion_log (reason, user_created_at) VALUES (?, ?)')
      .bind(reason, userCreatedAt).run();
  } catch (e) {
    console.error('Failed to log deletion:', e);
  }
}

// --- Backup codes table lazy creation ---
let backupCodesEnsured = false;
async function ensureBackupCodes(env: Env): Promise<void> {
  if (backupCodesEnsured) return;
  try {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS backup_codes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        used_at INTEGER,
        created_at INTEGER DEFAULT (unixepoch())
      )`
    ).run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_backup_codes_user_id ON backup_codes(user_id)').run();
    backupCodesEnsured = true;
  } catch (e) {
    console.error('Failed to ensure backup_codes table:', e);
  }
}

async function hmacSha256Hex(key: string, data: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateRawBackupCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no ambiguous chars (0/O 1/I/L)
  const rand = crypto.getRandomValues(new Uint8Array(12));
  let code = '';
  for (let i = 0; i < 12; i++) {
    if (i === 4 || i === 8) code += '-';
    code += chars[rand[i] % chars.length];
  }
  return code; // format: XXXX-XXXX-XXXX
}

async function generateAndStoreBackupCodes(env: Env, userId: string, jwtSecret: string): Promise<string[]> {
  await ensureBackupCodes(env);
  await env.DB.prepare('DELETE FROM backup_codes WHERE user_id = ?').bind(userId).run();
  const codes: string[] = [];
  for (let i = 0; i < 8; i++) {
    const code = generateRawBackupCode();
    const normalized = code.replace(/-/g, '').toLowerCase();
    const hash = await hmacSha256Hex(jwtSecret, normalized);
    const id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO backup_codes (id, user_id, code_hash) VALUES (?, ?, ?)')
      .bind(id, userId, hash).run();
    codes.push(code);
  }
  return codes;
}

async function verifyAndConsumeBackupCode(env: Env, userId: string, code: string, jwtSecret: string): Promise<boolean> {
  await ensureBackupCodes(env);
  const normalized = code.trim().replace(/[-\s]/g, '').toLowerCase();
  const hash = await hmacSha256Hex(jwtSecret, normalized);
  const row = await env.DB.prepare(
    'SELECT id FROM backup_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL'
  ).bind(userId, hash).first() as any;
  if (!row) return false;
  await env.DB.prepare('UPDATE backup_codes SET used_at = ? WHERE id = ?')
    .bind(Math.floor(Date.now() / 1000), row.id).run();
  return true;
}

// --- Dosage share snapshots ---
let dosageSharesEnsured = false;
async function ensureDosageShares(env: Env): Promise<void> {
  if (dosageSharesEnsured) return;
  try {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS dosage_shares (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        snapshot_json TEXT NOT NULL,
        password_hash TEXT,
        expires_at INTEGER,
        is_live INTEGER NOT NULL DEFAULT 0,
        share_mode TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`
    ).run();

    // Local/self-hosted databases may have been created before live sharing
    // existed and might not have run the numbered D1 migration. Inspect first
    // and tolerate a concurrent Worker isolate winning the ALTER race.
    const ensureColumn = async (name: string, ddl: string): Promise<void> => {
      const columns = await env.DB.prepare('PRAGMA table_info(dosage_shares)').all<{ name: string }>();
      if ((columns.results || []).some(column => column.name === name)) return;
      try {
        await env.DB.prepare(ddl).run();
      } catch (error) {
        const refreshed = await env.DB.prepare('PRAGMA table_info(dosage_shares)').all<{ name: string }>();
        if (!(refreshed.results || []).some(column => column.name === name)) throw error;
      }
    };
    await ensureColumn('is_live', 'ALTER TABLE dosage_shares ADD COLUMN is_live INTEGER NOT NULL DEFAULT 0');
    await ensureColumn('share_mode', 'ALTER TABLE dosage_shares ADD COLUMN share_mode TEXT');
    await ensureColumn('updated_at', 'ALTER TABLE dosage_shares ADD COLUMN updated_at INTEGER');
    await env.DB.prepare('UPDATE dosage_shares SET updated_at = created_at WHERE updated_at IS NULL').run();

    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_dosage_shares_user_id ON dosage_shares(user_id)').run();
    await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_dosage_shares_token_hash ON dosage_shares(token_hash)').run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_dosage_shares_expires_at ON dosage_shares(expires_at)').run();
    dosageSharesEnsured = true;
  } catch (e) {
    console.error('Failed to ensure dosage_shares table:', e);
    throw e;
  }
}

/**
 * Discard the payload of every share that has passed its expiry, for all users.
 *
 * Setting an expiry on a share link is a promise that the data stops existing
 * then, not merely that it stops being served. Two scrubs already existed but
 * both needed someone to show up: the read path only fires if the expired link
 * is visited again, and the create path is scoped `WHERE user_id = ?` so it only
 * cleans the author's own shares. A link that expires and is then never touched
 * — by anyone, including its owner — kept its dose snapshot and password hash
 * indefinitely. This one is keyed on nothing but the clock.
 *
 * The `expires_at` index makes the scan cheap, and the guard on the last clause
 * means rows already scrubbed are not rewritten, so repeat runs are free.
 * Tombstones are deliberately left in place: a visitor to an expired link should
 * get "expired", not "never existed". Trimming those stays per-user on create.
 */
async function sweepExpiredShares(env: Env): Promise<void> {
  try {
    await env.DB.prepare(
      `UPDATE dosage_shares SET snapshot_json = 'null', password_hash = NULL
       WHERE expires_at IS NOT NULL AND expires_at <= ?
         AND (snapshot_json != 'null' OR password_hash IS NOT NULL)`
    ).bind(Math.floor(Date.now() / 1000)).run();
  } catch (e) {
    // Best-effort housekeeping — never fail a request over it.
    console.error('Failed to sweep expired shares:', e);
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

// --- Passkeys (WebAuthn) table lazy creation ---
let passkeysEnsured = false;
async function ensurePasskeys(env: Env): Promise<void> {
  if (passkeysEnsured) return;
  try {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS passkeys (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        credential_id TEXT NOT NULL UNIQUE,
        public_key_x TEXT NOT NULL,
        public_key_y TEXT NOT NULL,
        counter INTEGER DEFAULT 0,
        device_name TEXT,
        created_at INTEGER DEFAULT (unixepoch())
      )`
    ).run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_passkeys_user_id ON passkeys(user_id)').run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_passkeys_cred_id ON passkeys(credential_id)').run();
    passkeysEnsured = true;
  } catch (e) {
    console.error('Failed to ensure passkeys table:', e);
  }
}

// --- WebAuthn / Passkey crypto helpers ---

function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - b64.length % 4) % 4;
  return Uint8Array.from(atob(b64 + '='.repeat(pad)), c => c.charCodeAt(0));
}

function b64urlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Minimal CBOR decoder covering types used by WebAuthn (major types 0-5, 7 booleans).
 *
 * Every length is checked against what is actually left in the buffer. Without
 * that, a 5-byte header could declare a 4-billion-element array: reads past the
 * end return `undefined`, and since `undefined >> 5` is 0 and `undefined & 0x1f`
 * is 0, `readValue()` kept returning 0 forever instead of throwing — so the loop
 * ran to the declared length and burned the isolate. The input here is an
 * attacker-supplied attestationObject, so the declared length is never to be
 * trusted over the bytes actually present.
 */
function decodeCBOR(bytes: Uint8Array): any {
  let offset = 0;
  function need(n: number): void {
    if (n < 0 || offset + n > bytes.length) throw new Error('CBOR: truncated input');
  }
  function readLen(info: number): number {
    if (info < 24) return info;
    if (info === 24) { need(1); return bytes[offset++]; }
    if (info === 25) { need(2); const v = (bytes[offset] << 8) | bytes[offset + 1]; offset += 2; return v; }
    if (info === 26) { need(4); const v = ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0; offset += 4; return v; }
    throw new Error('CBOR: unsupported length info ' + info);
  }
  function readValue(): any {
    need(1);
    const b = bytes[offset++];
    const major = b >> 5, info = b & 0x1f;
    if (major === 0) return readLen(info);
    if (major === 1) return -1 - readLen(info);
    if (major === 2) { const len = readLen(info); need(len); const sl = bytes.slice(offset, offset + len); offset += len; return sl; }
    if (major === 3) { const len = readLen(info); need(len); const sl = bytes.slice(offset, offset + len); offset += len; return new TextDecoder().decode(sl); }
    // A container's items cost at least one byte each, so a declared count
    // larger than the bytes remaining is a lie and can be rejected up front —
    // before allocating anything.
    if (major === 4) { const len = readLen(info); need(len); return Array.from({ length: len }, () => readValue()); }
    if (major === 5) { const len = readLen(info); need(len * 2); const map: any = {}; for (let i = 0; i < len; i++) { const k = readValue(); map[k] = readValue(); } return map; }
    if (major === 7) { if (info === 20) return false; if (info === 21) return true; if (info === 22) return null; }
    throw new Error('CBOR: unsupported major ' + major);
  }
  return readValue();
}

interface ParsedAuthData {
  rpIdHash: Uint8Array;
  flags: number;
  signCount: number;
  credentialId?: Uint8Array;
  publicKeyX?: Uint8Array;
  publicKeyY?: Uint8Array;
}

function parseAuthData(auth: Uint8Array): ParsedAuthData {
  const rpIdHash = auth.slice(0, 32);
  const flags = auth[32];
  const signCount = ((auth[33] << 24) | (auth[34] << 16) | (auth[35] << 8) | auth[36]) >>> 0;
  let credentialId: Uint8Array | undefined, publicKeyX: Uint8Array | undefined, publicKeyY: Uint8Array | undefined;
  if (flags & 0x40) { // AT flag — attested credential data present
    let off = 37 + 16; // skip rpIdHash(32) + flags(1) + signCount(4) + AAGUID(16)
    const credIdLen = (auth[off] << 8) | auth[off + 1]; off += 2;
    credentialId = auth.slice(off, off + credIdLen); off += credIdLen;
    // Remaining bytes: CBOR-encoded COSE key (EC2, P-256)
    const coseKey = decodeCBOR(auth.slice(off));
    if (coseKey[-2] instanceof Uint8Array) publicKeyX = coseKey[-2]; // x
    if (coseKey[-3] instanceof Uint8Array) publicKeyY = coseKey[-3]; // y
  }
  return { rpIdHash, flags, signCount, credentialId, publicKeyX, publicKeyY };
}

/** Convert DER-encoded ECDSA signature to raw (r‖s) for Web Crypto API. */
function derSigToRaw(der: Uint8Array): Uint8Array<ArrayBuffer> {
  if (der[0] !== 0x30) throw new Error('Not a DER sequence');
  let pos = 2;
  if (der[pos++] !== 0x02) throw new Error('Expected r INTEGER');
  const rLen = der[pos++]; let r = der.slice(pos, pos + rLen); pos += rLen;
  if (der[pos++] !== 0x02) throw new Error('Expected s INTEGER');
  const sLen = der[pos++]; let s = der.slice(pos, pos + sLen);
  // Strip potential leading 0x00 padding byte added by DER for positive integers
  if (r[0] === 0) r = r.slice(1);
  if (s[0] === 0) s = s.slice(1);
  const raw = new Uint8Array(64);
  raw.set(r, 32 - r.length);
  raw.set(s, 64 - s.length);
  return raw;
}

/** Verify a WebAuthn assertion (authentication response) for ES256 (P-256 ECDSA). */
async function verifyPasskeyAssertion(
  clientDataJSONb64: string,
  authenticatorDatab64: string,
  signatureb64: string,
  storedX: string,
  storedY: string,
  storedCounter: number,
  expectedOrigin: string,
  expectedRpId: string,
  expectedChallenge: string,
): Promise<number> {
  const clientData = JSON.parse(new TextDecoder().decode(b64urlDecode(clientDataJSONb64)));
  if (clientData.type !== 'webauthn.get') throw new Error('Wrong type');
  // Normalise challenge to base64url without padding before comparing
  const received = clientData.challenge.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  if (received !== expectedChallenge.replace(/=/g, '')) throw new Error('Challenge mismatch');
  if (clientData.origin !== expectedOrigin) throw new Error('Origin mismatch');

  const authBytes = b64urlDecode(authenticatorDatab64);
  const { rpIdHash, flags, signCount } = parseAuthData(authBytes);
  const rpHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(expectedRpId)));
  if (!rpIdHash.every((v, i) => v === rpHash[i])) throw new Error('RP ID mismatch');
  if (!(flags & 1)) throw new Error('User presence not set');

  // Verification data = authData || SHA-256(clientDataJSON)
  const clientHash = new Uint8Array(await crypto.subtle.digest('SHA-256', b64urlDecode(clientDataJSONb64)));
  const sigBase = new Uint8Array(authBytes.length + clientHash.length);
  sigBase.set(authBytes); sigBase.set(clientHash, authBytes.length);

  // Import stored public key (uncompressed EC point: 0x04 || x || y)
  const x = b64urlDecode(storedX), y = b64urlDecode(storedY);
  const uncompressed = new Uint8Array(65); uncompressed[0] = 0x04; uncompressed.set(x, 1); uncompressed.set(y, 33);
  const cryptoKey = await crypto.subtle.importKey('raw', uncompressed, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);

  const rawSig = derSigToRaw(b64urlDecode(signatureb64));
  const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, cryptoKey, rawSig, sigBase);
  if (!valid) throw new Error('Signature invalid');

  // Counter must advance (0 means counter not implemented — allow)
  if (storedCounter > 0 && signCount > 0 && storedCounter >= signCount) throw new Error('Counter not advancing (cloned authenticator?)');
  return signCount;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 1. Static Assets (Non-API)
    if (!url.pathname.startsWith('/api/')) {
      // Attach security headers (incl. CSP) to the document/assets too — without
      // this the CSP only rode on API responses and never reached the HTML page.
      const assetResponse = await env.ASSETS.fetch(request);
      const securedAssetResponse = withSecurityHeaders(assetResponse);
      if (url.pathname === '/share' || url.pathname.startsWith('/share/')) {
        securedAssetResponse.headers.set('Referrer-Policy', 'no-referrer');
        securedAssetResponse.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
      }
      return securedAssetResponse;
    }

    // 2. API Routes
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, DELETE, OPTIONS, PATCH, PUT',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    const shareJson = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
      withSecurityHeaders(new Response(JSON.stringify(body), {
        status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'Pragma': 'no-cache',
          'Referrer-Policy': 'no-referrer',
          'X-Robots-Tag': 'noindex, nofollow, noarchive',
          ...extraHeaders,
        },
      }));

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Session-level 401s (missing/expired/revoked token) are tagged with a
    // header so the client can tell them apart from business-logic 401s such
    // as an incorrect password. The client only force-signs-out on tagged
    // responses, never on a wrong-password attempt.
    const sessionInvalid = (message: string) =>
      withSecurityHeaders(new Response(message, {
        status: 401,
        headers: { ...corsHeaders, 'X-Session-Invalid': '1', 'Access-Control-Expose-Headers': 'X-Session-Invalid' },
      }));

    try {
      // Validate JWT secret first — if misconfigured return 503 not 500
      let jwtSecret: string;
      try {
        jwtSecret = getValidatedJWTSecret(env);
      } catch (configErr: any) {
        console.error('Worker misconfiguration:', configErr);
        return withSecurityHeaders(new Response('Service unavailable: server configuration error', { status: 503, headers: corsHeaders }));
      }

      // Rate limiting for auth/sensitive endpoints
      const sensitivePaths = ['/api/login', '/api/register', '/api/user/password', '/api/user/me'];
      if (sensitivePaths.some(p => url.pathname === p)) {
        // CF-Connecting-IP only. X-Forwarded-For / X-Real-IP were a fallback here,
        // but behind the Cloudflare edge they are never reached (CF always sets
        // CF-Connecting-IP), and anywhere else they are attacker-controlled — one
        // header per request buys a fresh bucket and the limiter stops existing.
        // Same reasoning already spelled out 15 lines below for /api/transparency.
        // Missing header falls back to one shared bucket rather than a 400, so the
        // self-hosted build still serves; the per-account limiter in the login
        // handler is what actually bounds brute force there.
        const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
        if (!(await checkRateLimit(env, clientIP, 10, 60000))) { // Slightly relaxed but broader coverage
          return withSecurityHeaders(new Response('Too many requests. Please try again later.', { status: 429, headers: { ...corsHeaders, 'Retry-After': '60' } }));
        }
      }

      // -- Public API Routes --

      // Transparency: public aggregate stats. No PII exposed.
      if (url.pathname === '/api/transparency' && request.method === 'GET') {
        // Only trust CF-Connecting-IP on a public, unauthenticated endpoint.
        // X-Forwarded-For / X-Real-IP can be spoofed by clients and would
        // allow trivial rate-limit evasion.
        const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
        if (!(await checkRateLimit(env, `transparency:${clientIP}`, 30, 60000))) {
          return withSecurityHeaders(new Response('Too many requests. Please try again later.', {
            status: 429, headers: { ...corsHeaders, 'Retry-After': '60' }
          }));
        }

        await ensureDeletionLog(env);
        const now = Math.floor(Date.now() / 1000);
        const day = 86400;
        const HOUR = 3600;

        const [totalUsersRow, totalBackupsRow, newUsers7dRow, newUsers24hRow,
          adminDelRow, selfDelRow, adminDel7dRow, selfDel7dRow, recentRows] = await Promise.all([
            env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE id != 'admin'").first<{ n: number }>(),
            env.DB.prepare('SELECT COUNT(*) AS n FROM content').first<{ n: number }>(),
            env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE id != 'admin' AND created_at >= ?").bind(now - 7 * day).first<{ n: number }>(),
            env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE id != 'admin' AND created_at >= ?").bind(now - day).first<{ n: number }>(),
            env.DB.prepare("SELECT COUNT(*) AS n FROM deletion_log WHERE reason = 'admin'").first<{ n: number }>(),
            env.DB.prepare("SELECT COUNT(*) AS n FROM deletion_log WHERE reason = 'self'").first<{ n: number }>(),
            env.DB.prepare("SELECT COUNT(*) AS n FROM deletion_log WHERE reason = 'admin' AND deleted_at >= ?").bind(now - 7 * day).first<{ n: number }>(),
            env.DB.prepare("SELECT COUNT(*) AS n FROM deletion_log WHERE reason = 'self' AND deleted_at >= ?").bind(now - 7 * day).first<{ n: number }>(),
            // Recent registrations — anonymized. We expose only a short
            // non-reversible prefix of the hex-only portion of the UUID plus
            // the creation timestamp. No username is ever returned.
            env.DB.prepare("SELECT id, created_at FROM users WHERE id != 'admin' ORDER BY created_at DESC LIMIT 10").all<{ id: string; created_at: number }>(),
          ]);

        const recent = (recentRows.results || []).map(r => ({
          // Only hex chars, first 4 — enough to visually distinguish entries
          // but too short to enable enumeration.
          anon_id: String(r.id).replace(/[^a-f0-9]/gi, '').slice(0, 4).toLowerCase().padEnd(4, '0'),
          // Round timestamp to the nearest hour. The UI only displays
          // coarse relative times ("X hours ago"), and rounding prevents
          // an attacker from correlating an exact registration moment
          // with an external signal to re-identify an anonymized entry.
          created_at: Math.floor((r.created_at ?? 0) / HOUR) * HOUR,
        }));

        const body = {
          total_users: totalUsersRow?.n ?? 0,
          total_backups: totalBackupsRow?.n ?? 0,
          new_users_24h: newUsers24hRow?.n ?? 0,
          new_users_7d: newUsers7dRow?.n ?? 0,
          admin_deleted_count: adminDelRow?.n ?? 0,
          self_deleted_count: selfDelRow?.n ?? 0,
          admin_deleted_7d: adminDel7dRow?.n ?? 0,
          self_deleted_7d: selfDel7dRow?.n ?? 0,
          recent_registrations: recent,
          server_time: now,
        };

        return withSecurityHeaders(new Response(JSON.stringify(body), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=15',
          },
        }));
      }

      // Register
      if (url.pathname === '/api/register' && request.method === 'POST') {
        const body = await request.json() as any;
        let { username, password } = body;
        if (!username || !password) return withSecurityHeaders(new Response('Missing credentials', { status: 400, headers: corsHeaders }));

        username = username.trim();
        if (!validateUsername(username)) return withSecurityHeaders(new Response('Invalid username format', { status: 400, headers: corsHeaders }));
        const passVal = validatePassword(password);
        if (!passVal.valid) return withSecurityHeaders(new Response(passVal.error, { status: 400, headers: corsHeaders }));

        const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
        if (existing) return withSecurityHeaders(new Response('Username already taken', { status: 409, headers: corsHeaders }));

        const hashedPassword = await bcrypt.hash(password, 10);
        const id = crypto.randomUUID();
        await env.DB.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').bind(id, username, hashedPassword).run();

        // Issue a session immediately so the user can complete mandatory 2FA setup
        await ensureSessions(env);
        const sessionId = crypto.randomUUID();
        const userAgent = (request.headers.get('User-Agent') || 'Unknown').slice(0, 500);
        const regIP = request.headers.get('CF-Connecting-IP') ||
          request.headers.get('X-Forwarded-For')?.split(',')[0].trim() || 'unknown';
        await env.DB.prepare('INSERT INTO sessions (id, user_id, device_info, ip) VALUES (?, ?, ?, ?)')
          .bind(sessionId, id, userAgent, regIP).run();
        const regSecret = new TextEncoder().encode(jwtSecret);
        const regToken = await new SignJWT({ sub: id, username, role: 'user', sid: sessionId })
          .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(regSecret);
        return withSecurityHeaders(new Response(JSON.stringify({
          token: regToken,
          user: { id, username, isAdmin: false },
        }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
      }

      // Login
      if (url.pathname === '/api/login' && request.method === 'POST') {
        const body = await request.json() as any;
        let { username, password, totp_code, backup_code } = body;
        if (!username || !password) return withSecurityHeaders(new Response('Missing credentials', { status: 400, headers: corsHeaders }));
        username = username.trim();

        // Per-account throttle, keyed on nothing the caller can rotate. The IP
        // bucket above is only as good as the IP header; this one bounds guessing
        // against a single account no matter how many identities the caller
        // presents, which is the case that matters on a self-hosted deployment
        // with no trusted edge in front of it. Covers the admin branch too.
        if (!(await checkRateLimit(env, `login-user:${username.toLowerCase()}`, 10, 60000))) {
          return withSecurityHeaders(new Response('Too many attempts for this account. Please try again later.', {
            status: 429, headers: { ...corsHeaders, 'Retry-After': '60' },
          }));
        }

        // Admin login check
        // Guard against undefined/empty env vars allowing "null" or "undefined" login
        const adminU = env.ADMIN_USERNAME;
        const adminP = env.ADMIN_PASSWORD;

        if (adminU && adminP && adminU.length > 0 && adminP.length > 0 &&
          timingSafeEqual(username, adminU) && timingSafeEqual(password, adminP)) {
          const secret = new TextEncoder().encode(jwtSecret);
          const token = await new SignJWT({ sub: 'admin', username: 'Admin', role: 'admin' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1d').sign(secret);
          await env.DB.prepare("INSERT OR IGNORE INTO users (id, username, password_hash) VALUES ('admin', 'Admin', 'env_managed')").run();
          return withSecurityHeaders(new Response(JSON.stringify({ token, user: { id: 'admin', username: 'Admin', isAdmin: true } }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
        }

        // DB User check
        const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first() as any;

        // Anti-timing leak: Always run a bcrypt comparison even if user doesn't exist
        const dummyHash = '$2a$10$CCCCCCCCCCCCCCCCCCCCC.O0D3I6./CCCCCCCCCCCCCCCCCCCCCCC'; // Randomized-looking dummy
        const passwordHash = user ? user.password_hash : dummyHash;
        const passwordValid = await bcrypt.compare(password, passwordHash);

        if (!user || !passwordValid) {
          return withSecurityHeaders(new Response('Invalid credentials', { status: 401, headers: corsHeaders }));
        }

        // 2FA check
        await ensureTotpColumn(env);
        await ensurePasskeys(env);
        const userWithTotp = await env.DB.prepare('SELECT totp_secret FROM users WHERE id = ?').bind(user.id).first() as any;
        let twoFAVerified = false;
        if (userWithTotp?.totp_secret) {
          // TOTP is enabled — accept totp_code or backup_code
          if (!totp_code && !backup_code) {
            return withSecurityHeaders(new Response(JSON.stringify({ needs2FA: true, method: 'totp' }), {
              status: 401,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }));
          }
          if (backup_code) {
            const backupValid = await verifyAndConsumeBackupCode(env, user.id, String(backup_code), jwtSecret);
            if (!backupValid) return withSecurityHeaders(new Response('Invalid or already-used backup code', { status: 401, headers: corsHeaders }));
          } else {
            const totpValid = await consumeTOTP(env, user.id, userWithTotp.totp_secret, String(totp_code));
            if (!totpValid) return withSecurityHeaders(new Response('Invalid 2FA code', { status: 401, headers: corsHeaders }));
          }
          twoFAVerified = true;
        } else {
          // No TOTP: check if user has any passkeys registered
          const pkRow = await env.DB.prepare('SELECT COUNT(*) as cnt FROM passkeys WHERE user_id = ?').bind(user.id).first() as any;
          if ((pkRow?.cnt ?? 0) > 0) {
            // Passkey-only 2FA — accept backup_code as fallback
            if (backup_code) {
              const backupValid = await verifyAndConsumeBackupCode(env, user.id, String(backup_code), jwtSecret);
              if (!backupValid) return withSecurityHeaders(new Response('Invalid or already-used backup code', { status: 401, headers: corsHeaders }));
            } else {
              return withSecurityHeaders(new Response(JSON.stringify({ needs2FA: true, method: 'passkey' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              }));
            }
            twoFAVerified = true;
          }
        }

        // Create session
        await ensureSessions(env);
        const sessionId = crypto.randomUUID();
        const userAgent = (request.headers.get('User-Agent') || 'Unknown').slice(0, 500);
        const loginIP = request.headers.get('CF-Connecting-IP') ||
          request.headers.get('X-Forwarded-For')?.split(',')[0].trim() || 'unknown';
        await env.DB.prepare('INSERT INTO sessions (id, user_id, device_info, ip) VALUES (?, ?, ?, ?)')
          .bind(sessionId, user.id, userAgent, loginIP).run();

        const secret = new TextEncoder().encode(jwtSecret);
        const token = await new SignJWT({ sub: user.id, username: user.username, role: 'user', sid: sessionId }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(secret);
        const loginResp: Record<string, any> = { token, user: { id: user.id, username: user.username, isAdmin: false } };
        // 2FA setup is optional — do not force users to configure it on login.
        void twoFAVerified;
        return withSecurityHeaders(new Response(JSON.stringify(loginResp), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
      }

      // Avatar GET (Public)
      if (url.pathname.startsWith('/api/user/avatar/') && request.method === 'GET') {
        const username = url.pathname.split('/').pop();
        const genericNotFound = () => withSecurityHeaders(new Response('Not found', { status: 404, headers: corsHeaders }));

        try {
          const user = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first() as any;
          const userId = user ? user.id : (username === 'Admin' ? 'admin' : null);
          if (!userId) return genericNotFound();

          const object = await env.AVATAR_BUCKET.get(`hrt-tracker-user-avatar/${userId}`);
          if (!object) return genericNotFound();

          const headers = new Headers();
          object.writeHttpMetadata(headers);
          headers.set('Access-Control-Allow-Origin', '*');
          headers.set('Cache-Control', 'public, max-age=3600');
          return withSecurityHeaders(new Response(object.body, { headers }));
        } catch (e) {
          return genericNotFound();
        }
      }

      // POST /api/auth/passkey-options — generate WebAuthn auth challenge (public, no JWT)
      if (url.pathname === '/api/auth/passkey-options' && request.method === 'POST') {
        const clientIP = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0].trim() || 'unknown';
        if (!(await checkRateLimit(env, `passkey-options:${clientIP}`, 10, 60000))) {
          return withSecurityHeaders(new Response('Too many requests', { status: 429, headers: { ...corsHeaders, 'Retry-After': '60' } }));
        }
        await ensurePasskeys(env);
        const { username } = (await request.json().catch(() => ({}))) as any;
        const origin = request.headers.get('Origin') || `https://${url.hostname}`;
        const challenge = b64urlEncode(crypto.getRandomValues(new Uint8Array(32)));
        const secret = new TextEncoder().encode(jwtSecret);

        let credentialIds: string[] = [];
        if (username) {
          const userRow = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(String(username).trim()).first() as any;
          if (userRow) {
            const rows = await env.DB.prepare('SELECT credential_id FROM passkeys WHERE user_id = ?').bind(userRow.id).all();
            credentialIds = (rows.results || []).map((r: any) => r.credential_id);
          }
        }

        const challengeToken = await new SignJWT({ challenge, purpose: 'passkey-auth', origin })
          .setProtectedHeader({ alg: 'HS256' }).setExpirationTime('5m').sign(secret);
        return withSecurityHeaders(new Response(JSON.stringify({ challengeToken, challenge, credentialIds }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }));
      }

      // POST /api/auth/passkey-verify — verify WebAuthn assertion and issue session JWT (public)
      if (url.pathname === '/api/auth/passkey-verify' && request.method === 'POST') {
        const clientIP = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0].trim() || 'unknown';
        if (!(await checkRateLimit(env, `passkey-verify:${clientIP}`, 10, 60000))) {
          return withSecurityHeaders(new Response('Too many requests', { status: 429, headers: { ...corsHeaders, 'Retry-After': '60' } }));
        }
        await ensurePasskeys(env);
        const { challengeToken, credential } = await request.json() as any;
        if (!challengeToken || !credential?.id || !credential?.response) {
          return withSecurityHeaders(new Response('Missing data', { status: 400, headers: corsHeaders }));
        }

        const secret = new TextEncoder().encode(jwtSecret);
        let challengePayload: any;
        try {
          const { payload } = await jwtVerify(challengeToken, secret);
          challengePayload = payload;
        } catch {
          return withSecurityHeaders(new Response('Invalid or expired challenge', { status: 400, headers: corsHeaders }));
        }
        if (challengePayload.purpose !== 'passkey-auth') {
          return withSecurityHeaders(new Response('Invalid challenge purpose', { status: 400, headers: corsHeaders }));
        }

        const passkeyRow = await env.DB.prepare('SELECT * FROM passkeys WHERE credential_id = ?').bind(credential.id as string).first() as any;
        if (!passkeyRow) return withSecurityHeaders(new Response('Passkey not found', { status: 401, headers: corsHeaders }));

        const userRow = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(passkeyRow.user_id).first() as any;
        if (!userRow) return withSecurityHeaders(new Response('User not found', { status: 401, headers: corsHeaders }));

        const expectedOrigin = challengePayload.origin as string;
        const expectedRpId = (() => { try { return new URL(expectedOrigin).hostname; } catch { return url.hostname; } })();

        try {
          const newCounter = await verifyPasskeyAssertion(
            credential.response.clientDataJSON,
            credential.response.authenticatorData,
            credential.response.signature,
            passkeyRow.public_key_x,
            passkeyRow.public_key_y,
            passkeyRow.counter,
            expectedOrigin,
            expectedRpId,
            challengePayload.challenge as string,
          );
          await env.DB.prepare('UPDATE passkeys SET counter = ? WHERE id = ?').bind(newCounter, passkeyRow.id).run();
        } catch {
          return withSecurityHeaders(new Response('Passkey verification failed', { status: 401, headers: corsHeaders }));
        }

        await ensureSessions(env);
        const sessionId = crypto.randomUUID();
        const userAgent = (request.headers.get('User-Agent') || 'Unknown').slice(0, 500);
        const loginIP = clientIP;
        await env.DB.prepare('INSERT INTO sessions (id, user_id, device_info, ip) VALUES (?, ?, ?, ?)')
          .bind(sessionId, userRow.id, userAgent, loginIP).run();

        const jwtToken = await new SignJWT({ sub: userRow.id, username: userRow.username, role: 'user', sid: sessionId })
          .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(secret);
        return withSecurityHeaders(new Response(JSON.stringify({ token: jwtToken, user: { id: userRow.id, username: userRow.username, isAdmin: false } }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }));
      }

      // Fixed public endpoint: the bearer token stays in the JSON body, never
      // in a request URL (which infrastructure/observability commonly logs).
      // The browser-facing link stores it in the URL fragment for the same
      // reason; fragments are not sent in HTTP requests or Referer headers.
      if (url.pathname === '/api/shares/access' && request.method === 'POST') {
        const declaredLength = Number(request.headers.get('Content-Length'));
        if (Number.isFinite(declaredLength) && declaredLength > 1024) {
          return shareJson({ code: 'INVALID_REQUEST', message: 'Request body is too large' }, 413);
        }
        const rawBody = await request.text();
        if (new TextEncoder().encode(rawBody).byteLength > 1024) {
          return shareJson({ code: 'INVALID_REQUEST', message: 'Request body is too large' }, 413);
        }
        let body: unknown;
        try {
          body = rawBody.length > 0 ? JSON.parse(rawBody) : {};
        } catch {
          return shareJson({ code: 'INVALID_REQUEST', message: 'Invalid JSON body' }, 400);
        }
        if (!isJsonObject(body)) return shareJson({ code: 'INVALID_REQUEST', message: 'Request body must be an object' }, 400);
        if (typeof body.token !== 'string') return shareJson({ code: 'INVALID_REQUEST', message: 'token is required' }, 400);
        if (!SHARE_TOKEN_REGEX.test(body.token)) return shareJson({ code: 'SHARE_NOT_FOUND', message: 'Share not found' }, 404);

        const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
        // The IP-only bucket cannot be evaded by rotating random tokens and is
        // checked before any deliberately expensive bcrypt comparison.
        if (!(await checkRateLimit(env, `share-access-ip:${clientIP}`, 30, 60000))) {
          return shareJson({ code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' }, 429, { 'Retry-After': '60' });
        }

        const tokenHash = await sha256Hex(body.token);
        await ensureDosageShares(env);
        // Opportunistic, request-count driven rather than scheduled — same shape
        // as the rate_limits cleanup. This is the anonymous share-access path, so
        // it is the one endpoint guaranteed to see traffic even when no owner
        // signs in, which is exactly the case the other two scrubs miss.
        if (Math.random() < 0.1) ctx.waitUntil(sweepExpiredShares(env));
        const share = await env.DB.prepare(
          'SELECT password_hash, expires_at, is_live, share_mode, created_at, updated_at FROM dosage_shares WHERE token_hash = ?'
        ).bind(tokenHash).first() as {
          password_hash: string | null;
          expires_at: number | null;
          is_live: number;
          share_mode: DosageShareSnapshot['mode'] | null;
          created_at: number;
          updated_at: number | null;
        } | null;

        if (!share) {
          const candidate = typeof body.password === 'string' && body.password.length <= MAX_PASSWORD_LENGTH ? body.password : '';
          await bcrypt.compare(candidate, '$2b$10$BWJX6W9Wa9yJjNiLDyST0.m81EwzBBgeYjAertEWZnx15kTrQABJ.');
          return shareJson({ code: 'SHARE_NOT_FOUND', message: 'Share not found' }, 404);
        }

        // A second, token-specific bucket more tightly throttles guesses
        // against a real password-protected share. Deliberately NOT keyed on the
        // client IP: with the IP in the key this "per-token" limit rotated away
        // along with the IP, which on a deployment without a trusted edge left
        // the share password open to unlimited bcrypt guessing. Keyed on the
        // token alone it holds however the caller presents themselves. Only
        // reached for a token that resolves to a real share, so an attacker
        // cannot use it to lock out arbitrary shares they haven't found.
        if (!(await checkRateLimit(env, `share-access-token:${tokenHash.slice(0, 20)}`, 10, 60000))) {
          return shareJson({ code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' }, 429, { 'Retry-After': '60' });
        }

        const createdAt = share.created_at * 1000;
        const updatedAt = (share.updated_at ?? share.created_at) * 1000;
        const expiresAt = share.expires_at == null ? null : share.expires_at * 1000;
        if (share.expires_at != null && share.expires_at <= Math.floor(Date.now() / 1000)) {
          // Preserve a small tombstone so future requests still receive the
          // explicit expired status, but discard the sensitive payload.
          ctx.waitUntil(env.DB.prepare(
            "UPDATE dosage_shares SET snapshot_json = 'null', password_hash = NULL WHERE token_hash = ?"
          ).bind(tokenHash).run());
          return shareJson({ code: 'SHARE_EXPIRED', message: 'This share link has expired' }, 410);
        }

        if (share.password_hash) {
          if (body.password === undefined || body.password === '') {
            return shareJson({
              code: 'PASSWORD_REQUIRED',
              message: 'Password required',
              passwordRequired: true,
              // Deliberately nothing else. This branch is reached on token
              // possession alone, no credential checked, and `updated_at` is
              // rewritten on every owner sync — which the client fires a couple
              // of seconds after each dose is logged. Returning it here let
              // anyone holding a forwarded link poll a locked share and read off
              // exactly when the owner takes their medication.
            }, 401);
          }
          if (typeof body.password !== 'string') {
            return shareJson({ code: 'INVALID_REQUEST', message: 'password must be a string' }, 400);
          }
          if (body.password.length > MAX_PASSWORD_LENGTH) {
            return shareJson({ code: 'INVALID_PASSWORD', message: 'Incorrect password' }, 403);
          }
          const passwordValid = await bcrypt.compare(body.password, share.password_hash);
          if (!passwordValid) {
            return shareJson({ code: 'INVALID_PASSWORD', message: 'Incorrect password' }, 403);
          }
        }

        // Fetch the potentially large snapshot only after expiry and password
        // checks have succeeded, limiting unauthenticated DB/memory work.
        const snapshotRow = await env.DB.prepare(
          'SELECT snapshot_json FROM dosage_shares WHERE token_hash = ?'
        ).bind(tokenHash).first<{ snapshot_json: string }>();
        if (!snapshotRow || snapshotRow.snapshot_json === 'null') {
          return shareJson({ code: 'SHARE_NOT_FOUND', message: 'Share not found' }, 404);
        }
        return shareJson({
          passwordRequired: share.password_hash !== null,
          live: share.is_live === 1,
          createdAt,
          updatedAt,
          expiresAt,
          snapshot: JSON.parse(snapshotRow.snapshot_json),
        });
      }

      // -- Protected API Routes --
      const authHeader = request.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) return sessionInvalid('Unauthorized');
      const token = authHeader.split(' ')[1];
      const secret = new TextEncoder().encode(jwtSecret);

      try {
        const { payload } = await jwtVerify(token, secret);

        // jwtVerify only proves "signed with JWT_SECRET" — it says nothing about
        // what the token is FOR, and this worker signs several kinds with that
        // one secret. The passkey challenge tokens minted by the *public*,
        // credential-free /api/auth/passkey-options carry {challenge, purpose,
        // origin} and nothing else, so without these checks they sailed through
        // here: `sub` was undefined and, with no `sid`, the revocation and idle
        // checks below were skipped wholesale. Reject anything that isn't a
        // session token before it can be treated as one.
        const purpose = (payload as any).purpose;
        const sessionId = (payload as any).sid as string | undefined;
        if (typeof payload.sub !== 'string' || !payload.sub || purpose !== undefined) {
          return sessionInvalid('Invalid token');
        }
        // Every session token minted by this worker carries a `sid` (login,
        // register and passkey-verify all insert a sessions row first); the
        // admin token is the one deliberate exception.
        if (payload.role !== 'admin' && !sessionId) {
          return sessionInvalid('Invalid token');
        }
        const userId = payload.sub as string;

        // Session validation (only for user JWTs with a session ID)
        if (sessionId && payload.role !== 'admin') {
          await ensureSessions(env);
          const session = await env.DB.prepare('SELECT last_used_at FROM sessions WHERE id = ? AND user_id = ?').bind(sessionId, userId).first() as any;
          if (!session) {
            return sessionInvalid('Session expired or revoked');
          }
          const nowTs = Math.floor(Date.now() / 1000);
          const lastUsed = session.last_used_at ?? nowTs;
          // Idle timeout: a session unused beyond the window is revoked, even
          // though the JWT itself may still be within its 7-day lifetime. This
          // shrinks the window a stolen token stays usable on a dormant account.
          if (nowTs - lastUsed > SESSION_IDLE_TIMEOUT_SECONDS) {
            ctx.waitUntil(env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run());
            return sessionInvalid('Session expired due to inactivity');
          }
          // Lazy last_used_at update (only if >5 min stale)
          if (nowTs - lastUsed > 300) {
            ctx.waitUntil(env.DB.prepare('UPDATE sessions SET last_used_at = ? WHERE id = ?').bind(nowTs, sessionId).run());
          }
        }

        // --- Dosage sharing (owner management) ---
        if (url.pathname === '/api/shares' && request.method === 'POST') {
          if (!(await checkRateLimit(env, `share-create:${userId}`, 10, 60000))) {
            return shareJson({ code: 'RATE_LIMITED', message: 'Too many shares created. Please try again later.' }, 429, { 'Retry-After': '60' });
          }

          const declaredLength = Number(request.headers.get('Content-Length'));
          if (Number.isFinite(declaredLength) && declaredLength > MAX_SHARE_REQUEST_BYTES) {
            return shareJson({ code: 'SNAPSHOT_TOO_LARGE', message: 'Share snapshot exceeds the 2 MiB limit' }, 413);
          }
          const rawBody = await request.text();
          if (new TextEncoder().encode(rawBody).byteLength > MAX_SHARE_REQUEST_BYTES) {
            return shareJson({ code: 'SNAPSHOT_TOO_LARGE', message: 'Share snapshot exceeds the 2 MiB limit' }, 413);
          }

          let body: unknown;
          try {
            body = JSON.parse(rawBody);
          } catch {
            return shareJson({ code: 'INVALID_REQUEST', message: 'Invalid JSON body' }, 400);
          }
          if (!isJsonObject(body)) return shareJson({ code: 'INVALID_REQUEST', message: 'Request body must be an object' }, 400);

          const sanitized = sanitizeShareSnapshot(body.snapshot);
          if (!sanitized.snapshot) {
            return shareJson({ code: 'INVALID_SNAPSHOT', message: sanitized.error || 'Invalid share snapshot' }, 400);
          }

          if (body.live !== undefined && typeof body.live !== 'boolean') {
            return shareJson({ code: 'INVALID_REQUEST', message: 'live must be a boolean' }, 400);
          }
          const live = body.live === true;

          let password: string | null = null;
          if (body.password !== undefined && body.password !== null && body.password !== '') {
            if (typeof body.password !== 'string') return shareJson({ code: 'INVALID_REQUEST', message: 'password must be a string' }, 400);
            const passwordValidation = validatePassword(body.password);
            if (!passwordValidation.valid) return shareJson({ code: 'INVALID_PASSWORD', message: passwordValidation.error }, 400);
            password = body.password;
          }

          const nowSeconds = Math.floor(Date.now() / 1000);
          if (typeof body.expiresAt !== 'number' || !Number.isSafeInteger(body.expiresAt) || body.expiresAt <= 0 || body.expiresAt > 8_640_000_000_000_000) {
            return shareJson({ code: 'INVALID_EXPIRATION', message: 'expiresAt is required and must be a valid epoch-millisecond timestamp' }, 400);
          }
          const expiresAtSeconds = Math.floor(body.expiresAt / 1000);
          if (expiresAtSeconds <= nowSeconds) {
            return shareJson({ code: 'INVALID_EXPIRATION', message: 'expiresAt must be in the future' }, 400);
          }
          if (expiresAtSeconds > nowSeconds + MAX_SHARE_LIFETIME_SECONDS) {
            return shareJson({ code: 'INVALID_EXPIRATION', message: 'expiresAt may be at most 365 days in the future' }, 400);
          }

          // Treat the server receipt time as the snapshot provenance time;
          // clients cannot backdate or future-date a public snapshot.
          sanitized.snapshot.createdAt = nowSeconds * 1000;
          const snapshotJson = JSON.stringify(sanitized.snapshot);
          if (new TextEncoder().encode(snapshotJson).byteLength > MAX_SHARE_REQUEST_BYTES) {
            return shareJson({ code: 'SNAPSHOT_TOO_LARGE', message: 'Share snapshot exceeds the 2 MiB limit' }, 413);
          }

          await ensureDosageShares(env);
          // Was scoped to this author's own shares, which left every other
          // user's expired snapshot sitting there until they happened to create
          // one themselves. The sweep is global; the per-user tombstone trim
          // below still is not, since its cap is per user by design.
          await sweepExpiredShares(env);
          await env.DB.prepare(
            `DELETE FROM dosage_shares WHERE id IN (
              SELECT id FROM dosage_shares
              WHERE user_id = ? AND expires_at IS NOT NULL AND expires_at <= ?
              ORDER BY expires_at DESC LIMIT -1 OFFSET ?
            )`
          ).bind(userId, nowSeconds, MAX_EXPIRED_SHARE_TOMBSTONES_PER_USER).run();
          const activeShareCount = await env.DB.prepare(
            'SELECT COUNT(*) AS count FROM dosage_shares WHERE user_id = ? AND (expires_at IS NULL OR expires_at > ?)'
          ).bind(userId, nowSeconds).first<{ count: number }>();
          if ((activeShareCount?.count ?? 0) >= MAX_ACTIVE_SHARES_PER_USER) {
            return shareJson({ code: 'SHARE_LIMIT_REACHED', message: `A maximum of ${MAX_ACTIVE_SHARES_PER_USER} active share links is allowed` }, 409);
          }
          const id = crypto.randomUUID();
          const rawShareToken = b64urlEncode(crypto.getRandomValues(new Uint8Array(32)));
          const tokenHash = await sha256Hex(rawShareToken);
          const passwordHash = password ? await bcrypt.hash(password, 10) : null;
          await env.DB.prepare(
            'INSERT INTO dosage_shares (id, user_id, token_hash, snapshot_json, password_hash, expires_at, is_live, share_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(id, userId, tokenHash, snapshotJson, passwordHash, expiresAtSeconds, live ? 1 : 0, sanitized.snapshot.mode, nowSeconds, nowSeconds).run();

          return shareJson({
            id,
            token: rawShareToken,
            url: `${(env.PUBLIC_APP_ORIGIN || url.origin).replace(/\/+$/, '')}/share/#${rawShareToken}`,
            live,
            mode: sanitized.snapshot.mode,
            createdAt: nowSeconds * 1000,
            updatedAt: nowSeconds * 1000,
            expiresAt: expiresAtSeconds * 1000,
            passwordRequired: passwordHash !== null,
          }, 201);
        }

        if (url.pathname === '/api/shares/live' && request.method === 'PUT') {
          if (!(await checkRateLimit(env, `share-live-update:${userId}`, 30, 60000))) {
            return shareJson({ code: 'RATE_LIMITED', message: 'Too many live share updates. Please try again later.' }, 429, { 'Retry-After': '60' });
          }

          const declaredLength = Number(request.headers.get('Content-Length'));
          if (Number.isFinite(declaredLength) && declaredLength > MAX_SHARE_REQUEST_BYTES) {
            return shareJson({ code: 'SNAPSHOT_TOO_LARGE', message: 'Share snapshot exceeds the 2 MiB limit' }, 413);
          }
          const rawBody = await request.text();
          if (new TextEncoder().encode(rawBody).byteLength > MAX_SHARE_REQUEST_BYTES) {
            return shareJson({ code: 'SNAPSHOT_TOO_LARGE', message: 'Share snapshot exceeds the 2 MiB limit' }, 413);
          }

          let body: unknown;
          try {
            body = JSON.parse(rawBody);
          } catch {
            return shareJson({ code: 'INVALID_REQUEST', message: 'Invalid JSON body' }, 400);
          }
          if (!isJsonObject(body)) {
            return shareJson({ code: 'INVALID_REQUEST', message: 'Request body must be an object' }, 400);
          }
          const sanitized = sanitizeShareSnapshot(body.snapshot);
          if (!sanitized.snapshot) {
            return shareJson({ code: 'INVALID_SNAPSHOT', message: sanitized.error || 'Invalid share snapshot' }, 400);
          }

          const nowSeconds = Math.floor(Date.now() / 1000);
          sanitized.snapshot.createdAt = nowSeconds * 1000;
          const validatedSnapshotJson = JSON.stringify(sanitized.snapshot);
          if (new TextEncoder().encode(validatedSnapshotJson).byteLength > MAX_SHARE_REQUEST_BYTES) {
            return shareJson({ code: 'SNAPSHOT_TOO_LARGE', message: 'Share snapshot exceeds the 2 MiB limit' }, 413);
          }

          await ensureDosageShares(env);
          const activeLiveShares = await env.DB.prepare(
            `SELECT id FROM dosage_shares
             WHERE user_id = ? AND is_live = 1
               AND share_mode = ?
               AND (expires_at IS NULL OR expires_at > ?)`
          ).bind(userId, sanitized.snapshot.mode, nowSeconds).all<{ id: string }>();

          // Give every link a different set of opaque event identifiers. This
          // prevents recipients of separate links from correlating otherwise
          // identical records through caller-provided/local IDs.
          const updates = (activeLiveShares.results || []).map(({ id }) => {
            const snapshotForShare: DosageShareSnapshot = {
              ...sanitized.snapshot!,
              events: sanitized.snapshot!.events.map(event => ({
                ...event,
                id: crypto.randomUUID(),
                extras: { ...event.extras },
              })),
            };
            return env.DB.prepare(
              `UPDATE dosage_shares
               SET snapshot_json = ?, updated_at = ?
               WHERE id = ? AND user_id = ? AND is_live = 1
                 AND share_mode = ?
                 AND (expires_at IS NULL OR expires_at > ?)`
            ).bind(JSON.stringify(snapshotForShare), nowSeconds, id, userId, sanitized.snapshot!.mode, nowSeconds);
          });
          const results = updates.length > 0 ? await env.DB.batch(updates) : [];
          const updated = results.reduce((count, result) => count + (result.meta.changes ?? 0), 0);
          return shareJson({
            updated,
            updatedAt: nowSeconds * 1000,
          });
        }

        if (url.pathname === '/api/shares' && request.method === 'GET') {
          await ensureDosageShares(env);
          const nowSeconds = Math.floor(Date.now() / 1000);
          await env.DB.prepare(
            "UPDATE dosage_shares SET snapshot_json = 'null', password_hash = NULL WHERE user_id = ? AND expires_at IS NOT NULL AND expires_at <= ? AND (snapshot_json != 'null' OR password_hash IS NOT NULL)"
          ).bind(userId, nowSeconds).run();
          await env.DB.prepare(
            `DELETE FROM dosage_shares WHERE id IN (
              SELECT id FROM dosage_shares
              WHERE user_id = ? AND expires_at IS NOT NULL AND expires_at <= ?
              ORDER BY expires_at DESC LIMIT -1 OFFSET ?
            )`
          ).bind(userId, nowSeconds, MAX_EXPIRED_SHARE_TOMBSTONES_PER_USER).run();
          const rows = await env.DB.prepare(
            'SELECT id, password_hash, expires_at, is_live, share_mode, created_at, updated_at FROM dosage_shares WHERE user_id = ? ORDER BY created_at DESC'
          ).bind(userId).all();
          const shares = (rows.results || []).map((share: any) => ({
            id: share.id,
            live: share.is_live === 1,
            mode: share.share_mode,
            createdAt: share.created_at * 1000,
            updatedAt: (share.updated_at ?? share.created_at) * 1000,
            expiresAt: share.expires_at == null ? null : share.expires_at * 1000,
            passwordRequired: share.password_hash !== null,
            expired: share.expires_at != null && share.expires_at <= nowSeconds,
          }));
          return shareJson({ shares });
        }

        if (request.method === 'DELETE' && url.pathname.match(/^\/api\/shares\/[^/]+$/)) {
          await ensureDosageShares(env);
          const shareId = url.pathname.split('/').pop()!;
          const existing = await env.DB.prepare('SELECT id FROM dosage_shares WHERE id = ? AND user_id = ?').bind(shareId, userId).first();
          if (!existing) return shareJson({ code: 'SHARE_NOT_FOUND', message: 'Share not found' }, 404);
          await env.DB.prepare('DELETE FROM dosage_shares WHERE id = ? AND user_id = ?').bind(shareId, userId).run();
          return shareJson({ message: 'Share deleted' });
        }

        // Content
        if (url.pathname.startsWith('/api/content')) {
          if (url.pathname === '/api/content' && request.method === 'GET') {
            const metaOnly = url.searchParams.get('meta') === '1';
            if (metaOnly) {
              const content = await env.DB.prepare('SELECT id, created_at, LENGTH(data) AS data_size FROM content WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all();
              return withSecurityHeaders(new Response(JSON.stringify(content.results), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
            }
            const content = await env.DB.prepare('SELECT * FROM content WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all();
            return withSecurityHeaders(new Response(JSON.stringify(content.results), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }
          if (url.pathname === '/api/content' && request.method === 'POST') {
            // Same guard the share endpoints already apply. Without it this
            // buffered, parsed and re-serialised whatever was sent against the
            // isolate's memory ceiling, with no rate limit on the path either.
            if (!(await checkRateLimit(env, `content-write:${userId}`, 20, 60000))) {
              return withSecurityHeaders(new Response('Too many backups. Please try again later.', {
                status: 429, headers: { ...corsHeaders, 'Retry-After': '60' },
              }));
            }
            const declaredLength = Number(request.headers.get('Content-Length'));
            if (Number.isFinite(declaredLength) && declaredLength > MAX_SHARE_REQUEST_BYTES) {
              return withSecurityHeaders(new Response('Backup exceeds the 2 MiB limit', { status: 413, headers: corsHeaders }));
            }
            const rawBody = await request.text();
            if (new TextEncoder().encode(rawBody).byteLength > MAX_SHARE_REQUEST_BYTES) {
              return withSecurityHeaders(new Response('Backup exceeds the 2 MiB limit', { status: 413, headers: corsHeaders }));
            }
            let parsedBody: any;
            try { parsedBody = JSON.parse(rawBody); } catch {
              return withSecurityHeaders(new Response('Invalid JSON body', { status: 400, headers: corsHeaders }));
            }
            const data = parsedBody?.data;
            // `JSON.stringify(undefined)` is undefined, which the D1 bind below
            // rejects with a 500 — reject it here as the 400 it actually is.
            if (data === undefined) {
              return withSecurityHeaders(new Response('Missing data', { status: 400, headers: corsHeaders }));
            }
            const id = crypto.randomUUID();
            await env.DB.prepare('INSERT INTO content (id, user_id, data) VALUES (?, ?, ?)').bind(id, userId, JSON.stringify(data)).run();
            // Auto-prune: keep only the latest 10 backups per user
            const MAX_BACKUPS = 10;
            const old = await env.DB.prepare(
              'SELECT id FROM content WHERE user_id = ? ORDER BY created_at DESC LIMIT -1 OFFSET ?'
            ).bind(userId, MAX_BACKUPS).all();
            if (old.results.length > 0) {
              const ids = old.results.map((r: any) => r.id);
              await env.DB.prepare(
                `DELETE FROM content WHERE id IN (${ids.map(() => '?').join(',')})`
              ).bind(...ids).run();
            }
            return withSecurityHeaders(new Response(JSON.stringify({ message: 'Content saved', id }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }
          // Delete a specific backup (user can only delete their own)
          if (url.pathname.match(/^\/api\/content\/[^/]+$/) && request.method === 'DELETE') {
            const backupId = url.pathname.split('/').pop();
            await env.DB.prepare('DELETE FROM content WHERE id = ? AND user_id = ?').bind(backupId, userId).run();
            return withSecurityHeaders(new Response(JSON.stringify({ message: 'Backup deleted' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }
          // Load a specific backup by ID
          if (url.pathname.match(/^\/api\/content\/[^/]+$/) && request.method === 'GET') {
            const backupId = url.pathname.split('/').pop();
            const row = await env.DB.prepare('SELECT * FROM content WHERE id = ? AND user_id = ?').bind(backupId, userId).first();
            if (!row) return withSecurityHeaders(new Response('Not found', { status: 404, headers: corsHeaders }));
            return withSecurityHeaders(new Response(JSON.stringify(row), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }
        }

        // Profile / Password / Delete Me
        if (url.pathname.startsWith('/api/user/')) {
          if (url.pathname === '/api/user/profile' && request.method === 'PATCH') {
            let { username } = await request.json() as any;
            username = username.trim();
            if (!validateUsername(username)) return withSecurityHeaders(new Response('Invalid username', { status: 400, headers: corsHeaders }));
            const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
            if (existing && (existing as any).id !== userId) return withSecurityHeaders(new Response('Username taken', { status: 409, headers: corsHeaders }));
            await env.DB.prepare('UPDATE users SET username = ? WHERE id = ?').bind(username, userId).run();
            return withSecurityHeaders(new Response(JSON.stringify({ message: 'Profile updated', username }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }

          if (url.pathname === '/api/user/password' && request.method === 'POST') {
            const { currentPassword, newPassword } = await request.json() as any;
            const user = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(userId).first() as any;

            const dummyHash = '$2a$10$CCCCCCCCCCCCCCCCCCCCC.O0D3I6./CCCCCCCCCCCCCCCCCCCCCCC';
            const passwordHash = user ? user.password_hash : dummyHash;
            const passwordValid = await bcrypt.compare(currentPassword, passwordHash);

            if (!user || !passwordValid) return withSecurityHeaders(new Response('Incorrect password', { status: 401, headers: corsHeaders }));

            const passVal = validatePassword(newPassword);
            if (!passVal.valid) return withSecurityHeaders(new Response(passVal.error, { status: 400, headers: corsHeaders }));
            const hashed = await bcrypt.hash(newPassword, 10);
            await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(hashed, userId).run();
            // Changing the password is the standard response to "someone has my
            // account", so it has to invalidate whatever they took. Without this
            // a stolen 7-day JWT kept working after the change — and every
            // request refreshed last_used_at, so the idle timeout never fired
            // either. The caller's own session is kept so they stay signed in.
            if (sessionId) {
              await ensureSessions(env);
              await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').bind(userId, sessionId).run();
            }
            return withSecurityHeaders(new Response(JSON.stringify({ message: 'Password updated' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }

          if (url.pathname === '/api/user/me' && request.method === 'DELETE') {
            await ensureTotpColumn(env);
            const { password, code, backup_code } = await request.json() as any;
            const user = await env.DB.prepare('SELECT password_hash, created_at, totp_secret FROM users WHERE id = ?').bind(userId).first() as any;

            const dummyHash = '$2a$10$CCCCCCCCCCCCCCCCCCCCC.O0D3I6./CCCCCCCCCCCCCCCCCCCCCCC';
            const passwordHash = user ? user.password_hash : dummyHash;
            const passwordValid = await bcrypt.compare(password, passwordHash);

            if (!user || !passwordValid) return withSecurityHeaders(new Response('Incorrect password', { status: 401, headers: corsHeaders }));

            // If TOTP-based 2FA is enabled, require a valid authenticator code
            // (or a single-use backup code) before destroying the account.
            if (user.totp_secret) {
              if (!code && !backup_code) {
                return withSecurityHeaders(new Response('2FA code required', { status: 400, headers: corsHeaders }));
              }
              const twoFAValid = backup_code
                ? await verifyAndConsumeBackupCode(env, userId, String(backup_code), jwtSecret)
                : await consumeTOTP(env, userId, user.totp_secret, String(code));
              if (!twoFAValid) return withSecurityHeaders(new Response('Invalid 2FA code', { status: 400, headers: corsHeaders }));
            }

            await ensurePasskeys(env);
            await ensureBackupCodes(env);
            await ensureDosageShares(env);
            await env.DB.batch([
              env.DB.prepare('DELETE FROM dosage_shares WHERE user_id = ?').bind(userId),
              env.DB.prepare('DELETE FROM content WHERE user_id = ?').bind(userId),
              env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
              env.DB.prepare('DELETE FROM passkeys WHERE user_id = ?').bind(userId),
              env.DB.prepare('DELETE FROM backup_codes WHERE user_id = ?').bind(userId),
              env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId)
            ]);
            try { await env.AVATAR_BUCKET.delete(`hrt-tracker-user-avatar/${userId}`); } catch (e) { }
            await logDeletion(env, 'self', user?.created_at ?? null);
            return withSecurityHeaders(new Response(JSON.stringify({ message: 'Account deleted' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }
        }

        // Avatar PUT
        if (url.pathname === '/api/user/avatar' && request.method === 'PUT') {
          const body = await request.arrayBuffer();
          if (body.byteLength > 5 * 1024 * 1024) return withSecurityHeaders(new Response('File too large', { status: 413, headers: corsHeaders }));
          const view = new Uint8Array(body);
          let contentType = (view[0] === 0xFF && view[1] === 0xD8) ? 'image/jpeg' : (view[0] === 0x89 && view[1] === 0x50 ? 'image/png' : null);
          if (!contentType) return withSecurityHeaders(new Response('Invalid file type', { status: 415, headers: corsHeaders }));
          await env.AVATAR_BUCKET.put(`hrt-tracker-user-avatar/${userId}`, body, { httpMetadata: { contentType } });
          return withSecurityHeaders(new Response(JSON.stringify({ message: 'Avatar uploaded' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
        }

        // Admin
        if (url.pathname.startsWith('/api/admin/')) {
          if (payload.role !== 'admin') return withSecurityHeaders(new Response('Forbidden', { status: 403, headers: corsHeaders }));

          // Search users (with backup stats, paginated)
          if (url.pathname === '/api/admin/users' && request.method === 'GET') {
            const query = url.searchParams.get('q')?.trim();
            const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
            const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
            const offset = (page - 1) * limit;
            const whereClause = query ? 'WHERE u.username LIKE ?' : '';
            const countSql = `SELECT COUNT(DISTINCT u.id) AS total FROM users u ${query ? 'WHERE u.username LIKE ?' : ''}`;
            const countResult = query
              ? await env.DB.prepare(countSql).bind(`%${query}%`).first<{ total: number }>()
              : await env.DB.prepare(countSql).first<{ total: number }>();
            const total = countResult?.total ?? 0;
            const sql = `SELECT u.id, u.username, u.created_at,
              COUNT(c.id) AS backup_count,
              MAX(c.created_at) AS last_backup_at,
              COALESCE(SUM(LENGTH(c.data)), 0) AS total_backup_size
              FROM users u LEFT JOIN content c ON u.id = c.user_id
              ${whereClause}
              GROUP BY u.id ORDER BY u.username ASC LIMIT ? OFFSET ?`;
            const users = query
              ? await env.DB.prepare(sql).bind(`%${query}%`, limit, offset).all()
              : await env.DB.prepare(sql).bind(limit, offset).all();
            return withSecurityHeaders(new Response(JSON.stringify({ users: users.results, total, page, limit }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }

          // List user backups (metadata only)
          if (url.pathname.match(/^\/api\/admin\/users\/[^/]+\/backups$/) && request.method === 'GET') {
            const targetId = url.pathname.split('/')[4];
            const backups = await env.DB.prepare('SELECT id, created_at, LENGTH(data) AS data_size FROM content WHERE user_id = ? ORDER BY created_at DESC').bind(targetId).all();
            return withSecurityHeaders(new Response(JSON.stringify(backups.results), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }

          // Delete a specific backup
          if (url.pathname.match(/^\/api\/admin\/users\/[^/]+\/backups\/[^/]+$/) && request.method === 'DELETE') {
            const parts = url.pathname.split('/');
            const targetId = parts[4];
            const backupId = parts[6];
            await env.DB.prepare('DELETE FROM content WHERE id = ? AND user_id = ?').bind(backupId, targetId).run();
            return withSecurityHeaders(new Response(JSON.stringify({ message: 'Backup deleted' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }

          // Purge all backups for a user
          if (url.pathname.match(/^\/api\/admin\/users\/[^/]+\/backups$/) && request.method === 'DELETE') {
            const targetId = url.pathname.split('/')[4];
            await env.DB.prepare('DELETE FROM content WHERE user_id = ?').bind(targetId).run();
            return withSecurityHeaders(new Response(JSON.stringify({ message: 'All backups purged' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }

          // Admin change user password
          if (url.pathname.match(/^\/api\/admin\/users\/[^/]+\/password$/) && request.method === 'POST') {
            const targetId = url.pathname.split('/')[4];
            const body = await request.json() as any;
            const { newPassword } = body;
            if (!newPassword) return withSecurityHeaders(new Response('Missing new password', { status: 400, headers: corsHeaders }));
            const passVal = validatePassword(newPassword);
            if (!passVal.valid) return withSecurityHeaders(new Response(passVal.error!, { status: 400, headers: corsHeaders }));
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(hashedPassword, targetId).run();
            return withSecurityHeaders(new Response(JSON.stringify({ message: 'Password updated' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }

          // Admin reset username
          if (url.pathname.match(/^\/api\/admin\/users\/[^/]+\/username$/) && request.method === 'PATCH') {
            const targetId = url.pathname.split('/')[4];
            const body = await request.json() as any;
            const { username } = body;
            if (!username) return withSecurityHeaders(new Response('Missing username', { status: 400, headers: corsHeaders }));
            const trimmed = username.trim();
            if (!validateUsername(trimmed)) return withSecurityHeaders(new Response('Invalid username format', { status: 400, headers: corsHeaders }));
            const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ? AND id != ?').bind(trimmed, targetId).first();
            if (existing) return withSecurityHeaders(new Response('Username already taken', { status: 409, headers: corsHeaders }));
            await env.DB.prepare('UPDATE users SET username = ? WHERE id = ?').bind(trimmed, targetId).run();
            return withSecurityHeaders(new Response(JSON.stringify({ message: 'Username updated' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }

          // Admin reset avatar
          if (url.pathname.match(/^\/api\/admin\/users\/[^/]+\/avatar$/) && request.method === 'DELETE') {
            const targetId = url.pathname.split('/')[4];
            try { await env.AVATAR_BUCKET.delete(`hrt-tracker-user-avatar/${targetId}`); } catch (e) { }
            return withSecurityHeaders(new Response(JSON.stringify({ message: 'Avatar reset' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }

          // Delete user
          if (url.pathname.match(/^\/api\/admin\/users\/[^/]+$/) && request.method === 'DELETE') {
            const targetId = url.pathname.split('/').pop();
            if (targetId === 'admin') {
              return withSecurityHeaders(new Response('Cannot delete admin account', { status: 400, headers: corsHeaders }));
            }
            const target = await env.DB.prepare('SELECT created_at FROM users WHERE id = ?').bind(targetId).first() as any;
            await ensurePasskeys(env);
            await ensureBackupCodes(env);
            await ensureDosageShares(env);
            await env.DB.batch([
              env.DB.prepare('DELETE FROM dosage_shares WHERE user_id = ?').bind(targetId),
              env.DB.prepare('DELETE FROM content WHERE user_id = ?').bind(targetId),
              env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(targetId),
              env.DB.prepare('DELETE FROM passkeys WHERE user_id = ?').bind(targetId),
              env.DB.prepare('DELETE FROM backup_codes WHERE user_id = ?').bind(targetId),
              env.DB.prepare('DELETE FROM users WHERE id = ?').bind(targetId)
            ]);
            try { await env.AVATAR_BUCKET.delete(`hrt-tracker-user-avatar/${targetId}`); } catch (e) { }
            if (target) await logDeletion(env, 'admin', target?.created_at ?? null);
            return withSecurityHeaders(new Response(JSON.stringify({ message: 'User deleted' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }
        }

        // --- Session Management ---
        if (url.pathname.startsWith('/api/user/sessions')) {
          await ensureSessions(env);

          // GET /api/user/sessions — list all sessions for this user
          if (url.pathname === '/api/user/sessions' && request.method === 'GET') {
            const rows = await env.DB.prepare(
              'SELECT id, created_at, last_used_at, device_info, ip FROM sessions WHERE user_id = ? ORDER BY last_used_at DESC'
            ).bind(userId).all();
            const currentSid = sessionId ?? null;
            const sessions = (rows.results || []).map((s: any) => ({
              id: s.id,
              created_at: s.created_at,
              last_used_at: s.last_used_at,
              device_info: s.device_info,
              ip: s.ip,
              is_current: s.id === currentSid,
            }));
            return withSecurityHeaders(new Response(JSON.stringify(sessions), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }

          // DELETE /api/user/sessions — terminate all other sessions (keep current)
          if (url.pathname === '/api/user/sessions' && request.method === 'DELETE') {
            if (sessionId) {
              await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').bind(userId, sessionId).run();
            } else {
              await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
            }
            return withSecurityHeaders(new Response(JSON.stringify({ message: 'Other sessions terminated' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }

          // DELETE /api/user/sessions/:id — terminate a specific session
          if (url.pathname.match(/^\/api\/user\/sessions\/[^/]+$/) && request.method === 'DELETE') {
            const targetSid = url.pathname.split('/').pop()!;
            await env.DB.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').bind(targetSid, userId).run();
            return withSecurityHeaders(new Response(JSON.stringify({ message: 'Session terminated' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }
        }

        // --- Two-Factor Authentication (TOTP) ---
        if (url.pathname.startsWith('/api/user/2fa')) {
          await ensureTotpColumn(env);

          // GET /api/user/2fa/status
          if (url.pathname === '/api/user/2fa/status' && request.method === 'GET') {
            const row = await env.DB.prepare('SELECT totp_secret FROM users WHERE id = ?').bind(userId).first() as any;
            await ensurePasskeys(env);
            const pkRow = await env.DB.prepare('SELECT COUNT(*) as cnt FROM passkeys WHERE user_id = ?').bind(userId).first() as any;
            const passkeyCount = pkRow?.cnt ?? 0;
            return withSecurityHeaders(new Response(JSON.stringify({ enabled: !!(row?.totp_secret) || passkeyCount > 0, totp: !!row?.totp_secret, passkey: passkeyCount > 0 }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }

          // POST /api/user/2fa/setup — generate a new TOTP secret (not saved yet)
          if (url.pathname === '/api/user/2fa/setup' && request.method === 'POST') {
            const userRow = await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(userId).first() as any;
            const username = userRow?.username ?? userId;
            const totpSecret = generateTOTPSecret();
            const issuer = 'HRT Tracker';
            const uri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(username)}?secret=${totpSecret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
            return withSecurityHeaders(new Response(JSON.stringify({ secret: totpSecret, uri }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }

          // POST /api/user/2fa/enable — verify code and save secret to DB
          if (url.pathname === '/api/user/2fa/enable' && request.method === 'POST') {
            const { secret: totpSecret, code, password, currentCode } = await request.json() as any;
            if (!totpSecret || !code) return withSecurityHeaders(new Response('Missing secret or code', { status: 400, headers: corsHeaders }));
            // Validate secret format (base32 chars, 16-32 chars)
            if (!/^[A-Z2-7]{16,64}$/i.test(totpSecret)) return withSecurityHeaders(new Response('Invalid secret format', { status: 400, headers: corsHeaders }));

            // Re-enrolment is a credential *replacement*, so it needs the same
            // proof DELETE /api/user/2fa asks for. Without this, anyone holding
            // a stolen bearer token could pick their own secret, verify it
            // against itself, overwrite the victim's, and wipe every backup code
            // in one request — locking the real owner out permanently, since
            // both disabling 2FA and deleting the account then demand a code
            // from the attacker's secret. First-time enrolment is unaffected.
            const existing = await env.DB.prepare('SELECT password_hash, totp_secret FROM users WHERE id = ?').bind(userId).first() as any;
            if (existing?.totp_secret) {
              if (!password || !currentCode) {
                return withSecurityHeaders(new Response('2FA is already enabled: current password and a code from the current authenticator are required', { status: 400, headers: corsHeaders }));
              }
              const dummyHash = '$2a$10$CCCCCCCCCCCCCCCCCCCCC.O0D3I6./CCCCCCCCCCCCCCCCCCCCCCC';
              const passValid = await bcrypt.compare(password, existing.password_hash ?? dummyHash);
              if (!passValid) return withSecurityHeaders(new Response('Incorrect password', { status: 401, headers: corsHeaders }));
              const currentValid = await consumeTOTP(env, userId, existing.totp_secret, String(currentCode));
              if (!currentValid) return withSecurityHeaders(new Response('Invalid code from current authenticator', { status: 401, headers: corsHeaders }));
            }

            const valid = await verifyTOTP(totpSecret, String(code));
            if (!valid) return withSecurityHeaders(new Response('Invalid 2FA code', { status: 400, headers: corsHeaders }));
            await env.DB.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').bind(totpSecret, userId).run();
            const backupCodes = await generateAndStoreBackupCodes(env, userId, jwtSecret);
            return withSecurityHeaders(new Response(JSON.stringify({ message: '2FA enabled', backupCodes }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }

          // DELETE /api/user/2fa — disable 2FA (requires current password + TOTP code)
          if (url.pathname === '/api/user/2fa' && request.method === 'DELETE') {
            const { password, code } = await request.json() as any;
            if (!password || !code) return withSecurityHeaders(new Response('Missing password or code', { status: 400, headers: corsHeaders }));
            const userRow = await env.DB.prepare('SELECT password_hash, totp_secret FROM users WHERE id = ?').bind(userId).first() as any;
            if (!userRow) return withSecurityHeaders(new Response('User not found', { status: 404, headers: corsHeaders }));
            const dummyHash = '$2a$10$CCCCCCCCCCCCCCCCCCCCC.O0D3I6./CCCCCCCCCCCCCCCCCCCCCCC';
            const passValid = await bcrypt.compare(password, userRow.password_hash ?? dummyHash);
            if (!passValid) return withSecurityHeaders(new Response('Incorrect password', { status: 401, headers: corsHeaders }));
            if (!userRow.totp_secret) return withSecurityHeaders(new Response('2FA is not enabled', { status: 400, headers: corsHeaders }));
            const totpValid = await consumeTOTP(env, userId, userRow.totp_secret, String(code));
            if (!totpValid) return withSecurityHeaders(new Response('Invalid 2FA code', { status: 400, headers: corsHeaders }));
            await env.DB.prepare('UPDATE users SET totp_secret = NULL WHERE id = ?').bind(userId).run();
            return withSecurityHeaders(new Response(JSON.stringify({ message: '2FA disabled' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }

          // GET /api/user/2fa/backup-codes — count of remaining unused codes
          if (url.pathname === '/api/user/2fa/backup-codes' && request.method === 'GET') {
            await ensureBackupCodes(env);
            const row = await env.DB.prepare(
              'SELECT COUNT(*) as cnt FROM backup_codes WHERE user_id = ? AND used_at IS NULL'
            ).bind(userId).first() as any;
            return withSecurityHeaders(new Response(JSON.stringify({ remaining: row?.cnt ?? 0 }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }

          // POST /api/user/2fa/backup-codes/generate — regenerate backup codes
          if (url.pathname === '/api/user/2fa/backup-codes/generate' && request.method === 'POST') {
            // Regenerating deletes every existing code (generateAndStoreBackupCodes
            // opens with DELETE FROM backup_codes), so it destroys the recovery
            // path and needs the password — same reasoning as re-enrolment above.
            const { password } = await request.json().catch(() => ({})) as any;
            if (!password) return withSecurityHeaders(new Response('Current password is required', { status: 400, headers: corsHeaders }));
            const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(userId).first() as any;
            const dummyHash = '$2a$10$CCCCCCCCCCCCCCCCCCCCC.O0D3I6./CCCCCCCCCCCCCCCCCCCCCCC';
            if (!(await bcrypt.compare(password, row?.password_hash ?? dummyHash))) {
              return withSecurityHeaders(new Response('Incorrect password', { status: 401, headers: corsHeaders }));
            }
            const codes = await generateAndStoreBackupCodes(env, userId, jwtSecret);
            return withSecurityHeaders(new Response(JSON.stringify({ codes }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }
        }

        // --- Passkeys (WebAuthn) ---
        if (url.pathname.startsWith('/api/user/passkeys') || url.pathname.startsWith('/api/user/passkey')) {
          await ensurePasskeys(env);

          // GET /api/user/passkeys — list user's registered passkeys
          if (url.pathname === '/api/user/passkeys' && request.method === 'GET') {
            const rows = await env.DB.prepare(
              'SELECT id, credential_id, device_name, created_at FROM passkeys WHERE user_id = ? ORDER BY created_at DESC'
            ).bind(userId).all();
            return withSecurityHeaders(new Response(JSON.stringify(rows.results || []), {
              status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }));
          }

          // POST /api/user/passkey/register-options — generate registration challenge
          if (url.pathname === '/api/user/passkey/register-options' && request.method === 'POST') {
            const userRow = await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(userId).first() as any;
            const origin = request.headers.get('Origin') || `https://${url.hostname}`;
            const rpId = (() => { try { return new URL(origin).hostname; } catch { return url.hostname; } })();
            const challenge = b64urlEncode(crypto.getRandomValues(new Uint8Array(32)));
            const secret = new TextEncoder().encode(jwtSecret);
            const challengeToken = await new SignJWT({ challenge, purpose: 'passkey-register', uid: userId, origin })
              .setProtectedHeader({ alg: 'HS256' }).setExpirationTime('5m').sign(secret);
            const userIdEncoded = b64urlEncode(new TextEncoder().encode(userId));
            return withSecurityHeaders(new Response(JSON.stringify({
              challengeToken,
              challenge,
              rp: { id: rpId, name: 'HRT Tracker' },
              user: { id: userIdEncoded, name: userRow?.username || userId, displayName: userRow?.username || userId },
              pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
              timeout: 60000,
              authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
              attestation: 'none',
            }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
          }

          // POST /api/user/passkey/register — verify attestation and save passkey
          if (url.pathname === '/api/user/passkey/register' && request.method === 'POST') {
            const { challengeToken, credential, deviceName } = await request.json() as any;
            if (!challengeToken || !credential?.response) {
              return withSecurityHeaders(new Response('Missing data', { status: 400, headers: corsHeaders }));
            }
            const secret = new TextEncoder().encode(jwtSecret);
            let challengePayload: any;
            try {
              const { payload } = await jwtVerify(challengeToken, secret);
              challengePayload = payload;
            } catch {
              return withSecurityHeaders(new Response('Invalid or expired challenge', { status: 400, headers: corsHeaders }));
            }
            if (challengePayload.purpose !== 'passkey-register' || challengePayload.uid !== userId) {
              return withSecurityHeaders(new Response('Invalid challenge', { status: 400, headers: corsHeaders }));
            }
            const expectedOrigin = challengePayload.origin as string;
            const expectedRpId = (() => { try { return new URL(expectedOrigin).hostname; } catch { return url.hostname; } })();

            // Verify clientDataJSON
            const clientData = JSON.parse(new TextDecoder().decode(b64urlDecode(credential.response.clientDataJSON)));
            if (clientData.type !== 'webauthn.create') return withSecurityHeaders(new Response('Wrong type', { status: 400, headers: corsHeaders }));
            const receivedChallenge = clientData.challenge.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
            if (receivedChallenge !== (challengePayload.challenge as string).replace(/=/g, '')) {
              return withSecurityHeaders(new Response('Challenge mismatch', { status: 400, headers: corsHeaders }));
            }
            if (clientData.origin !== expectedOrigin) return withSecurityHeaders(new Response('Origin mismatch', { status: 400, headers: corsHeaders }));

            // Verify attestationObject (CBOR)
            const attObj = decodeCBOR(b64urlDecode(credential.response.attestationObject));
            const authData = attObj['authData'] as Uint8Array;
            const rpHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(expectedRpId)));
            const { rpIdHash, flags, signCount, credentialId, publicKeyX, publicKeyY } = parseAuthData(authData);
            if (!rpIdHash.every((v: number, i: number) => v === rpHash[i])) return withSecurityHeaders(new Response('RP ID mismatch', { status: 400, headers: corsHeaders }));
            if (!(flags & 1)) return withSecurityHeaders(new Response('User presence not set', { status: 400, headers: corsHeaders }));
            if (!credentialId || !publicKeyX || !publicKeyY) return withSecurityHeaders(new Response('No credential data in authData', { status: 400, headers: corsHeaders }));

            const credentialIdStr = b64urlEncode(credentialId);
            const existing = await env.DB.prepare('SELECT id FROM passkeys WHERE credential_id = ?').bind(credentialIdStr).first();
            if (existing) return withSecurityHeaders(new Response('Credential already registered', { status: 409, headers: corsHeaders }));

            // Check if this is the first passkey (to auto-generate backup codes)
            const pkCountRow = await env.DB.prepare('SELECT COUNT(*) as cnt FROM passkeys WHERE user_id = ?').bind(userId).first() as any;
            const isFirstPasskey = (pkCountRow?.cnt ?? 0) === 0;

            const id = crypto.randomUUID();
            await env.DB.prepare(
              'INSERT INTO passkeys (id, user_id, credential_id, public_key_x, public_key_y, counter, device_name) VALUES (?, ?, ?, ?, ?, ?, ?)'
            ).bind(id, userId, credentialIdStr, b64urlEncode(publicKeyX), b64urlEncode(publicKeyY), signCount, deviceName || null).run();

            let backupCodes: string[] | undefined;
            if (isFirstPasskey) {
              // Check if user already has backup codes (e.g. from TOTP setup)
              await ensureBackupCodes(env);
              const bcRow = await env.DB.prepare('SELECT COUNT(*) as cnt FROM backup_codes WHERE user_id = ?').bind(userId).first() as any;
              if ((bcRow?.cnt ?? 0) === 0) {
                backupCodes = await generateAndStoreBackupCodes(env, userId, jwtSecret);
              }
            }

            return withSecurityHeaders(new Response(JSON.stringify({ message: 'Passkey registered', id, backupCodes }), {
              status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }));
          }

          // DELETE /api/user/passkeys/:id — remove a passkey
          if (url.pathname.match(/^\/api\/user\/passkeys\/[^/]+$/) && request.method === 'DELETE') {
            const passkeyId = url.pathname.split('/').pop();
            // Deleting the last passkey drops a passkey-only account back to
            // username+password (the login path demands an assertion purely
            // because the passkeys table is non-empty), so this weakens
            // authentication and needs the password — the same bar DELETE
            // /api/user/2fa sets for the equivalent TOTP action.
            const { password: pkPassword } = await request.json().catch(() => ({})) as any;
            if (!pkPassword) return withSecurityHeaders(new Response('Current password is required', { status: 400, headers: corsHeaders }));
            const pkUser = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(userId).first() as any;
            const pkDummy = '$2a$10$CCCCCCCCCCCCCCCCCCCCC.O0D3I6./CCCCCCCCCCCCCCCCCCCCCCC';
            if (!(await bcrypt.compare(pkPassword, pkUser?.password_hash ?? pkDummy))) {
              return withSecurityHeaders(new Response('Incorrect password', { status: 401, headers: corsHeaders }));
            }
            await env.DB.prepare('DELETE FROM passkeys WHERE id = ? AND user_id = ?').bind(passkeyId, userId).run();
            return withSecurityHeaders(new Response(JSON.stringify({ message: 'Passkey deleted' }), {
              status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }));
          }
        }

        return withSecurityHeaders(new Response('Not Found', { status: 404, headers: corsHeaders }));

      } catch (e: any) {
        if (e.name === 'JWTExpired' || e.name === 'JWSSignatureVerificationFailed' || e.name === 'JWTInvalid' || e.name === 'JWSInvalid' || e.message?.includes('token')) {
          return sessionInvalid('Invalid token');
        }
        throw e;
      }

    } catch (err: any) {
      console.error('API Error:', err);
      // Sanitize internal error messages for production
      // `url` is reconstructed from the request's Host header, which the caller
      // sets. Gating error verbosity on it meant `Host: localhost` turned raw
      // exception text back on for anyone who asked. Deployment config decides.
      const isProd = (env.ENVIRONMENT ?? 'production') !== 'development';
      const message = isProd ? 'Internal Server Error' : (err.message || 'Internal Server Error');
      return withSecurityHeaders(new Response(message, { status: 500, headers: corsHeaders }));
    }
  },
};
