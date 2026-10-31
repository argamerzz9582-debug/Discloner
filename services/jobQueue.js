/**
 * DISCLONER - Priority Job Queue
 *
 * A bounded, in-process queue with:
 *  - three priority bands (high / normal / low), FIFO inside a band
 *  - a configurable concurrency limit
 *  - queue position + estimated wait time per entry
 *  - explicit removal (single job or the whole queue)
 *
 * The queue owns no Discord state; it only decides *when* the job manager may
 * start the next executor. That keeps it fully unit-testable.
 */

export const PRIORITIES = Object.freeze({
    high: { weight: 0, label: 'High' },
    normal: { weight: 1, label: 'Normal' },
    low: { weight: 2, label: 'Low' }
});

/**
 * @param {string} priority
 */
export function normalizePriority(priority) {
    return Object.prototype.hasOwnProperty.call(PRIORITIES, priority) ? priority : 'normal';
}

export class JobQueue {
    /**
     * @param {{ concurrency?: number, maxQueued?: number, defaultDurationMs?: number }} [options]
     */
    constructor(options = {}) {
        this.concurrency = Math.max(1, options.concurrency || 1);
        this.maxQueued = Math.max(1, options.maxQueued || 20);
        this.defaultDurationMs = options.defaultDurationMs || 90_000;

        /** @type {Array<{ id: string, priority: string, enqueuedAt: number, seq: number }>} */
        this._entries = [];
        this._seq = 0;
        /** @type {Map<string, number>} completed job durations for ETA estimation */
        this._durations = [];
    }

    get size() {
        return this._entries.length;
    }

    get isFull() {
        return this._entries.length >= this.maxQueued;
    }

    /**
     * @param {string} id
     * @param {{ priority?: string }} [options]
     */
    enqueue(id, options = {}) {
        if (this.isFull) {
            const error = new Error(`Queue is full (${this.maxQueued} waiting jobs). Wait for a job to finish.`);
            // @ts-ignore - structured code for API mapping
            error.code = 'JOB_QUEUE_FULL';
            throw error;
        }
        if (this._entries.some(entry => entry.id === id)) {
            return this.list();
        }

        this._entries.push({
            id,
            priority: normalizePriority(options.priority || 'normal'),
            enqueuedAt: Date.now(),
            seq: this._seq++
        });

        return this.list();
    }

    /**
     * @param {string} id
     */
    has(id) {
        return this._entries.some(entry => entry.id === id);
    }

    /**
     * Removes and returns the next runnable job id according to priority and
     * arrival order.
     * @returns {string | null}
     */
    dequeue() {
        if (this._entries.length === 0) return null;

        this._entries.sort((a, b) => {
            const weightDiff = PRIORITIES[a.priority].weight - PRIORITIES[b.priority].weight;
            if (weightDiff !== 0) return weightDiff;
            return a.seq - b.seq;
        });

        const next = this._entries.shift();
        return next ? next.id : null;
    }

    /**
     * @param {string} id
     */
    remove(id) {
        const index = this._entries.findIndex(entry => entry.id === id);
        if (index === -1) return false;
        this._entries.splice(index, 1);
        return true;
    }

    clear() {
        const removed = this._entries.map(entry => entry.id);
        this._entries = [];
        return removed;
    }

    /**
     * 1-based position, or 0 when the job is not waiting.
     * @param {string} id
     */
    positionOf(id) {
        const ordered = [...this._entries].sort((a, b) => {
            const weightDiff = PRIORITIES[a.priority].weight - PRIORITIES[b.priority].weight;
            if (weightDiff !== 0) return weightDiff;
            return a.seq - b.seq;
        });
        const index = ordered.findIndex(entry => entry.id === id);
        return index === -1 ? 0 : index + 1;
    }

    /**
     * Average observed duration of finished jobs, falling back to a constant.
     */
    averageDurationMs() {
        if (this._durations.length === 0) return this.defaultDurationMs;
        const total = this._durations.reduce((sum, value) => sum + value, 0);
        return Math.round(total / this._durations.length);
    }

    /**
     * Records a completed job's runtime for future ETA estimates.
     * @param {number} durationMs
     */
    recordDuration(durationMs) {
        if (!Number.isFinite(durationMs) || durationMs <= 0) return;
        this._durations.push(durationMs);
        if (this._durations.length > 20) this._durations.shift();
    }

    /**
     * @param {string} id
     */
    estimatedWaitMs(id) {
        const position = this.positionOf(id);
        if (position === 0) return 0;

        const average = this.averageDurationMs();
        const waves = Math.ceil(position / this.concurrency);
        return Math.round(waves * average);
    }

    /**
     * @param {(id: string) => any} resolve
     */
    list(resolve = () => null) {
        const ordered = [...this._entries].sort((a, b) => {
            const weightDiff = PRIORITIES[a.priority].weight - PRIORITIES[b.priority].weight;
            if (weightDiff !== 0) return weightDiff;
            return a.seq - b.seq;
        });

        return ordered.map((entry, index) => ({
            id: entry.id,
            priority: entry.priority,
            position: index + 1,
            enqueuedAt: entry.enqueuedAt,
            estimatedWaitMs: this.estimatedWaitMs(entry.id),
            job: resolve(entry.id)
        }));
    }

    /**
     * @param {number} concurrency
     */
    setConcurrency(concurrency) {
        this.concurrency = Math.max(1, Math.min(10, concurrency));
        return this.concurrency;
    }
}
