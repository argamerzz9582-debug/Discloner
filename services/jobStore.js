/**
 * DISCLONER - Job Persistence
 *
 * Lightweight, dependency-free checkpoint store. Each job is written as its
 * own JSON document (atomic tmp+rename) so a crash mid-write cannot corrupt a
 * previously good checkpoint.
 *
 * SECURITY: credentials are never part of a persisted record. The allowlist
 * below is the only set of fields that reaches disk; the job manager strips
 * the token before calling `save()` and a resumed job requires the operator to
 * re-supply it.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { logger } from '../utils/logger.js';

const WRITE_DEBOUNCE_MS = 300;

/** Fields that may be persisted. Anything else is dropped. */
const PERSISTED_FIELDS = Object.freeze([
    'id',
    'mode',
    'status',
    'priority',
    'sourceId',
    'targetId',
    'sourceGuildName',
    'targetGuildName',
    'options',
    'stage',
    'progress',
    'statCounters',
    'createdAt',
    'startedAt',
    'updatedAt',
    'completedAt',
    'attempts',
    'error',
    'errorMeta',
    'completedStages',
    'maps',
    'cursors',
    'stats'
]);

/**
 * @param {any} job
 * @returns {Record<string, any>}
 */
export function toPersistedRecord(job) {
    /** @type {Record<string, any>} */
    const record = {};
    for (const field of PERSISTED_FIELDS) {
        if (job[field] !== undefined) record[field] = job[field];
    }
    return record;
}

export class JobStore {
    /**
     * @param {{ dir?: string, enabled?: boolean, retentionDays?: number, maxRecords?: number, logger?: any }} [options]
     */
    constructor(options = {}) {
        this.dir = options.dir || path.resolve(process.cwd(), '.discloner/state');
        this.enabled = options.enabled !== false;
        this.retentionDays = typeof options.retentionDays === 'number' ? options.retentionDays : 7;
        this.maxRecords = options.maxRecords || 100;
        this.log = options.logger || logger.child({ scope: 'jobStore' });

        /** @type {Map<string, NodeJS.Timeout>} */
        this._pending = new Map();
        /** @type {Map<string, Record<string, any>>} */
        this._queuedWrites = new Map();
        this._initialized = false;
    }

    async init() {
        if (!this.enabled) {
            this._initialized = true;
            return [];
        }

        try {
            await fs.mkdir(this.dir, { recursive: true });
        } catch (err) {
            this.log.warn('Unable to create state directory; persistence disabled.', {
                dir: this.dir,
                error: err instanceof Error ? err.message : String(err)
            });
            this.enabled = false;
            this._initialized = true;
            return [];
        }

        this._initialized = true;
        return this.loadAll();
    }

    /**
     * Reads every persisted job. Corrupt files are quarantined (renamed) so a
     * single bad document cannot block startup forever.
     */
    async loadAll() {
        if (!this.enabled) return [];

        /** @type {Record<string, any>[]} */
        const records = [];
        let entries = [];

        try {
            entries = await fs.readdir(this.dir);
        } catch (err) {
            this.log.warn('Unable to read state directory.', {
                dir: this.dir,
                error: err instanceof Error ? err.message : String(err)
            });
            return [];
        }

        for (const entry of entries) {
            if (!entry.endsWith('.json')) continue;
            const filePath = path.join(this.dir, entry);
            try {
                const raw = await fs.readFile(filePath, 'utf8');
                const parsed = JSON.parse(raw);
                if (!parsed || typeof parsed !== 'object' || !parsed.id) {
                    throw new Error('Missing job id');
                }
                records.push(parsed);
            } catch (err) {
                this.log.warn('Discarding unreadable job state file.', {
                    file: entry,
                    error: err instanceof Error ? err.message : String(err)
                });
                try {
                    await fs.rename(filePath, `${filePath}.corrupt`);
                } catch {
                    // Best effort only.
                }
            }
        }

        // Newest first so the retention pass keeps the most recent records.
        records.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        return records;
    }

    /**
     * Debounced persistence. Rapid progress updates collapse into one write.
     * @param {any} job
     */
    save(job) {
        if (!this.enabled || !job || !job.id) return;

        this._queuedWrites.set(job.id, toPersistedRecord(job));

        const existing = this._pending.get(job.id);
        if (existing) clearTimeout(existing);

        const timer = setTimeout(() => {
            this._pending.delete(job.id);
            const record = this._queuedWrites.get(job.id);
            this._queuedWrites.delete(job.id);
            if (record) {
                this._writeRecord(record).catch((err) => {
                    this.log.warn('Job state write failed.', {
                        jobId: record.id,
                        error: err instanceof Error ? err.message : String(err)
                    });
                });
            }
        }, WRITE_DEBOUNCE_MS);

        if (typeof timer.unref === 'function') timer.unref();
        this._pending.set(job.id, timer);
    }

    /**
     * @param {Record<string, any>} record
     */
    async _writeRecord(record) {
        if (!this.enabled) return;
        const filePath = path.join(this.dir, `${record.id}.json`);
        const tmpPath = `${filePath}.tmp`;
        const payload = JSON.stringify(record, null, 2);

        // The directory may have been removed after boot; recreate on demand so
        // a single missing folder cannot silently kill persistence.
        await fs.mkdir(this.dir, { recursive: true });
        await fs.writeFile(tmpPath, payload, 'utf8');
        await fs.rename(tmpPath, filePath);
    }

    /**
     * Flushes every debounced write. Used by graceful shutdown and tests.
     */
    async flush() {
        for (const [id, timer] of this._pending) {
            clearTimeout(timer);
            this._pending.delete(id);
            const record = this._queuedWrites.get(id);
            this._queuedWrites.delete(id);
            if (record) {
                await this._writeRecord(record).catch(() => {});
            }
        }
    }

    /**
     * @param {string} id
     */
    async remove(id) {
        if (!this.enabled) return;
        const pending = this._pending.get(id);
        if (pending) {
            clearTimeout(pending);
            this._pending.delete(id);
        }
        this._queuedWrites.delete(id);
        try {
            await fs.unlink(path.join(this.dir, `${id}.json`));
        } catch {
            // Already gone.
        }
    }

    /**
     * Drops records older than the retention window.
     * @param {Record<string, any>[]} records
     */
    async prune(records = []) {
        if (!this.enabled) return 0;

        const now = Date.now();
        const maxAgeMs = this.retentionDays * 24 * 60 * 60 * 1000;
        let removed = 0;

        const stale = records.filter((record, index) => {
            const age = now - (record.updatedAt || record.createdAt || 0);
            return (this.retentionDays > 0 && age > maxAgeMs) || index >= this.maxRecords;
        });

        for (const record of stale) {
            await this.remove(record.id);
            removed++;
        }
        return removed;
    }
}
