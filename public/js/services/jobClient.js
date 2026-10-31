/**
 * JobClient — the only place that knows about Socket.IO.
 *
 * It owns the connection, normalises the (legacy + v3) server events into a
 * single vocabulary, and re-emits them. Managers subscribe to `client.on(...)`
 * and never touch a raw socket, which keeps the transport swappable (the test
 * harness injects a fake socket here).
 */

/** @typedef {(payload: any) => void} Handler */

export class JobClient {
    /**
     * @param {{ socketFactory?: () => any, autoConnect?: boolean }} [options]
     */
    constructor(options = {}) {
        this.socketFactory = options.socketFactory || (() => (typeof window !== 'undefined' && window.io ? window.io() : null));
        /** @type {any} */
        this.socket = null;
        /** @type {Map<string, Set<Handler>>} */
        this.handlers = new Map();
        this.connected = false;
        this.jobId = null;
        this.features = {};
    }

    /* ------------------------------------------------------------------ events */

    /**
     * @param {string} event
     * @param {Handler} handler
     */
    on(event, handler) {
        if (!this.handlers.has(event)) this.handlers.set(event, new Set());
        this.handlers.get(event).add(handler);
        return () => this.off(event, handler);
    }

    /**
     * @param {string} event
     * @param {Handler} handler
     */
    off(event, handler) {
        this.handlers.get(event)?.delete(handler);
    }

    /**
     * @param {string} event
     * @param {any} [payload]
     */
    emitLocal(event, payload) {
        const set = this.handlers.get(event);
        if (!set) return;
        for (const handler of set) {
            try {
                handler(payload);
            } catch (error) {
                // A broken subscriber must not break the socket loop.
                console.error(`[JobClient] handler for "${event}" failed`, error);
            }
        }
    }

    /* ---------------------------------------------------------------- lifecycle */

    connect() {
        if (this.socket) return this;

        const socket = this.socketFactory();
        if (!socket) {
            this.emitLocal('disconnect', { reason: 'no-transport' });
            return this;
        }
        this.socket = socket;

        socket.on('connect', () => {
            this.connected = true;
            this.emitLocal('connect', {});
            // Re-join the queue room after every reconnect.
            socket.emit('jobs:subscribe');
            if (this.jobId) socket.emit('job:subscribe', { jobId: this.jobId });
        });

        socket.on('disconnect', () => {
            this.connected = false;
            this.emitLocal('disconnect', {});
        });

        socket.on('system:ready', (payload = {}) => {
            this.features = payload.features || {};
            this.emitLocal('ready', payload);
            socket.emit('job:query_active');
            socket.emit('jobs:subscribe');
        });

        // ---- job lifecycle ------------------------------------------------
        socket.on('job:state', (job) => {
            if (job && job.id) this.jobId = job.id;
            this.emitLocal('job:state', job);
        });
        socket.on('jobs:list', (jobs) => this.emitLocal('jobs:list', jobs || []));

        socket.on('clone:started', (payload) => {
            if (payload?.jobId) {
                this.jobId = payload.jobId;
                socket.emit('job:subscribe', { jobId: payload.jobId });
            }
            this.emitLocal('job:started', payload);
        });
        socket.on('job:started', (payload) => this.emitLocal('job:started', payload));
        socket.on('job:restarted', (payload) => {
            if (payload?.jobId) {
                this.jobId = payload.jobId;
                socket.emit('job:subscribe', { jobId: payload.jobId });
            }
            this.emitLocal('job:restarted', payload);
        });

        socket.on('clone:stage', (payload) => this.emitLocal('stage', payload));
        socket.on('clone:progress', (payload) => this.emitLocal('progress', payload));
        socket.on('job:checkpoint', (payload) => this.emitLocal('checkpoint', payload));

        socket.on('clone:log', (payload) => this.emitLocal('log', payload));
        socket.on('log', (message) => this.emitLocal('legacy-log', message));

        socket.on('clone:completed', (payload) => this.emitLocal('completed', payload));
        socket.on('clone:cancelled', (payload) => this.emitLocal('cancelled', payload));
        socket.on('clone:cancelling', (payload) => this.emitLocal('cancelling', payload));
        socket.on('clone:error', (payload) => this.emitLocal('error', payload));

        socket.on('job:paused', (payload) => this.emitLocal('paused', payload));
        socket.on('job:resumed', (payload) => this.emitLocal('resumed', payload));
        socket.on('job:pause_result', (payload) => this.emitLocal('pause-result', payload));
        socket.on('job:resume_result', (payload) => this.emitLocal('resume-result', payload));

        socket.on('mirror:stats', (payload) => this.emitLocal('mirror:stats', payload));

        socket.on('queue:state', (payload) => this.emitLocal('queue', payload));
        socket.on('clone:preflight_result', (payload) => this.emitLocal('preflight', payload));

        socket.on('system:shutdown', (payload) => this.emitLocal('shutdown', payload));

        return this;
    }

    disconnect() {
        try {
            this.socket?.close();
        } catch {
            // already closed
        }
        this.socket = null;
        this.connected = false;
    }

    /* --------------------------------------------------------------- outbound */

    /**
     * @param {string} jobId
     * @param {{ jobToken?: string|null, resumeKey?: string|null }} [auth]
     */
    subscribeJob(jobId, auth = {}) {
        if (!jobId) return;
        this.jobId = jobId;
        this.socket?.emit('job:subscribe', {
            jobId,
            jobToken: auth.jobToken || null,
            resumeKey: auth.resumeKey || null
        });
    }

    subscribeQueue() {
        this.socket?.emit('jobs:subscribe');
    }

    /**
     * @param {{ mode?: string, userToken: string, sourceId: string, targetId: string, options: any, priority?: string }} payload
     */
    start(payload) {
        this.socket?.emit('clone:start', payload);
    }

    /**
     * @param {{ userToken: string, sourceId: string, targetId: string, options: any }} payload
     */
    preflight(payload) {
        this.socket?.emit('clone:preflight', payload);
    }

    /**
     * @param {{ jobId: string, jobToken?: string|null, resumeKey?: string|null }} payload
     */
    cancel(payload) {
        this.socket?.emit('clone:cancel', payload);
    }

    /**
     * @param {{ jobId: string, jobToken?: string|null, resumeKey?: string|null }} payload
     */
    pause(payload) {
        this.socket?.emit('job:pause', payload);
    }

    /**
     * @param {{ jobId: string, jobToken?: string|null, resumeKey?: string|null }} payload
     */
    resumePaused(payload) {
        this.socket?.emit('job:resume', payload);
    }

    /**
     * @param {{ jobId: string, userToken: string, resumeKey: string, sourceId?: string, targetId?: string }} payload
     */
    restart(payload) {
        this.socket?.emit('job:restart', payload);
    }
}
