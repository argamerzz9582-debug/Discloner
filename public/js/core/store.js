/**
 * Minimal observable store.
 *
 * The dashboard state is small and updates are driven by socket events, so a
 * ~40 line store with shallow merging is easier to reason about than pulling in
 * a framework. Subscribers receive the full state plus the patch that caused
 * the update, which keeps render functions free of diffing logic.
 */

/**
 * @template {Record<string, any>} T
 * @param {T} initialState
 */
export function createStore(initialState) {
    /** @type {T} */
    let state = { ...initialState };
    /** @type {Set<(state: T, patch: Partial<T>) => void>} */
    const subscribers = new Set();
    let notifying = false;
    /** @type {Array<Partial<T>>} */
    let queued = [];

    /**
     * @param {Partial<T>} patch
     */
    function patch(next) {
        if (!next || Object.keys(next).length === 0) return;

        const previous = state;
        state = { ...state, ...next };

        // Ignore no-op patches (same references/values) to avoid render storms.
        const changed = Object.keys(next).some((key) => previous[key] !== state[key]);
        if (!changed) return;

        if (notifying) {
            queued.push(next);
            return;
        }

        notifying = true;
        try {
            for (const subscriber of subscribers) {
                subscriber(state, next);
            }
        } finally {
            notifying = false;
        }

        if (queued.length > 0) {
            const flush = queued;
            queued = [];
            for (const pending of flush) patch(pending);
        }
    }

    /**
     * @param {(state: T, patch: Partial<T>) => void} subscriber
     */
    function subscribe(subscriber) {
        subscribers.add(subscriber);
        subscriber(state, {});
        return () => subscribers.delete(subscriber);
    }

    return {
        get: () => state,
        patch,
        subscribe,
        /** @param {(state: T) => any} selector */
        select: (selector) => selector(state)
    };
}
