/**
 * DISCLONER - Environment Configuration Contract
 *
 * Every tunable lives here, is parsed once at boot, and is validated with an
 * explicit, human-readable message. Invalid values never crash the process in
 * development, but `strict` mode (used by Docker) refuses to start so a
 * misconfigured deployment fails loudly instead of silently degrading.
 */

import path from 'node:path';
import { APP_VERSION } from './configContract.js';

/** @typedef {{ value: any, raw: string|undefined, source: 'env'|'default', warning?: string }} Resolved */

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);
const FALSY = new Set(['0', 'false', 'no', 'off', '']);

function parseBoolean(env, key, fallback, warnings) {
    const raw = env[key];
    if (raw === undefined) return fallback;
    const normalized = String(raw).trim().toLowerCase();
    if (TRUTHY.has(normalized)) return true;
    if (FALSY.has(normalized)) return false;
    warnings.push(`${key}="${raw}" is not a boolean; using default ${fallback}.`);
    return fallback;
}

function parseInteger(env, key, fallback, { min, max }, warnings) {
    const raw = env[key];
    if (raw === undefined || String(raw).trim() === '') return fallback;

    const parsed = Number.parseInt(String(raw).trim(), 10);
    if (!Number.isInteger(parsed)) {
        warnings.push(`${key}="${raw}" is not an integer; using default ${fallback}.`);
        return fallback;
    }
    if (parsed < min || parsed > max) {
        const clamped = Math.min(max, Math.max(min, parsed));
        warnings.push(`${key}=${parsed} is outside [${min}, ${max}]; clamped to ${clamped}.`);
        return clamped;
    }
    return parsed;
}

function parseEnum(env, key, allowed, fallback, warnings) {
    const raw = env[key];
    if (raw === undefined || String(raw).trim() === '') return fallback;
    const normalized = String(raw).trim();
    if (!allowed.includes(normalized)) {
        warnings.push(`${key}="${raw}" must be one of ${allowed.join(', ')}; using "${fallback}".`);
        return fallback;
    }
    return normalized;
}

function parseOrigins(env, key, warnings) {
    const raw = env[key];
    if (raw === undefined || String(raw).trim() === '') return null;

    const origins = String(raw).split(',').map(v => v.trim()).filter(Boolean);
    if (origins.length === 0) return null;

    for (const origin of origins) {
        if (origin === '*') continue;
        try {
            // Throws for malformed values such as "example.com" (no scheme).
            new URL(origin);
        } catch {
            warnings.push(`${key} contains "${origin}", which is not a valid URL origin; keeping it as-is but CORS may reject it.`);
        }
    }
    return origins;
}

/**
 * Pure environment parser. Exporting it separately keeps configuration logic
 * testable without touching `process.env` or the filesystem.
 *
 * @param {Record<string, string|undefined>} env
 * @param {{ cwd?: string }} [options]
 */
export function parseConfig(env = {}, options = {}) {
    const warnings = [];
    const cwd = options.cwd || process.cwd();

    const nodeEnv = env.NODE_ENV || 'development';
    const isProduction = nodeEnv === 'production';

    const config = {
        nodeEnv,
        isProduction,
        version: APP_VERSION,
        port: parseInteger(env, 'PORT', 3000, { min: 1, max: 65535 }, warnings),
        host: env.HOST && env.HOST.trim() ? env.HOST.trim() : '0.0.0.0',
        allowedOrigins: parseOrigins(env, 'ALLOWED_ORIGINS', warnings),

        // Concurrency & queue
        maxConcurrentJobs: parseInteger(env, 'MAX_CONCURRENT_JOBS', 2, { min: 1, max: 5 }, warnings),
        maxQueuedJobs: parseInteger(env, 'MAX_QUEUED_JOBS', 20, { min: 1, max: 200 }, warnings),
        maxMirrorSessions: parseInteger(env, 'MAX_MIRROR_SESSIONS', 1, { min: 1, max: 5 }, warnings),

        // Persistence
        persistJobs: parseBoolean(env, 'PERSIST_JOBS', true, warnings),
        stateDir: path.resolve(cwd, env.JOB_STATE_DIR || '.discloner/state'),
        stateRetentionDays: parseInteger(env, 'STATE_RETENTION_DAYS', 7, { min: 0, max: 90 }, warnings),

        // Observability
        logLevel: parseEnum(env, 'LOG_LEVEL', ['debug', 'info', 'warn', 'error', 'silent'], 'info', warnings),
        logFormat: parseEnum(env, 'LOG_FORMAT', ['pretty', 'json'], isProduction ? 'json' : 'pretty', warnings),

        // Feature flags (all default on for fresh installs, can be disabled)
        features: {
            continuousMirror: parseBoolean(env, 'FEATURE_CONTINUOUS_MIRROR', true, warnings),
            multiJobQueue: parseBoolean(env, 'FEATURE_MULTI_JOB', true, warnings),
            resumableJobs: parseBoolean(env, 'FEATURE_RESUME', true, warnings),
            telemetry: parseBoolean(env, 'FEATURE_TELEMETRY', false, warnings)
        },

        // Opt-in anonymous telemetry. Nothing is ever sent unless both a
        // collector endpoint is configured AND the operator opts in.
        telemetryEndpoint: env.TELEMETRY_ENDPOINT || null,
        telemetryOptIn: parseBoolean(env, 'TELEMETRY_OPT_IN', false, warnings),

        // Graceful shutdown budget (ms) for in-flight Discord teardown.
        shutdownGraceMs: parseInteger(env, 'SHUTDOWN_GRACE_MS', 8000, { min: 500, max: 60000 }, warnings)
    };

    /** @type {string[]} */
    const errors = [];

    if (!/^[a-zA-Z0-9.\-_/:[\]]+$/.test(config.host) && config.host !== '0.0.0.0') {
        // Catches obvious typos such as "local host" without rejecting IPv6 forms.
        errors.push(`HOST="${config.host}" does not look like a valid bind address.`);
    }

    if (config.telemetryOptIn && !config.telemetryEndpoint) {
        warnings.push('TELEMETRY_OPT_IN is enabled but TELEMETRY_ENDPOINT is not set; telemetry stays local-only.');
    }

    if (config.allowedOrigins && config.allowedOrigins.includes('*')) {
        warnings.push('ALLOWED_ORIGINS contains "*": any website can open a Socket.IO connection. Prefer an explicit allowlist.');
    }

    if (!config.persistJobs) {
        warnings.push('PERSIST_JOBS is disabled; jobs will not survive a restart and resume will be unavailable.');
    }

    return { config, warnings, errors };
}

/**
 * Loads configuration from `process.env`, logging warnings, and aborting on
 * hard errors when `strict` is requested.
 *
 * @param {Record<string, string|undefined>} [env]
 * @param {{ strict?: boolean, cwd?: string }} [options]
 */
export function loadConfig(env = process.env, options = {}) {
    const { config, warnings, errors } = parseConfig(env, options);
    const strict = options.strict ?? config.isProduction;

    if (strict && errors.length > 0) {
        const message = ['Invalid configuration:', ...errors.map(e => `  - ${e}`)].join('\n');
        const error = new Error(message);
        // @ts-ignore - attach structured context for the caller
        error.code = 'CONFIG_INVALID';
        throw error;
    }

    return { config, warnings, errors };
}

/** @type {ReturnType<typeof parseConfig>['config'] | null} */
let cached = null;

/**
 * Returns the process-wide configuration, parsing on first use.
 */
export function getConfig() {
    if (!cached) {
        const { config, warnings } = loadConfig(process.env, { strict: false });
        for (const warning of warnings) {
            // eslint-disable-next-line no-console
            console.warn(`[CONFIG] ${warning}`);
        }
        cached = config;
    }
    return cached;
}

/**
 * Test helper: replaces the cached configuration.
 * @param {any} next
 */
export function setConfigForTests(next) {
    cached = next;
}
