/**
 * DISCLONER - Job Manager (v3)
 *
 * Responsibilities
 *  - Lifecycle for two modes: one-shot clone and continuous mirror.
 *  - Priority queue with a configurable concurrency ceiling.
 *  - Checkpointing to disk (never includes credentials) and resume after a
 *    restart, guarded by a capability key.
 *  - Pause / resume / cancel with ownership checks.
 *  - Recoverable vs fatal error reporting for the UI.
 *
 * Backwards compatibility: the v2 surface (`startJob`, `cancelJob`,
 * `getJobSnapshot`, `getActiveOrLatestJob`, `getActiveJobCount`,
 * `hasActiveJobForSocket`, `canControlJob`, `cancelAllRunning`, `waitForIdle`,
 * `shutdown`, `setSocketServer`) is preserved.
 */

import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { executeClone } from './cloneService.js';
import { createMirrorSession, createDiscordAdapter } from './mirrorService.js';
import { createDiscordClient, authenticateClient, destroyClient } from './discordService.js';
import { JobQueue, normalizePriority, PRIORITIES } from './jobQueue.js';
import { JobStore } from './jobStore.js';
import { getConfig } from './config.js';
import {
    classifyError,
    serializeErrorSafely,
    getFriendlyErrorMessage,
    ERROR_CATEGORIES
} from './reliability/index.js';
import { createLogEntry, sanitizeText, logger } from '../utils/logger.js';
import { recordEvent } from './telemetry.js';

export const JOB_MODES = Object.freeze({ clone: 'clone', mirror: 'mirror' });

export const JOB_STATUS = Object.freeze({
    queued: 'queued',
    running: 'running',
    paused: 'paused',
    completed: 'completed',
    failed: 'failed',
    cancelled: 'cancelled',
    interrupted: 'interrupted'
});

/** Stages that must never be replayed on resume. */
const NON_REPLAYABLE_STAGES = new Set(['cleaning_target']);

const FATAL_CODES = new Set([
    ERROR_CATEGORIES.AUTHENTICATION_ERROR,
    ERROR_CATEGORIES.VALIDATION_ERROR,
    ERROR_CATEGORIES.CANCELLED
]);

const log = logger.child({ scope: 'jobManager' });

/**
 * @param {string} value
 */
function sha256(value) {
    return createHash('sha256').update(String(value)).digest('hex');
}

/**
 * @param {string} expectedHash
 * @param {string} provided
 */
function matchesHash(expectedHash, provided) {
    if (typeof expectedHash !== 'string' || typeof provided !== 'string' || provided.length === 0) return false;
    const expected = Buffer.from(expectedHash, 'utf8');
    const actual = Buffer.from(sha256(provided), 'utf8');
    if (expected.length !== actual.length) return false;
    try {
        return timingSafeEqual(expected, actual);
    } catch {
        return false;
    }
}

export class JobManager {
    constructor(options = {}) {
        const config = options.config || getConfig();

        /** @type {Map<string, any>} */
        this.jobs = new Map();
        /** @type {Map<string, string>} */
        this.socketJobMap = new Map();
        this.io = null;

        this.MAX_RETAINED_JOBS = 50;
        this.MAX_LOGS_PER_JOB = 1000;

        this.queue = new JobQueue({
            concurrency: config.maxConcurrentJobs,
            maxQueued: config.maxQueuedJobs
        });
        this.store = new JobStore({
            dir: config.stateDir,
            enabled: config.persistJobs,
            retentionDays: config.stateRetentionDays,
            logger: log
        });

        this.config = config;
        this.staleTimeoutMs = 20 * 60 * 1000;
        this._booted = false;
        this._shuttingDown = false;

        if (options.startTimers !== false) {
            this._staleSweeper = setInterval(() => this._checkStaleJobs(), 60_000);
            if (typeof this._staleSweeper.unref === 'function') this._staleSweeper.unref();
        }
    }

    /**
     * Loads persisted jobs, marks them interrupted, and prunes old records.
     */
    async bootstrap() {
        if (this._booted) return this;
        this._booted = true;

        const records = await this.store.init();
        if (records.length === 0) return this;

        for (const record of records) {
            // Anything persisted was running when the process died.
            if (!['completed', 'failed', 'cancelled'].includes(record.status)) {
                record.status = JOB_STATUS.interrupted;
                record.error = record.error || 'Server restarted while this job was running.';
                record.errorMeta = {
                    code: 'INTERRUPTED',
                    recoverable: true,
                    category: 'INTERRUPTED'
                };
            }

            const job = this._hydrateJob(record);
            this.jobs.set(job.id, job);
        }

        const pruned = await this.store.prune(records);
        log.info('Restored job state from disk.', {
            restored: this.jobs.size,
            pruned,
            stateDir: this.store.dir
        });
        return this;
    }

    /**
     * @param {Record<string, any>} record
     */
    _hydrateJob(record) {
        return {
            id: record.id,
            mode: record.mode || JOB_MODES.clone,
            socketId: null,
            jobToken: null,
            resumeKeyHash: record.resumeKeyHash || null,
            status: record.status || JOB_STATUS.interrupted,
            priority: normalizePriority(record.priority),
            sourceId: record.sourceId,
            targetId: record.targetId,
            sourceGuildName: record.sourceGuildName || null,
            targetGuildName: record.targetGuildName || null,
            options: record.options || {},
            createdAt: record.createdAt || Date.now(),
            startedAt: record.startedAt || null,
            lastActivityAt: record.updatedAt || Date.now(),
            completedAt: record.completedAt || null,
            isCancelled: false,
            isPaused: false,
            attempts: record.attempts || 1,
            stage: record.stage || { stage: 'queued', label: 'Restored from checkpoint', progress: 0 },
            progress: record.progress || { progress: 0, current: 0, total: 0, item: 'Awaiting resume' },
            logs: [],
            statCounters: record.statCounters || this._emptyCounters(record.mode),
            stats: record.stats || null,
            error: record.error || null,
            errorMeta: record.errorMeta || null,
            completedStages: Array.isArray(record.completedStages) ? record.completedStages : [],
            maps: record.maps || { roles: {}, categories: {}, channels: {} },
            cursors: record.cursors || { lastMessageIds: {} },
            mirror: null,
            resumable: Boolean(record.resumeKeyHash) && record.status === JOB_STATUS.interrupted,
            _promise: Promise.resolve(),
            _client: null
        };
    }

    /**
     * @param {string} [mode]
     */
    _emptyCounters(mode = JOB_MODES.clone) {
        return {
            roles: 0,
            channels: 0,
            categories: 0,
            messages: 0,
            warnings: 0,
            attachments: 0,
            retries: 0,
            rateLimits: 0,
            skipped: 0,
            ...(mode === JOB_MODES.mirror
                ? { messagesForwarded: 0, structureEvents: 0, channelsSynced: 0, rolesSynced: 0 }
                : {})
        };
    }

    setSocketServer(io) {
        this.io = io;
    }

    /* ------------------------------------------------------------------ guards */

    /**
     * @param {string} socketId
     */
    hasActiveJobForSocket(socketId) {
        if (!socketId) return false;
        const jobId = this.socketJobMap.get(socketId);
        if (!jobId) return false;
        const job = this.jobs.get(jobId);
        return Boolean(job && [JOB_STATUS.running, JOB_STATUS.paused, JOB_STATUS.queued].includes(job.status));
    }

    getActiveJobCount() {
        let count = 0;
        for (const job of this.jobs.values()) {
            if (job.status === JOB_STATUS.running) count++;
        }
        return count;
    }

    getQueuedJobCount() {
        return this.queue.size;
    }

    /**
     * Ownership check used by the REST and socket layers.
     * @param {string} jobId
     * @param {{ socketId?: string|null, jobToken?: string|null, resumeKey?: string|null }} [auth]
     */
    canControlJob(jobId, auth = {}) {
        const job = this.jobs.get(jobId);
        if (!job) return false;

        if (job.socketId && auth.socketId && job.socketId === auth.socketId) return true;
        if (auth.jobToken && job.jobToken && this._tokensMatch(job.jobToken, auth.jobToken)) return true;
        if (auth.resumeKey && job.resumeKeyHash && matchesHash(job.resumeKeyHash, auth.resumeKey)) return true;
        return false;
    }

    /**
     * Read-only visibility: a job nobody is currently driving can be watched by
     * anyone who knows its (random) id. Controlling it still needs the
     * capability, so this only ever exposes progress and guild ids.
     *
     * @param {string} jobId
     */
    isViewable(jobId) {
        const job = this.jobs.get(jobId);
        if (!job) return false;
        if (!job.socketId) return true;
        if ([JOB_STATUS.completed, JOB_STATUS.failed, JOB_STATUS.cancelled, JOB_STATUS.interrupted].includes(job.status)) {
            return true;
        }
        // The owning socket may have gone away (tab closed, network drop).
        const sockets = this.io?.sockets?.sockets;
        return Boolean(sockets) && !sockets.get(job.socketId);
    }

    /**
     * @param {string} expected
     * @param {string} provided
     */
    _tokensMatch(expected, provided) {
        if (typeof expected !== 'string' || typeof provided !== 'string') return false;
        const a = Buffer.from(expected);
        const b = Buffer.from(provided);
        if (a.length !== b.length) return false;
        try {
            return timingSafeEqual(a, b);
        } catch {
            return false;
        }
    }

    /* ------------------------------------------------------------------- create */

    /**
     * Creates a job and either starts it immediately or queues it.
     *
     * @param {{
     *   mode?: 'clone'|'mirror',
     *   userToken: string,
     *   sourceId: string,
     *   targetId: string,
     *   options?: Record<string, any>,
     *   socketId?: string|null,
     *   priority?: string,
     *   executor?: Function,
     *   resumeFrom?: any
     * }} input
     */
    startJob(input) {
        const {
            mode = JOB_MODES.clone,
            userToken,
            sourceId,
            targetId,
            options = {},
            socketId = null,
            priority = 'normal',
            executor,
            resumeFrom = null
        } = input;

        if (socketId && this.hasActiveJobForSocket(socketId)) {
            const existingJobId = this.socketJobMap.get(socketId);
            const error = new Error(`A migration job (${existingJobId}) is already running on this connection.`);
            // @ts-ignore - structured code for API mapping
            error.code = 'JOB_ALREADY_RUNNING';
            throw error;
        }

        if (mode === JOB_MODES.mirror) {
            const activeMirrors = [...this.jobs.values()]
                .filter(job => job.mode === JOB_MODES.mirror && [JOB_STATUS.running, JOB_STATUS.paused].includes(job.status));
            if (activeMirrors.length >= this.config.maxMirrorSessions) {
                const error = new Error(`Maximum of ${this.config.maxMirrorSessions} concurrent mirror session(s) reached.`);
                // @ts-ignore
                error.code = 'MIRROR_LIMIT_REACHED';
                throw error;
            }
        }

        const jobId = `job_${Date.now()}_${randomBytes(3).toString('hex')}`;
        const jobToken = randomBytes(24).toString('hex');
        const resumeKey = randomBytes(24).toString('hex');

        /** @type {any} */
        const job = {
            id: jobId,
            mode,
            socketId,
            jobToken,
            resumeKeyHash: sha256(resumeKey),
            status: JOB_STATUS.queued,
            priority: normalizePriority(priority),
            sourceId,
            targetId,
            sourceGuildName: null,
            targetGuildName: null,
            options,
            createdAt: Date.now(),
            startedAt: null,
            lastActivityAt: Date.now(),
            completedAt: null,
            isCancelled: false,
            isPaused: false,
            attempts: 1,
            stage: { stage: 'queued', label: 'Waiting in queue', progress: 0 },
            progress: { progress: 0, current: 0, total: 0, item: 'Queued' },
            logs: [],
            statCounters: this._emptyCounters(mode),
            stats: null,
            error: null,
            errorMeta: null,
            completedStages: Array.isArray(resumeFrom?.completedStages) ? [...resumeFrom.completedStages] : [],
            maps: resumeFrom?.maps || { roles: {}, categories: {}, channels: {} },
            cursors: resumeFrom?.cursors || { lastMessageIds: {} },
            mirror: null,
            resumable: false,
            _promise: Promise.resolve(),
            _client: null,
            _executor: executor || (mode === JOB_MODES.mirror ? this._executeMirror.bind(this) : executeClone),
            _userToken: userToken,
            _resume: resumeFrom
        };

        job.logs.push(createLogEntry(
            'info',
            `${mode === JOB_MODES.mirror ? 'Continuous mirror' : 'Clone'} job queued [${sourceId} → ${targetId}]`,
            'JOB_CREATED',
            'queued'
        ));

        this.jobs.set(jobId, job);
        if (socketId) this.socketJobMap.set(socketId, jobId);

        this.queue.enqueue(jobId, { priority: job.priority });
        this._pruneOldJobs();
        this._pump();

        // Capability handed to the caller; never part of a snapshot.
        job._resumeKey = resumeKey;

        this._persist(job);
        this._broadcastQueue();
        recordEvent('job.created', { mode, priority: job.priority });

        return job;
    }

    /**
     * Resumes an interrupted job from its checkpoint.
     * @param {string} jobId
     * @param {{ userToken: string, resumeKey: string, socketId?: string|null }} input
     */
    resumeJob(jobId, input) {
        const job = this.jobs.get(jobId);
        if (!job) {
            const error = new Error('Job not found.');
            // @ts-ignore
            error.code = 'JOB_NOT_FOUND';
            throw error;
        }
        if (!matchesHash(job.resumeKeyHash, input.resumeKey)) {
            const error = new Error('A valid resume key is required to restart this job.');
            // @ts-ignore
            error.code = 'JOB_FORBIDDEN';
            throw error;
        }
        if (![JOB_STATUS.interrupted, JOB_STATUS.failed].includes(job.status)) {
            const error = new Error(`Job cannot be resumed from status "${job.status}".`);
            // @ts-ignore
            error.code = 'JOB_NOT_RESUMABLE';
            throw error;
        }

        job.status = JOB_STATUS.queued;
        job.error = null;
        job.errorMeta = null;
        job.isCancelled = false;
        job.isPaused = false;
        job.attempts += 1;
        job._userToken = input.userToken;
        job._resume = {
            completedStages: job.completedStages,
            maps: job.maps,
            cursors: job.cursors
        };
        job._executor = job.mode === JOB_MODES.mirror
            ? this._executeMirror.bind(this)
            : executeClone;

        if (input.socketId) {
            job.socketId = input.socketId;
            this.socketJobMap.set(input.socketId, job.id);
        }

        job.logs.push(createLogEntry('info', `Resuming job from checkpoint (attempt ${job.attempts}).`, 'JOB_RESUME', 'queued'));
        this.queue.enqueue(job.id, { priority: job.priority });
        this._pump();
        this._persist(job);
        this._broadcastQueue();
        recordEvent('job.resumed', { mode: job.mode });

        return job;
    }

    /* --------------------------------------------------------------- execution */

    _pump() {
        if (this._shuttingDown) return;

        while (this.getActiveJobCount() < this.queue.concurrency && this.queue.size > 0) {
            const nextId = this.queue.dequeue();
            if (!nextId) break;

            const job = this.jobs.get(nextId);
            if (!job) continue;
            if (job.status !== JOB_STATUS.queued) continue;

            job.status = JOB_STATUS.running;
            job.startedAt = job.startedAt || Date.now();
            job.lastActivityAt = Date.now();
            job.stage = { stage: 'starting', label: 'Starting', progress: 1 };

            this._emit(job, 'job:started', { jobId: job.id, mode: job.mode, startedAt: job.startedAt });
            this._emit(job, 'clone:started', {
                jobId: job.id,
                jobToken: job.jobToken,
                resumeKey: job._resumeKey || null,
                mode: job.mode,
                sourceId: job.sourceId,
                targetId: job.targetId,
                startedAt: job.startedAt
            });

            job._promise = this._runJobExecution(job).finally(() => {
                this._pump();
            });
        }

        this._broadcastQueue();
    }

    /**
     * @param {any} job
     */
    async _runJobExecution(job) {
        const jobId = job.id;
        const startedAt = Date.now();

        const onStage = (/** @type {string} */ stage, /** @type {string} */ label, /** @type {number} */ progress) => {
            job.lastActivityAt = Date.now();
            job.stage = { stage, label, progress };
            this._emit(job, 'clone:stage', { stage, label, progress, jobId });
            this._persist(job);
        };

        const onProgress = (/** @type {number} */ progress, /** @type {number} */ current, /** @type {number} */ total, /** @type {string} */ item) => {
            job.lastActivityAt = Date.now();
            job.progress = { progress, current, total, item: sanitizeText(item) };
            this._emit(job, 'clone:progress', {
                progress,
                current,
                total,
                item: job.progress.item,
                jobId
            });
            this._emit(job, 'progress', progress);
        };

        const onLog = (/** @type {any} */ logEntry) => {
            job.lastActivityAt = Date.now();
            if (job.logs.length >= this.MAX_LOGS_PER_JOB) job.logs.shift();
            job.logs.push(logEntry);

            if (logEntry.type === 'warning') job.statCounters.warnings++;
            if (logEntry.type === 'success' && logEntry.message) {
                const lower = logEntry.message.toLowerCase();
                if (lower.includes('role')) job.statCounters.roles++;
                if (lower.includes('channel') || lower.includes('category')) job.statCounters.channels++;
                if (lower.includes('message')) job.statCounters.messages++;
            }
            if (logEntry.message && /skip/i.test(logEntry.message)) job.statCounters.skipped++;

            this._emit(job, 'clone:log', { ...logEntry, jobId });
            const prefix = logEntry.type === 'error' ? '[ERROR]'
                : logEntry.type === 'warning' ? '[WARN]'
                    : logEntry.type === 'success' ? '[SUCCESS]' : '[SYS]';
            this._emit(job, 'log', `${prefix} ${logEntry.message}${logEntry.detail ? ` (${logEntry.detail})` : ''}`);
        };

        const onCheckpoint = (/** @type {any} */ state) => {
            if (!state) return;

            if (state.stage && state.completed) {
                if (!job.completedStages.includes(state.stage)) {
                    job.completedStages.push(state.stage);
                }
            }
            if (state.maps) {
                job.maps = {
                    roles: { ...job.maps.roles, ...(state.maps.roles || {}) },
                    categories: { ...job.maps.categories, ...(state.maps.categories || {}) },
                    channels: { ...job.maps.channels, ...(state.maps.channels || {}) }
                };
            }
            if (state.cursors) {
                job.cursors = {
                    lastMessageIds: { ...job.cursors.lastMessageIds, ...(state.cursors.lastMessageIds || {}) }
                };
            }
            job.resumable = true;
            this._persist(job);
            this._emit(job, 'job:checkpoint', {
                jobId: job.id,
                completedStages: job.completedStages,
                stage: state.stage || job.stage.stage
            });
        };

        try {
            const stats = await job._executor({
                userToken: job._userToken,
                sourceId: job.sourceId,
                targetId: job.targetId,
                options: job.options,
                resume: job._resume,
                onStage,
                onProgress,
                onLog,
                onCheckpoint,
                isCancelled: () => job.isCancelled,
                isPaused: () => job.isPaused,
                jobId: job.id,
                onClient: (/** @type {any} */ client) => { job._client = client; },
                onStat: (/** @type {string} */ stat, /** @type {number} */ amount = 1) => {
                    const key = /** @type {keyof typeof job.statCounters} */ (stat);
                    if (key in job.statCounters) job.statCounters[key] += amount;
                },
                onMirrorStats: (/** @type {any} */ snapshot) => {
                    if (!snapshot) return;
                    if (Number.isFinite(snapshot.stats?.messagesForwarded)) {
                        job.statCounters.messages = snapshot.stats.messagesForwarded;
                    }
                    if (Number.isFinite(snapshot.stats?.eventsDropped)) {
                        job.statCounters.warnings = snapshot.stats.eventsDropped;
                    }
                }
            });

            const completedAt = Date.now();
            job.status = JOB_STATUS.completed;
            job.completedAt = completedAt;
            job.stats = stats;
            job.sourceGuildName = stats?.sourceServerName || job.sourceGuildName;
            job.targetGuildName = stats?.targetServerName || job.targetGuildName;
            job.stage = { stage: 'completed', label: 'Completed', progress: 100 };
            job.progress = { progress: 100, current: 1, total: 1, item: 'Completed' };
            job.resumable = false;

            const completedLog = createLogEntry('success', 'Job completed successfully.', 'JOB_COMPLETE', 'completed');
            job.logs.push(completedLog);

            this.queue.recordDuration(completedAt - startedAt);
            this._emit(job, 'clone:completed', { success: true, stats, jobId });
            this._emit(job, 'clone:log', { ...completedLog, jobId });
            this._emit(job, 'log', '[SUCCESS] Task Completed Successfully.');
            this._emit(job, 'progress', 100);
            recordEvent('job.completed', { mode: job.mode, durationMs: completedAt - startedAt });
        } catch (err) {
            job.completedAt = Date.now();
            const classified = classifyError(err, { isCancelled: () => job.isCancelled });

            if (job.isCancelled || classified.code === ERROR_CATEGORIES.CANCELLED) {
                job.status = JOB_STATUS.cancelled;
                job.stage = { stage: 'cancelled', label: 'Cancelled', progress: job.stage?.progress || 0 };
                const cancelLog = createLogEntry('warning', 'Job was cancelled by the user.', 'JOB_CANCEL', 'cancelled');
                job.logs.push(cancelLog);
                job.resumable = false;

                this._emit(job, 'clone:cancelled', { message: 'Operation cancelled by user.', jobId });
                this._emit(job, 'clone:log', { ...cancelLog, jobId });
                this._emit(job, 'log', '[WARN] Operation cancelled by user.');
                recordEvent('job.cancelled', { mode: job.mode });
            } else {
                job.status = JOB_STATUS.failed;
                const friendlyMessage = getFriendlyErrorMessage(classified);
                const safeSerialized = serializeErrorSafely(classified);
                const recoverable = !FATAL_CODES.has(classified.code) && job.completedStages.length > 0;

                job.error = friendlyMessage;
                job.errorMeta = {
                    ...safeSerialized,
                    recoverable,
                    category: classified.code,
                    canResume: recoverable && Boolean(job.resumeKeyHash),
                    needsToken: recoverable
                };
                job.stage = { stage: 'failed', label: 'Error Encountered', progress: job.stage?.progress || 0 };
                job.resumable = Boolean(job.errorMeta.canResume);

                const errorLog = createLogEntry('error', friendlyMessage, classified.code, 'error');
                job.logs.push(errorLog);

                this._emit(job, 'clone:error', {
                    message: friendlyMessage,
                    code: classified.code,
                    recoverable,
                    canResume: job.errorMeta.canResume,
                    details: safeSerialized,
                    jobId
                });
                this._emit(job, 'clone:log', { ...errorLog, jobId });
                this._emit(job, 'log', `[ERROR] ${friendlyMessage}`);
                recordEvent('job.failed', { mode: job.mode, code: classified.code });
            }
        } finally {
            if (job.socketId) this.socketJobMap.delete(job.socketId);
            job._userToken = null;
            job._resume = null;

            if (job._client) {
                destroyClient(job._client);
                job._client = null;
            }

            this._persist(job);
            this._broadcastQueue();
        }
    }

    /* ------------------------------------------------------------------ mirror */

    /**
     * Executor for continuous mirror jobs.
     * @param {any} context
     */
    async _executeMirror(context) {
        const { userToken, sourceId, targetId, options, onStage, onLog, onCheckpoint, isCancelled, isPaused, onClient, jobId } = context;

        onStage('initializing', 'Opening mirror session', 4);
        onLog(createLogEntry('info', 'Connecting to the Discord gateway for continuous mirroring...', null, 'initializing'));

        const client = createDiscordClient();
        onClient?.(client);

        await authenticateClient(client, userToken);
        onStage('validating_servers', 'Resolving source and target', 12);

        const sourceGuild = client.guilds.cache.get(sourceId);
        const targetGuild = client.guilds.cache.get(targetId);

        if (!sourceGuild) throw new Error(`Source server with ID (${sourceId}) was not found or your account does not have access.`);
        if (!targetGuild) throw new Error(`Target server with ID (${targetId}) was not found or your account is not a member.`);
        if (sourceId === targetId) throw new Error('Source and target must be different servers for mirroring.');

        onLog(createLogEntry('success', `Mirroring "${sourceGuild.name}" → "${targetGuild.name}"`, null, 'validating_servers'));

        // Seed the maps from the most recent successful clone (same pair) so the
        // new session reuses the existing webhooks and channel mapping.
        const seed = this._findSeedMaps(sourceId, targetId);
        const resumedChannels = context.resume?.maps?.channels || {};
        const resumedRoles = context.resume?.maps?.roles || {};

        const session = createMirrorSession({
            client,
            sourceGuild,
            targetGuild,
            adapter: options.dryRun ? this._createDryRunAdapter() : createDiscordAdapter(targetGuild),
            options: {
                ...options,
                channelMap: { ...(seed?.channels || {}), ...resumedChannels },
                roleMap: { ...(seed?.roles || {}), ...resumedRoles },
                structureDebounceMs: options.structureDebounceMs
            },
            emit: (type, message, detail) => {
                onLog(createLogEntry(type, message, detail, 'mirroring'));
            },
            onStat: (stat) => {
                if (stat === 'messagesForwarded') context.onStat?.('mirror_message');
            },
            checkpoint: () => onCheckpoint({})
        });

        session.attach();

        const job = this.jobs.get(jobId);
        if (job) {
            job.mirror = session;
            job.maps = {
                roles: Object.fromEntries(session.roleMap),
                categories: {},
                channels: Object.fromEntries(session.channelMap)
            };
        }

        onStage('mirroring', 'Mirroring live activity', 50);
        onLog(createLogEntry('success', 'Continuous mirror is live. New source activity will be forwarded.', 'MIRROR_LIVE', 'mirroring'));

        let statsTimer = null;
        /** @type {null | (() => void)} */
        let removeClientErrorListener = null;
        try {
            await new Promise((resolve, reject) => {
                statsTimer = setInterval(() => {
                    if (isCancelled()) return resolve(undefined);
                    if (isPaused()) {
                        session.pause();
                        onStage('mirroring_paused', 'Mirror paused', 50);
                    } else {
                        session.resume();
                    }
                    const snapshot = session.getSnapshot();
                    context.onMirrorStats?.(snapshot);
                    this._emit(job, 'mirror:stats', { jobId, ...snapshot });
                    this._persist(job);
                }, 3000);

                const onClientError = (err) => {
                    // Gateway hiccups are recoverable; stop only on auth failures.
                    const classified = classifyError(err);
                    if (classified.code === ERROR_CATEGORIES.AUTHENTICATION_ERROR) {
                        clearInterval(statsTimer);
                        reject(err);
                    } else {
                        onLog(createLogEntry('warning', 'Gateway error during mirror; connection will recover.', classified.message, 'mirroring'));
                    }
                };
                client.on('error', onClientError);
                removeClientErrorListener = () => client.removeListener('error', onClientError);
            });
        } finally {
            if (statsTimer) clearInterval(statsTimer);
            removeClientErrorListener?.();
            await session.stop();
        }

        const snapshot = session.getSnapshot();
        if (job) {
            job.maps = {
                roles: Object.fromEntries(session.roleMap),
                categories: {},
                channels: Object.fromEntries(session.channelMap)
            };
        }
        onCheckpoint({ maps: job?.maps });

        return {
            mode: JOB_MODES.mirror,
            sourceServerName: sourceGuild.name,
            targetServerName: targetGuild.name,
            mirror: snapshot,
            durationMs: Date.now() - (job?.startedAt || Date.now())
        };
    }

    /**
     * @param {string} sourceId
     * @param {string} targetId
     */
    _findSeedMaps(sourceId, targetId) {
        let best = null;
        for (const job of this.jobs.values()) {
            if (job.sourceId !== sourceId || job.targetId !== targetId) continue;
            if (!job.maps) continue;
            const channelCount = Object.keys(job.maps.channels || {}).length;
            if (channelCount === 0) continue;
            if (!best || channelCount > Object.keys(best.channels || {}).length) {
                best = job.maps;
            }
        }
        return best;
    }

    _createDryRunAdapter() {
        let counter = 0;
        return {
            async createRole() { return { id: `dry_role_${++counter}` }; },
            async updateRole() { return null; },
            async deleteRole() { return null; },
            async createChannel(spec) { return { id: `dry_chan_${++counter}`, name: spec.name }; },
            async updateChannel() { return null; },
            async deleteChannel() { return null; },
            async getWebhook() { return { id: 'dry_webhook' }; },
            async sendWebhook() { return { id: `dry_msg_${++counter}` }; },
            async disposeWebhooks() {}
        };
    }

    /* ---------------------------------------------------------------- controls */

    /**
     * @param {string} jobId
     * @param {{ socketId?: string|null, jobToken?: string|null, resumeKey?: string|null }} [auth]
     */
    cancelJob(jobId, auth = {}) {
        const job = this.jobs.get(jobId);
        if (!job) return false;
        if (!this.canControlJob(jobId, auth)) return false;

        if (job.status === JOB_STATUS.queued) {
            this.queue.remove(jobId);
            job.status = JOB_STATUS.cancelled;
            job.isCancelled = true;
            job.completedAt = Date.now();
            job.stage = { stage: 'cancelled', label: 'Cancelled before start', progress: 0 };
            job.logs.push(createLogEntry('warning', 'Job cancelled while waiting in the queue.', 'JOB_CANCEL', 'cancelled'));
            if (job.socketId) this.socketJobMap.delete(job.socketId);
            this._emit(job, 'clone:cancelled', { message: 'Queued job cancelled.', jobId });
            this._persist(job);
            this._broadcastQueue();
            return true;
        }

        if ([JOB_STATUS.running, JOB_STATUS.paused].includes(job.status)) {
            job.isCancelled = true;
            job.lastActivityAt = Date.now();
            this._emit(job, 'clone:cancelling', {
                message: 'Cancellation signal received. Releasing resources...',
                jobId
            });
            return true;
        }

        return false;
    }

    /**
     * @param {string} jobId
     * @param {{ socketId?: string|null, jobToken?: string|null, resumeKey?: string|null }} [auth]
     */
    pauseJob(jobId, auth = {}) {
        const job = this.jobs.get(jobId);
        if (!job || !this.canControlJob(jobId, auth)) return false;
        if (job.status !== JOB_STATUS.running) return false;

        job.isPaused = true;
        job.status = JOB_STATUS.paused;
        job.stage = { stage: 'paused', label: 'Paused', progress: job.stage?.progress || 0 };
        job.logs.push(createLogEntry('info', 'Job paused by the operator.', 'JOB_PAUSE', 'paused'));
        this._emit(job, 'job:paused', { jobId, stage: job.stage });
        this._persist(job);
        return true;
    }

    /**
     * @param {string} jobId
     * @param {{ socketId?: string|null, jobToken?: string|null, resumeKey?: string|null }} [auth]
     */
    resumePausedJob(jobId, auth = {}) {
        const job = this.jobs.get(jobId);
        if (!job || !this.canControlJob(jobId, auth)) return false;
        if (job.status !== JOB_STATUS.paused) return false;

        job.isPaused = false;
        job.status = JOB_STATUS.running;
        job.stage = { stage: 'running', label: 'Resumed', progress: job.stage?.progress || 0 };
        job.logs.push(createLogEntry('info', 'Job resumed by the operator.', 'JOB_RESUME', 'running'));
        this._emit(job, 'job:resumed', { jobId });
        this._persist(job);
        return true;
    }

    /**
     * Cancels every queued job and signals running ones.
     * @returns {number}
     */
    cancelAllRunning() {
        let signalled = 0;

        for (const id of this.queue.clear()) {
            const job = this.jobs.get(id);
            if (!job) continue;
            job.status = JOB_STATUS.cancelled;
            job.isCancelled = true;
            job.completedAt = Date.now();
            signalled++;
            this._persist(job);
        }

        for (const job of this.jobs.values()) {
            if ([JOB_STATUS.running, JOB_STATUS.paused].includes(job.status)) {
                job.isCancelled = true;
                job.isPaused = false;
                job.lastActivityAt = Date.now();
                signalled++;
            }
        }

        this._broadcastQueue();
        return signalled;
    }

    /**
     * @param {number} concurrency
     */
    setConcurrency(concurrency) {
        const applied = this.queue.setConcurrency(concurrency);
        this._pump();
        return applied;
    }

    /**
     * @param {string} jobId
     */
    getQueuePosition(jobId) {
        return this.queue.positionOf(jobId);
    }

    getQueueSnapshot() {
        return {
            concurrency: this.queue.concurrency,
            queued: this.queue.size,
            running: this.getActiveJobCount(),
            averageDurationMs: this.queue.averageDurationMs(),
            entries: this.queue.list((id) => {
                const job = this.jobs.get(id);
                return job ? { id: job.id, mode: job.mode, sourceId: job.sourceId, targetId: job.targetId } : null;
            })
        };
    }

    /* ------------------------------------------------------------- persistence */

    /**
     * @param {any} job
     */
    _persist(job) {
        if (!job) return;
        job.updatedAt = Date.now();
        this.store.save({
            ...job,
            resumeKeyHash: job.resumeKeyHash
        });
    }

    async flushState() {
        await this.store.flush();
    }

    /* -------------------------------------------------------------- snapshots */

    /**
     * @param {string} [mode]
     */
    _snapshotCounters(job) {
        return { ...job.statCounters };
    }

    /**
     * @param {string} jobId
     */
    getJobSnapshot(jobId) {
        const job = this.jobs.get(jobId);
        if (!job) return null;

        return {
            id: job.id,
            mode: job.mode,
            status: job.status,
            priority: job.priority,
            sourceId: job.sourceId,
            targetId: job.targetId,
            sourceGuildName: job.sourceGuildName,
            targetGuildName: job.targetGuildName,
            options: job.options,
            createdAt: job.createdAt,
            startedAt: job.startedAt,
            completedAt: job.completedAt,
            isCancelled: job.isCancelled,
            isPaused: job.status === JOB_STATUS.paused,
            stage: job.stage,
            progress: job.progress,
            logs: job.logs,
            statCounters: this._snapshotCounters(job),
            stats: job.stats,
            error: job.error,
            errorMeta: job.errorMeta,
            completedStages: [...job.completedStages],
            resumable: Boolean(job.resumable || job.status === JOB_STATUS.interrupted),
            queuePosition: job.status === JOB_STATUS.queued ? this.queue.positionOf(job.id) : 0,
            estimatedWaitMs: job.status === JOB_STATUS.queued ? this.queue.estimatedWaitMs(job.id) : 0,
            attempts: job.attempts,
            mirror: job.mirror ? job.mirror.getSnapshot() : null
        };
    }

    /**
     * @param {{ limit?: number }} [options]
     */
    listJobs(options = {}) {
        const limit = options.limit || 25;
        return [...this.jobs.values()]
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            .slice(0, limit)
            .map(job => this.getJobSnapshot(job.id));
    }

    getResumableJobs() {
        return [...this.jobs.values()]
            .filter(job => job.status === JOB_STATUS.interrupted || job.resumable)
            .map(job => this.getJobSnapshot(job.id));
    }

    getActiveOrLatestJob() {
        let runningJob = null;
        let latestJob = null;

        for (const job of this.jobs.values()) {
            if (job.status === JOB_STATUS.running && !runningJob) {
                runningJob = job;
            }
            if (!latestJob || job.createdAt > latestJob.createdAt) {
                latestJob = job;
            }
        }

        const target = runningJob || latestJob;
        return target ? this.getJobSnapshot(target.id) : null;
    }

    /* ---------------------------------------------------------------- internal */

    /**
     * @param {any} job
     * @param {string} event
     * @param {any} payload
     */
    _emit(job, event, payload) {
        if (!this.io || !job) return;
        this.io.to(`job:${job.id}`).emit(event, payload);
    }

    _broadcastQueue() {
        if (!this.io) return;
        this.io.to('jobs').emit('queue:state', this.getQueueSnapshot());
    }

    _checkStaleJobs() {
        const now = Date.now();
        for (const job of this.jobs.values()) {
            if (job.status !== JOB_STATUS.running) continue;
            if (job.mode === JOB_MODES.mirror) {
                job.lastActivityAt = now; // Mirror sessions are event-driven, not progress-driven.
                continue;
            }
            if (now - job.lastActivityAt <= this.staleTimeoutMs) continue;

            job.status = JOB_STATUS.failed;
            job.completedAt = now;
            job.isCancelled = true;
            job.error = 'Job timed out due to prolonged gateway inactivity.';
            job.errorMeta = {
                code: 'STALE_TIMEOUT',
                category: 'TIMEOUT',
                recoverable: true,
                canResume: job.completedStages.length > 0
            };
            job.stage = { stage: 'failed', label: 'Stale Timeout', progress: job.stage?.progress || 0 };

            const staleLog = createLogEntry('error', 'Job marked failed due to inactivity timeout.', 'STALE_TIMEOUT', 'failed');
            job.logs.push(staleLog);
            this._emit(job, 'clone:error', { message: job.error, code: 'TIMEOUT', jobId: job.id });
            this._emit(job, 'clone:log', { ...staleLog, jobId: job.id });

            if (job.socketId) this.socketJobMap.delete(job.socketId);
            this._persist(job);
        }
    }

    _pruneOldJobs() {
        if (this.jobs.size <= this.MAX_RETAINED_JOBS) return;

        const entries = [...this.jobs.entries()].sort((a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0));
        for (const [id, job] of entries) {
            if (this.jobs.size <= this.MAX_RETAINED_JOBS) break;
            if ([JOB_STATUS.running, JOB_STATUS.paused, JOB_STATUS.queued].includes(job.status)) continue;
            this.jobs.delete(id);
            this.store.remove(id).catch(() => {});
        }
    }

    async waitForIdle() {
        /** @type {Promise<any>[]} */
        const pending = [];
        for (const job of this.jobs.values()) {
            if ([JOB_STATUS.running, JOB_STATUS.paused, JOB_STATUS.queued].includes(job.status) && job._promise) {
                pending.push(job._promise.catch(() => {}));
            }
        }
        return Promise.all(pending);
    }

    async shutdown() {
        this._shuttingDown = true;
        if (this._staleSweeper) {
            clearInterval(this._staleSweeper);
            this._staleSweeper = null;
        }
        this.cancelAllRunning();
        await this.waitForIdle();
        await this.flushState();
    }
}

export const jobManager = new JobManager();
export { PRIORITIES };
