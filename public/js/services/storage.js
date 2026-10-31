/**
 * localStorage wrapper.
 *
 * Private-mode Safari and sandboxed iframes throw on access, so every call is
 * guarded. Nothing here is trusted: values are re-validated by their consumers.
 */

const memoryFallback = new Map();

/** @type {Storage | null} */
let cachedStore = null;

/**
 * Resolved lazily (and re-probed if it disappeared) so the module keeps working
 * when `window.localStorage` is swapped out — which is exactly what a test
 * harness or an iframe re-parent does.
 */
function getStore() {
    try {
        const storage = window.localStorage;
        if (!storage) return null;
        if (cachedStore !== storage) {
            storage.setItem('__discloner_probe__', '1');
            storage.removeItem('__discloner_probe__');
            cachedStore = storage;
        }
        return cachedStore;
    } catch {
        cachedStore = null;
        return null;
    }
}

/**
 * @param {string} key
 * @param {string} [fallback]
 */
export function read(key, fallback = null) {
    try {
        const store = getStore();
        if (!store) return memoryFallback.get(key) ?? fallback;
        const value = store.getItem(key);
        return value === null ? fallback : value;
    } catch {
        return fallback;
    }
}

/**
 * @param {string} key
 * @param {string} value
 */
export function write(key, value) {
    try {
        const store = getStore();
        if (!store) {
            memoryFallback.set(key, value);
            return true;
        }
        store.setItem(key, value);
        return true;
    } catch {
        memoryFallback.set(key, value);
        return false;
    }
}

/**
 * @param {string} key
 */
export function remove(key) {
    try {
        const store = getStore();
        if (!store) {
            memoryFallback.delete(key);
            return;
        }
        store.removeItem(key);
    } catch {
        memoryFallback.delete(key);
    }
}

/**
 * @param {string} key
 * @param {any} [fallback]
 */
export function readJSON(key, fallback = null) {
    const raw = read(key);
    if (!raw) return fallback;
    try {
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
}

/**
 * @param {string} key
 * @param {any} value
 */
export function writeJSON(key, value) {
    return write(key, JSON.stringify(value));
}

export const KEYS = Object.freeze({
    theme: 'discloner-theme',
    token: 'discloner_saved_user_token',
    tokenOptIn: 'discloner_token_remember_opt_in',
    config: 'discloner_user_config',
    activeJob: 'discloner_active_job_id',
    activeJobToken: 'discloner_active_job_token',
    activeResumeKey: 'discloner_active_resume_key',
    lastCompletedJob: 'discloner_last_completed_job',
    tourDone: 'discloner_tour_done',
    jobMode: 'discloner_job_mode'
});
