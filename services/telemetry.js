/**
 * DISCLONER - Telemetry (opt-in, privacy-first)
 *
 * Design rules
 *  - Off by default. Nothing leaves the process unless BOTH the `telemetry`
 *    feature flag and `TELEMETRY_OPT_IN=true` are set AND an endpoint is
 *    configured.
 *  - Allowlisted event names only; property values are sanitised and truncated
 *    so a rogue caller cannot ship a token, message body or server name.
 *  - In-memory aggregation is always available for the local dashboard.
 *  - Network failures are swallowed: telemetry must never affect a job.
 */

import { getConfig } from './config.js';
import { isEnabled } from './featureFlags.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ scope: 'telemetry' });

/** Events the rest of the app is allowed to record. */
export const ALLOWED_EVENTS = Object.freeze([
    'server.boot',
    'server.shutdown',
    'job.created',
    'job.started',
    'job.resumed',
    'job.completed',
    'job.failed',
    'job.cancelled',
    'job.paused',
    'mirror.started',
    'mirror.stopped',
    'queue.rejected'
]);

const MAX_EVENT_COUNT = 500;
const MAX_PROPERTY_KEYS = 12;
const MAX_VALUE_LENGTH = 120;
const FLUSH_THROTTLE_MS = 60_000;
const FLUSH_TIMEOUT_MS = 5_000;

/** @type {Array<{ event: string, properties: Record<string, any>, timestamp: number }>} */
let buffer = [];
/** @type {Record<string, number>} */
let counters = Object.create(null);
let lastFlushAt = 0;
let totalSent = 0;
let totalDropped = 0;

/**
 * Strip anything that could carry a credential or user content.
 *
 * @param {unknown} value
 * @returns {string|number|boolean|null}
 */
function sanitizeValue(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
        // Tokens, snowflakes and free text are all capped: the caller should be
        // sending enums, not identifiers. Truncation keeps the payload small.
        return value.length > MAX_VALUE_LENGTH ? `${value.slice(0, MAX_VALUE_LENGTH)}…` : value;
    }
    if (Array.isArray(value)) return value.length;
    return null;
}

/**
 * @param {Record<string, any>} [properties]
 * @returns {Record<string, string|number|boolean|null>}
 */
export function sanitizeTelemetryProps(properties = {}) {
    /** @type {Record<string, string|number|boolean|null>} */
    const clean = {};
    const keys = Object.keys(properties || {}).slice(0, MAX_PROPERTY_KEYS);

    for (const key of keys) {
        if (!/^[a-zA-Z][a-zA-Z0-9_.-]{0,39}$/.test(key)) continue;
        clean[key] = sanitizeValue(properties[key]);
    }
    return clean;
}

/**
 * @param {string} event
 * @param {Record<string, any>} [properties]
 */
export function recordEvent(event, properties = {}) {
    const name = String(event || '');
    if (!ALLOWED_EVENTS.includes(name)) {
        totalDropped += 1;
        return false;
    }

    counters[name] = (counters[name] || 0) + 1;

    buffer.push({
        event: name,
        properties: sanitizeTelemetryProps(properties),
        timestamp: Date.now()
    });

    if (buffer.length > MAX_EVENT_COUNT) {
        buffer = buffer.slice(-MAX_EVENT_COUNT);
    }

    // Opportunistic flush: throttled and fire-and-forget.
    if (shouldFlushRemote()) {
        void flushTelemetry();
    }
    return true;
}

function shouldFlushRemote() {
    const config = getConfig();
    return Boolean(
        isEnabled('telemetry')
        && config.telemetryOptIn
        && config.telemetryEndpoint
        && Date.now() - lastFlushAt >= FLUSH_THROTTLE_MS
    );
}

/**
 * Local-only summary for the dashboard / `/api/telemetry/status`.
 */
export function getTelemetrySnapshot() {
    const config = getConfig();
    return {
        enabled: isEnabled('telemetry'),
        optIn: Boolean(config.telemetryOptIn),
        remote: Boolean(config.telemetryEndpoint),
        queued: buffer.length,
        sent: totalSent,
        dropped: totalDropped,
        counters: { ...counters },
        lastFlushAt: lastFlushAt || null
    };
}

/**
 * Send buffered events to the configured endpoint.
 *
 * Always safe to call: returns `{ ok: false, reason }` instead of throwing.
 *
 * @param {{ force?: boolean }} [options]
 */
export async function flushTelemetry(options = {}) {
    const config = getConfig();

    if (!isEnabled('telemetry')) {
        return { ok: false, reason: 'feature-disabled' };
    }
    if (!config.telemetryOptIn) {
        return { ok: false, reason: 'opt-in-required' };
    }
    if (!config.telemetryEndpoint) {
        return { ok: false, reason: 'no-endpoint' };
    }
    if (options.force !== true && Date.now() - lastFlushAt < FLUSH_THROTTLE_MS) {
        return { ok: false, reason: 'throttled' };
    }
    if (buffer.length === 0) {
        return { ok: false, reason: 'empty' };
    }

    const batch = buffer.slice();
    buffer = buffer.slice(batch.length);
    lastFlushAt = Date.now();

    try {
        const response = await fetch(config.telemetryEndpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                version: config.version || 'unknown',
                events: batch
            }),
            signal: AbortSignal.timeout(FLUSH_TIMEOUT_MS)
        });

        if (!response.ok) {
            // Put the events back so a transient outage does not lose them.
            buffer = batch.concat(buffer).slice(-MAX_EVENT_COUNT);
            log.debug('Telemetry endpoint rejected batch', { status: response.status });
            return { ok: false, reason: 'http-error', status: response.status };
        }

        totalSent += batch.length;
        return { ok: true, sent: batch.length };
    } catch (error) {
        buffer = batch.concat(buffer).slice(-MAX_EVENT_COUNT);
        log.debug('Telemetry flush failed', { error: /** @type {Error} */ (error)?.message });
        return { ok: false, reason: 'network-error' };
    }
}

/** Test/ops helper — clears the buffer and counters. */
export function resetTelemetry() {
    buffer = [];
    counters = Object.create(null);
    lastFlushAt = 0;
    totalSent = 0;
    totalDropped = 0;
}

export default {
    recordEvent,
    sanitizeTelemetryProps,
    getTelemetrySnapshot,
    flushTelemetry,
    resetTelemetry,
    ALLOWED_EVENTS
};
