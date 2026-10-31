/**
 * DISCLONER - Feature Flags
 *
 * Flags are resolved once at boot from validated configuration, then exposed
 * read-only to the client so the UI can hide unfinished surfaces instead of
 * rendering disabled buttons. Nothing here is security-sensitive: the server
 * still enforces every capability on its own.
 */

import { getConfig } from './config.js';

const FLAG_DEFINITIONS = Object.freeze({
    continuousMirror: {
        description: 'Continuous Mirror mode (long-lived session forwarding source changes).',
        default: true
    },
    multiJobQueue: {
        description: 'Priority queue with concurrent job execution.',
        default: true
    },
    resumableJobs: {
        description: 'Checkpoint + resume support for interrupted migrations.',
        default: true
    },
    telemetry: {
        description: 'Opt-in anonymous usage counters.',
        default: false
    }
});

/** @type {Map<string, boolean>} */
const overrides = new Map();

/**
 * @param {Record<string, boolean>} [configFeatures]
 */
export function resolveFlags(configFeatures = {}) {
    /** @type {Record<string, boolean>} */
    const resolved = {};
    for (const [name, definition] of Object.entries(FLAG_DEFINITIONS)) {
        const configured = configFeatures[name];
        resolved[name] = overrides.has(name)
            ? Boolean(overrides.get(name))
            : (typeof configured === 'boolean' ? configured : definition.default);
    }
    return resolved;
}

export function getFlags() {
    const config = getConfig();
    return resolveFlags(config.features);
}

/** @param {string} name */
export function isEnabled(name) {
    return Boolean(getFlags()[name]);
}

/**
 * Runtime override (used by tests and by a future admin panel). Not exposed
 * over HTTP: an unauthenticated dashboard must not be able to flip behaviour.
 * @param {string} name
 * @param {boolean} value
 */
export function setFlag(name, value) {
    if (!Object.prototype.hasOwnProperty.call(FLAG_DEFINITIONS, name)) {
        throw new Error(`Unknown feature flag "${name}".`);
    }
    overrides.set(name, Boolean(value));
    return getFlags();
}

export function resetFlags() {
    overrides.clear();
}

export function describeFlags() {
    const flags = getFlags();
    return Object.entries(FLAG_DEFINITIONS).map(([name, definition]) => ({
        name,
        enabled: Boolean(flags[name]),
        description: definition.description
    }));
}

export { FLAG_DEFINITIONS };
