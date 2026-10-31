/**
 * DISCLONER - HTTP & WebSocket Abuse Guards
 *
 * Every migration start and every preflight check authenticates a real Discord
 * account. Repeated or accidental retries therefore cost gateway sessions in a
 * way that can get a token temporarily (or permanently) locked out. These
 * bounded, in-memory limiters keep that blast radius small without touching the
 * authentication flow itself.
 *
 * Design notes:
 *  - Sliding-window counters (not fixed buckets) so bursts cannot straddle a
 *    window boundary.
 *  - Fully in-process: no external store, no persistence, no token material.
 *  - Key count is capped so a spoofed-IP flood cannot grow memory unbounded.
 */

import { HTTP_GUARD } from './configContract.js';

export class SlidingWindowLimiter {
    constructor({ limit = 5, windowMs = 60000, maxKeys = HTTP_GUARD.maxTrackedKeys } = {}) {
        this.limit = limit;
        this.windowMs = windowMs;
        this.maxKeys = maxKeys;
        this.hits = new Map(); // key -> number[] (ascending timestamps)
    }

    _prune(key, now) {
        const timestamps = this.hits.get(key);
        if (!timestamps) return [];

        const cutoff = now - this.windowMs;
        let firstValid = 0;
        while (firstValid < timestamps.length && timestamps[firstValid] <= cutoff) {
            firstValid++;
        }
        if (firstValid > 0) timestamps.splice(0, firstValid);

        if (timestamps.length === 0) {
            this.hits.delete(key);
            return [];
        }
        return timestamps;
    }

    _evictOverflow() {
        while (this.hits.size > this.maxKeys) {
            const oldestKey = this.hits.keys().next().value;
            this.hits.delete(oldestKey);
        }
    }

    /**
     * Records an attempt and reports whether it is allowed.
     * @returns {{allowed: boolean, remaining: number, retryAfterMs: number}}
     */
    hit(key = 'global') {
        const now = Date.now();
        const timestamps = this._prune(String(key), now);

        if (timestamps.length >= this.limit) {
            const oldestInWindow = timestamps[0];
            return {
                allowed: false,
                remaining: 0,
                retryAfterMs: Math.max(0, (oldestInWindow + this.windowMs) - now)
            };
        }

        timestamps.push(now);
        this.hits.set(String(key), timestamps);
        this._evictOverflow();

        return {
            allowed: true,
            remaining: Math.max(0, this.limit - timestamps.length),
            retryAfterMs: 0
        };
    }

    /** Peeks without consuming an attempt. */
    peek(key = 'global') {
        const now = Date.now();
        const timestamps = this._prune(String(key), now);
        return {
            count: timestamps.length,
            remaining: Math.max(0, this.limit - timestamps.length)
        };
    }

    reset(key) {
        if (key === undefined) {
            this.hits.clear();
            return;
        }
        this.hits.delete(String(key));
    }

    get keyCount() {
        return this.hits.size;
    }
}

/** Guards POST /api/jobs/start. */
export const startLimiter = new SlidingWindowLimiter({
    limit: HTTP_GUARD.startLimit,
    windowMs: HTTP_GUARD.startWindowMs
});

/** Guards the clone:preflight socket event (keyed by client IP). */
export const preflightLimiter = new SlidingWindowLimiter({
    limit: HTTP_GUARD.preflightLimit,
    windowMs: HTTP_GUARD.preflightWindowMs
});

/**
 * Derives a stable key for the caller. Honours X-Forwarded-For only when
 * Express has been configured to trust a proxy, which keeps the value honest.
 */
export function getClientKey(req) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    return ip;
}

/**
 * Express middleware factory for a SlidingWindowLimiter.
 */
export function createRateLimitMiddleware(limiter, { message, code = 'RATE_LIMITED' } = {}) {
    return (req, res, next) => {
        const result = limiter.hit(getClientKey(req));
        res.setHeader('X-RateLimit-Limit', String(limiter.limit));
        res.setHeader('X-RateLimit-Remaining', String(result.remaining));

        if (!result.allowed) {
            const retryAfterSeconds = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
            res.setHeader('Retry-After', String(retryAfterSeconds));
            return res.status(429).json({
                success: false,
                code,
                error: message || `Too many requests. Please retry in ${retryAfterSeconds}s.`,
                retryAfterMs: result.retryAfterMs
            });
        }
        return next();
    };
}

/**
 * Minimal per-socket cooldown used to debounce repeated preflight clicks.
 * Distinct from the IP limiter because one browser tab retrying should not
 * consume another user's budget, and vice versa.
 */
export class SocketCooldown {
    constructor({ cooldownMs = HTTP_GUARD.preflightSocketCooldownMs, maxKeys = HTTP_GUARD.maxTrackedKeys } = {}) {
        this.cooldownMs = cooldownMs;
        this.maxKeys = maxKeys;
        this.lastSeen = new Map();
    }

    /**
     * @returns {{allowed: boolean, retryAfterMs: number}}
     */
    check(key) {
        const id = String(key || 'unknown');
        const now = Date.now();
        const previous = this.lastSeen.get(id);

        if (previous !== undefined && (now - previous) < this.cooldownMs) {
            return { allowed: false, retryAfterMs: this.cooldownMs - (now - previous) };
        }

        this.lastSeen.set(id, now);
        while (this.lastSeen.size > this.maxKeys) {
            this.lastSeen.delete(this.lastSeen.keys().next().value);
        }
        return { allowed: true, retryAfterMs: 0 };
    }

    clear(key) {
        if (key === undefined) {
            this.lastSeen.clear();
            return;
        }
        this.lastSeen.delete(String(key));
    }
}

/** Debounces preflight per socket connection. */
export const preflightCooldown = new SocketCooldown();

/** Debounces clone:start per socket connection. */
export const startCooldown = new SocketCooldown({ cooldownMs: 3000 });

/** Clears every guard (used by tests and on shutdown). */
export function resetGuards() {
    startLimiter.reset();
    preflightLimiter.reset();
    preflightCooldown.clear();
    startCooldown.clear();
}
