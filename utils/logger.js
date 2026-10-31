/**
 * Structured Logging & Sanitization Utility
 *
 * Token safety model:
 *  1. Pattern-based redaction catches token-shaped strings (Discord's
 *     base64.segment.signature format) even when we never saw the token.
 *  2. Exact-value redaction covers tokens that do not match the common shape.
 *     Call registerSecret() as soon as a credential is accepted, and the raw
 *     value is scrubbed from every log line, error detail, and socket payload.
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
        // Evict the oldest entry to keep the registry bounded.
        registeredSecrets.delete(registeredSecrets.values().next().value);
    }
    registeredSecrets.add(secret);
}

/**
 * Forgets every registered credential (used on shutdown / between test runs).
 */
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
