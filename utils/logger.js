/**
 * Structured Logging, Redaction & Sinks
 *
 * Token safety model (unchanged):
 *  1. Pattern-based redaction catches token-shaped strings (Discord's
 *     base64.segment.signature format) even when we never saw the token.
 *  2. Exact-value redaction covers tokens that do not match the common shape.
 *     Call registerSecret() as soon as a credential is accepted, and the raw
 *     value is scrubbed from every log line, error detail, and socket payload.
 *
 * New in v3:
 *  - Levelled logger with `debug/info/warn/error` and child contexts.
 *  - Pluggable sinks (pretty console, JSON console, custom collectors).
 *  - Every message passes through sanitizeText before it is emitted.
 */

const TOKEN_PATTERN = /([a-zA-Z0-9_-]{18,}\.[a-zA-Z0-9_-]{4,}\.[a-zA-Z0-9_-]{20,})/g;
const GENERIC_TOKEN_PATTERN = /(mfa\.[a-zA-Z0-9_-]{20,})/g;
const BEARER_PATTERN = /(Bot\s+[a-zA-Z0-9._-]{20,})/g;

const MAX_REGISTERED_SECRETS = 25;
const MIN_SECRET_LENGTH = 8;
const REDACTED = '[REDACTED_TOKEN]';

/** Exact credential values to scrub (bounded, insertion-ordered). */
const registeredSecrets = new Set();

/**
 * Registers a live credential so every future sanitization pass redacts it,
 * regardless of its shape. Values shorter than 8 chars are ignored so that
 * ordinary words cannot be turned into global redactions.
 */
export function registerSecret(value) {
    if (typeof value !== 'string') return;
    const secret = value.trim();
    if (secret.length < MIN_SECRET_LENGTH) return;

    if (registeredSecrets.size >= MAX_REGISTERED_SECRETS && !registeredSecrets.has(secret)) {
        registeredSecrets.delete(registeredSecrets.values().next().value);
    }
    registeredSecrets.add(secret);
}

export function clearRegisteredSecrets() {
    registeredSecrets.clear();
}

export function getRegisteredSecretCount() {
    return registeredSecrets.size;
}

function redactRegisteredSecrets(text) {
    if (registeredSecrets.size === 0) return text;

    let output = text;
    for (const secret of registeredSecrets) {
        if (!secret) continue;
        if (output.includes(secret)) {
            output = output.split(secret).join(REDACTED);
        }
    }
    return output;
}

export function sanitizeText(text) {
    if (!text || typeof text !== 'string') return text;
    return redactRegisteredSecrets(text)
        .replace(TOKEN_PATTERN, REDACTED)
        .replace(GENERIC_TOKEN_PATTERN, REDACTED)
        .replace(BEARER_PATTERN, `Bot ${REDACTED}`);
}

export function formatTimestamp(date = new Date()) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

export function createLogEntry(type, message, detail = null, stage = null) {
    return {
        id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        type: ['info', 'success', 'warning', 'error', 'stage'].includes(type) ? type : 'info',
        message: sanitizeText(message),
        detail: detail ? sanitizeText(detail) : null,
        stage: stage || null,
        timestamp: formatTimestamp()
    };
}

/* ==========================================================================
   Levelled logger
   ========================================================================== */

const LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40, silent: 100 });

/** @type {{ level: string, format: 'pretty'|'json', sinks: Array<(record:any)=>void> }} */
const loggerState = {
    level: 'info',
    format: 'pretty',
    sinks: []
};

/**
 * @param {{ level?: string, format?: 'pretty'|'json', sink?: (record:any)=>void }} [options]
 */
export function configureLogger(options = {}) {
    if (options.level && Object.prototype.hasOwnProperty.call(LEVELS, options.level)) {
        loggerState.level = options.level;
    }
    if (options.format === 'pretty' || options.format === 'json') {
        loggerState.format = options.format;
    }
    if (typeof options.sink === 'function') {
        loggerState.sinks.push(options.sink);
    }
}

export function getLoggerState() {
    return { level: loggerState.level, format: loggerState.format, sinkCount: loggerState.sinks.length };
}

function shouldLog(level) {
    return LEVELS[level] >= LEVELS[loggerState.level];
}

function serializeContext(context = {}) {
    /** @type {Record<string, any>} */
    const safe = {};
    for (const [key, value] of Object.entries(context)) {
        if (value === undefined || value === null) continue;
        if (value instanceof Error) {
            safe[key] = sanitizeText(value.message);
            continue;
        }
        if (typeof value === 'object') {
            try {
                safe[key] = JSON.parse(sanitizeText(JSON.stringify(value)));
            } catch {
                safe[key] = '[unserializable]';
            }
            continue;
        }
        safe[key] = typeof value === 'string' ? sanitizeText(value) : value;
    }
    return safe;
}

/**
 * @param {'debug'|'info'|'warn'|'error'} level
 * @param {string} message
 * @param {Record<string, any>} [context]
 */
function emit(level, message, context) {
    if (!shouldLog(level)) return;

    const record = {
        level,
        message: sanitizeText(String(message)),
        time: new Date().toISOString(),
        context: serializeContext(context)
    };

    if (loggerState.sinks.length > 0) {
        for (const sink of loggerState.sinks) {
            try {
                sink(record);
            } catch {
                // A broken sink must never break the request path.
            }
        }
        return;
    }

    const prefix = `[${record.time}] ${level.toUpperCase()}`;
    if (loggerState.format === 'json') {
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(record));
        return;
    }

    const contextKeys = Object.keys(record.context);
    const suffix = contextKeys.length > 0 ? ` ${JSON.stringify(record.context)}` : '';
    const line = `${prefix} ${record.message}${suffix}`;
    // eslint-disable-next-line no-console
    (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
}

/**
 * Creates a logger bound to a context object (e.g. a job id).
 * @param {Record<string, any>} baseContext
 */
export function childLogger(baseContext = {}) {
    return {
        debug: (/** @type {string} */ message, /** @type {Record<string,any>} */ context) => emit('debug', message, { ...baseContext, ...context }),
        info: (/** @type {string} */ message, /** @type {Record<string,any>} */ context) => emit('info', message, { ...baseContext, ...context }),
        warn: (/** @type {string} */ message, /** @type {Record<string,any>} */ context) => emit('warn', message, { ...baseContext, ...context }),
        error: (/** @type {string} */ message, /** @type {Record<string,any>} */ context) => emit('error', message, { ...baseContext, ...context }),
        child: (/** @type {Record<string,any>} */ extra) => childLogger({ ...baseContext, ...extra })
    };
}

export const logger = childLogger();

/** Test helper: resets sinks/level. */
export function resetLogger() {
    loggerState.sinks = [];
    loggerState.level = 'info';
    loggerState.format = 'pretty';
}
