/**
 * DISCLONER - HTTP & Socket.IO Entry Point
 *
 * Thin by design: configuration, guards and transport live here; all job logic
 * lives in services/. Every v2 route and socket event is preserved so existing
 * clients keep working, with the v3 surface layered on top.
 */

import express from 'express';
import { createServer } from 'http';
import { randomBytes } from 'node:crypto';
import { Server } from 'socket.io';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig } from './services/config.js';
import { describeFlags, getFlags, isEnabled } from './services/featureFlags.js';
import { validateClonePayload } from './services/validationService.js';
import { jobManager, JOB_MODES, JOB_STATUS } from './services/jobManager.js';
import { runPreflightCheck } from './services/preflightService.js';
import { getTelemetrySnapshot, flushTelemetry } from './services/telemetry.js';
import { APP_VERSION, HTTP_GUARD } from './services/configContract.js';
import { configureLogger, logger, sanitizeText, registerSecret } from './utils/logger.js';
import { globalRateLimiter } from './services/reliability/index.js';
import {
    startLimiter,
    preflightLimiter,
    preflightCooldown,
    startCooldown,
    getClientKey,
    createRateLimitMiddleware
} from './services/httpGuard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// CONFIGURATION
// ============================================================================
// Strict in production: a bad bind address or port must fail the boot loudly
// rather than silently falling back to a default.
let boot;
try {
    boot = loadConfig(process.env, { strict: process.env.NODE_ENV === 'production' });
} catch (err) {
    // The config layer throws a detailed, multi-line message; print it as-is
    // instead of a stack trace so operators can see every problem at once.
    console.error(`\n✖ ${err.message}\n`);
    process.exit(1);
}

const { config, warnings, errors } = boot;

configureLogger({ level: config.logLevel, format: config.logFormat });
const log = logger.child({ scope: 'server' });

for (const warning of warnings) log.warn(warning);

if (errors.length > 0) {
    for (const error of errors) log.error(error);
    log.error('Invalid configuration — refusing to start. Fix the values above and retry.');
    process.exit(1);
}

const PORT = config.port;
const HOST = config.host;

const allowAllOrigins = config.allowedOrigins?.includes('*') ?? false;
const corsOrigin = allowAllOrigins ? '*' : (config.allowedOrigins ?? false);

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
    maxHttpBufferSize: 1e6
});

jobManager.setSocketServer(io);

// Restore interrupted jobs before accepting traffic.
await jobManager.bootstrap();

app.disable('x-powered-by');

// ============================================================================
// SECURITY HEADERS
// ============================================================================
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader(
        'Content-Security-Policy',
        [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' data: https://fonts.gstatic.com",
            "img-src 'self' data: blob: https:",
            "media-src 'self' blob: https:",
            "connect-src 'self' ws: wss:",
            "object-src 'none'",
            "base-uri 'none'",
            "form-action 'self'"
        ].join('; ')
    );

    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    next();
});

app.use(express.json({ limit: HTTP_GUARD.maxBodySize }));

app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    }
}));

// ============================================================================
// HELPERS
// ============================================================================
const getGuardStats = () => ({
    startRequests: { limit: startLimiter.limit, windowMs: startLimiter.windowMs },
    preflight: { limit: preflightLimiter.limit, windowMs: preflightLimiter.windowMs }
});

/**
 * Extracts job ownership proof from a request.
 * @param {import('express').Request} req
 */
const getAuth = (req) => ({
    jobToken: req.query.token || req.body?.jobToken || req.get('x-job-token') || null,
    resumeKey: req.query.resumeKey || req.body?.resumeKey || req.get('x-resume-key') || null
});

/**
 * Resolves the requested mode, falling back to clone when the feature is off.
 * @param {any} requested
 */
function resolveMode(requested) {
    if (requested === JOB_MODES.mirror && !isEnabled('continuousMirror')) return JOB_MODES.clone;
    return requested === JOB_MODES.mirror ? JOB_MODES.mirror : JOB_MODES.clone;
}

// ============================================================================
// REST API
// ============================================================================

app.get('/api/health', (req, res) => {
    res.json({
        status: 'online',
        version: APP_VERSION,
        uptime: process.uptime(),
        mode: config.nodeEnv,
        activeJobs: jobManager.getActiveJobCount(),
        queue: jobManager.getQueueSnapshot(),
        telemetry: globalRateLimiter.getStats(),
        guards: getGuardStats(),
        features: getFlags(),
        storage: {
            persistent: config.persistJobs,
            stateDir: config.persistJobs ? config.stateDir : null
        },
        timestamp: new Date().toISOString()
    });
});

app.get('/api/features', (req, res) => {
    res.json({ success: true, version: APP_VERSION, features: describeFlags() });
});

app.get('/api/jobs', (req, res) => {
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit ?? '25'), 10) || 25));
    res.json({ success: true, jobs: jobManager.listJobs({ limit }) });
});

app.get('/api/jobs/active', (req, res) => {
    res.json({ success: true, job: jobManager.getActiveOrLatestJob() });
});

app.get('/api/jobs/resumable', (req, res) => {
    res.json({ success: true, jobs: jobManager.getResumableJobs() });
});

app.get('/api/jobs/:jobId', (req, res) => {
    const job = jobManager.getJobSnapshot(req.params.jobId);
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
    return res.json({ success: true, job });
});

app.get('/api/queue', (req, res) => {
    res.json({ success: true, queue: jobManager.getQueueSnapshot() });
});

const validateStartRequest = (req, res, next) => {
    const validation = validateClonePayload(req.body);
    if (!validation.valid) {
        return res.status(400).json({ success: false, error: validation.error, code: validation.code });
    }
    req.clonePayload = validation;
    return next();
};

const startHandler = (req, res) => {
    const validation = req.clonePayload;
    registerSecret(validation.userToken);

    try {
        const job = jobManager.startJob({
            mode: resolveMode(req.body?.mode),
            userToken: validation.userToken,
            sourceId: validation.sourceId,
            targetId: validation.targetId,
            options: validation.options,
            priority: req.body?.priority
        });

        return res.json({
            success: true,
            jobId: job.id,
            jobToken: job.jobToken,
            resumeKey: job._resumeKey || null,
            job: jobManager.getJobSnapshot(job.id)
        });
    } catch (err) {
        const code = err.code || 'JOB_START_ERROR';
        const status = ['JOB_QUEUE_FULL', 'JOB_ALREADY_RUNNING', 'MIRROR_LIMIT_REACHED'].includes(code) ? 429 : 500;
        return res.status(status).json({
            success: false,
            error: sanitizeText(err.message) || 'Unable to start job.',
            code
        });
    }
};

app.post(
    '/api/jobs',
    validateStartRequest,
    createRateLimitMiddleware(startLimiter, {
        message: 'Too many migration start attempts. Wait a moment before retrying to protect the Discord account behind this token.'
    }),
    startHandler
);

// Legacy alias (v2 clients)
app.post(
    '/api/jobs/start',
    validateStartRequest,
    createRateLimitMiddleware(startLimiter, {
        message: 'Too many migration start attempts. Wait a moment before retrying to protect the Discord account behind this token.'
    }),
    startHandler
);

app.all('/api/jobs/:jobId/cancel', (req, res) => {
    const cancelled = jobManager.cancelJob(req.params.jobId, getAuth(req));
    if (cancelled) return res.json({ success: true });

    const exists = Boolean(jobManager.getJobSnapshot(req.params.jobId));
    if (!exists) return res.status(404).json({ success: false, error: 'Job not found' });
    return res.status(403).json({ success: false, error: 'A valid job token is required to cancel this job.' });
});

app.post('/api/jobs/:jobId/pause', (req, res) => {
    const paused = jobManager.pauseJob(req.params.jobId, getAuth(req));
    if (paused) return res.json({ success: true });
    return res.status(409).json({ success: false, error: 'Job cannot be paused (not running, or credentials missing).' });
});

app.post('/api/jobs/:jobId/resume', (req, res) => {
    const { jobId } = req.params;

    // Resume a paused session in place...
    if (jobManager.resumePausedJob(jobId, getAuth(req))) {
        return res.json({ success: true, mode: 'continued' });
    }

    // ...or restart an interrupted job from its checkpoint.
    const validation = validateClonePayload({ ...req.body, sourceId: req.body?.sourceId || '0'.repeat(18), targetId: req.body?.targetId || '1'.repeat(18) });
    if (!validation.valid) {
        return res.status(400).json({ success: false, error: validation.error, code: validation.code });
    }

    registerSecret(validation.userToken);

    try {
        const job = jobManager.resumeJob(jobId, {
            userToken: validation.userToken,
            resumeKey: req.body?.resumeKey || req.query.resumeKey
        });
        return res.json({
            success: true,
            mode: 'restarted',
            jobId: job.id,
            jobToken: job.jobToken,
            job: jobManager.getJobSnapshot(job.id)
        });
    } catch (err) {
        const code = err.code || 'JOB_RESUME_ERROR';
        const status = code === 'JOB_NOT_FOUND' ? 404 : code === 'JOB_FORBIDDEN' ? 403 : 409;
        return res.status(status).json({ success: false, error: sanitizeText(err.message), code });
    }
});

app.get('/api/telemetry/status', (req, res) => {
    res.json({ success: true, telemetry: getTelemetrySnapshot() });
});

app.post('/api/telemetry/flush', async (req, res) => {
    const result = await flushTelemetry({ force: true });
    res.json({ success: true, result });
});

app.use('/api', (req, res) => {
    res.status(404).json({ success: false, error: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);

    const status = err.status || err.statusCode || 500;
    if (status === 413) return res.status(413).json({ success: false, error: 'Request body is too large.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ success: false, error: 'Malformed JSON payload.' });

    log.error('Unhandled HTTP error.', { error: err.message, path: req.path });
    return res.status(status).json({
        success: false,
        error: status >= 500 ? 'Internal server error.' : sanitizeText(err.message)
    });
});

// ============================================================================
// SOCKET.IO
// ============================================================================
io.on('connection', (socket) => {
    let currentSubscribedJobId = null;

    socket.emit('system:ready', {
        serverTime: new Date().toISOString(),
        version: APP_VERSION,
        features: getFlags()
    });

    socket.on('job:subscribe', ({ jobId, jobToken, resumeKey } = {}) => {
        if (!jobId || typeof jobId !== 'string') return;

        // Controlling a job needs the capability; merely watching one needs
        // either the capability or a job nobody is currently driving.
        const authorised = jobManager.canControlJob(jobId, { socketId: socket.id, jobToken, resumeKey })
            || jobManager.isViewable(jobId);

        if (!authorised) {
            socket.emit('clone:error', {
                message: 'You do not have access to that job.',
                code: 'JOB_FORBIDDEN'
            });
            return;
        }

        if (currentSubscribedJobId) socket.leave(`job:${currentSubscribedJobId}`);
        currentSubscribedJobId = jobId;
        socket.join(`job:${jobId}`);

        const snapshot = jobManager.getJobSnapshot(jobId);
        if (snapshot) socket.emit('job:state', snapshot);
    });

    // Queue + job list feed for the dashboard.
    socket.on('jobs:subscribe', () => {
        socket.join('jobs');
        socket.emit('queue:state', jobManager.getQueueSnapshot());
        socket.emit('jobs:list', jobManager.listJobs({ limit: 10 }));
    });

    socket.on('job:query_active', () => {
        const activeJob = jobManager.getActiveOrLatestJob();
        if (activeJob) {
            currentSubscribedJobId = activeJob.id;
            socket.emit('job:state', activeJob);
        } else {
            socket.emit('job:state', null);
        }
    });

    socket.on('clone:preflight', async (data) => {
        const cooldown = preflightCooldown.check(socket.id);
        if (!cooldown.allowed) {
            socket.emit('clone:preflight_result', {
                ready: false,
                status: 'BLOCKED',
                error: `Preflight is cooling down. Please retry in ${Math.ceil(cooldown.retryAfterMs / 1000)}s.`,
                code: 'RATE_LIMITED'
            });
            return;
        }

        const ipLimit = preflightLimiter.hit(getClientKey(socket.request || {}));
        if (!ipLimit.allowed) {
            socket.emit('clone:preflight_result', {
                ready: false,
                status: 'BLOCKED',
                error: `Too many preflight checks. Please retry in ${Math.ceil(ipLimit.retryAfterMs / 1000)}s.`,
                code: 'RATE_LIMITED'
            });
            return;
        }

        const validation = validateClonePayload(data);
        if (!validation.valid) {
            socket.emit('clone:preflight_result', {
                ready: false,
                status: 'BLOCKED',
                error: validation.error,
                code: validation.code
            });
            return;
        }

        registerSecret(validation.userToken);

        try {
            const report = await runPreflightCheck({
                userToken: validation.userToken,
                sourceId: validation.sourceId,
                targetId: validation.targetId,
                options: validation.options
            });
            socket.emit('clone:preflight_result', report);
        } catch (err) {
            socket.emit('clone:preflight_result', {
                ready: false,
                status: 'BLOCKED',
                error: sanitizeText(err.message || 'Preflight check failed.')
            });
        }
    });

    const handleStartJob = (data = {}) => {
        const cooldown = startCooldown.check(socket.id);
        if (!cooldown.allowed) {
            socket.emit('clone:error', {
                message: `Please wait ${Math.ceil(cooldown.retryAfterMs / 1000)}s before starting another job.`,
                code: 'RATE_LIMITED'
            });
            socket.emit('log', '[ERROR] Start request throttled.');
            return;
        }

        const validation = validateClonePayload(data);
        if (!validation.valid) {
            socket.emit('clone:error', { message: validation.error, code: validation.code });
            socket.emit('log', `[ERROR] ${validation.error}`);
            return;
        }

        registerSecret(validation.userToken);

        try {
            const job = jobManager.startJob({
                mode: resolveMode(data.mode),
                userToken: validation.userToken,
                sourceId: validation.sourceId,
                targetId: validation.targetId,
                options: validation.options,
                socketId: socket.id,
                priority: data.priority
            });

            currentSubscribedJobId = job.id;
            socket.join(`job:${job.id}`);

            socket.emit('clone:started', {
                jobId: job.id,
                jobToken: job.jobToken,
                resumeKey: job._resumeKey || null,
                mode: job.mode,
                sourceId: validation.sourceId,
                targetId: validation.targetId,
                startedAt: job.startedAt
            });
        } catch (err) {
            const message = sanitizeText(err.message) || 'Unable to start job.';
            socket.emit('clone:error', { message, code: err.code || 'JOB_START_ERROR' });
            socket.emit('log', `[ERROR] ${message}`);
        }
    };

    socket.on('clone:start', handleStartJob);
    socket.on('start_clone', handleStartJob);
    socket.on('job:start', handleStartJob);

    socket.on('clone:cancel', (data = {}) => {
        const targetJobId = data.jobId || currentSubscribedJobId;
        if (!targetJobId) return;
        const cancelled = jobManager.cancelJob(targetJobId, {
            socketId: socket.id,
            jobToken: data.jobToken,
            resumeKey: data.resumeKey
        });
        if (!cancelled) {
            socket.emit('log', '[WARN] Cancellation refused: this connection does not own that job.');
        }
    });
    socket.on('job:stop', (data = {}) => socket.emit('clone:cancel', data));

    socket.on('job:pause', (data = {}) => {
        const targetJobId = data.jobId || currentSubscribedJobId;
        if (!targetJobId) return;
        const paused = jobManager.pauseJob(targetJobId, { socketId: socket.id, jobToken: data.jobToken, resumeKey: data.resumeKey });
        socket.emit('job:pause_result', { jobId: targetJobId, success: paused });
    });

    socket.on('job:resume', (data = {}) => {
        const targetJobId = data.jobId || currentSubscribedJobId;
        if (!targetJobId) return;
        const resumed = jobManager.resumePausedJob(targetJobId, { socketId: socket.id, jobToken: data.jobToken, resumeKey: data.resumeKey });
        socket.emit('job:resume_result', { jobId: targetJobId, success: resumed, mode: 'continued' });
    });

    socket.on('job:restart', (data = {}) => {
        const { jobId, userToken, resumeKey } = data;
        if (!jobId || !userToken || !resumeKey) return;

        const validation = validateClonePayload({
            userToken,
            sourceId: data.sourceId || '0'.repeat(18),
            targetId: data.targetId || '1'.repeat(18)
        });
        if (!validation.valid) {
            socket.emit('clone:error', { message: validation.error, code: validation.code });
            return;
        }
        registerSecret(userToken);

        try {
            const job = jobManager.resumeJob(jobId, { userToken, resumeKey, socketId: socket.id });
            socket.join(`job:${job.id}`);
            socket.emit('job:restarted', { jobId: job.id, jobToken: job.jobToken, mode: 'restarted' });
        } catch (err) {
            socket.emit('clone:error', { message: sanitizeText(err.message), code: err.code || 'JOB_RESUME_ERROR' });
        }
    });

    socket.on('disconnect', () => {
        preflightCooldown.clear(socket.id);
        startCooldown.clear(socket.id);
        if (currentSubscribedJobId) socket.leave(`job:${currentSubscribedJobId}`);
    });
});

// ============================================================================
// LIFECYCLE
// ============================================================================
const bootId = randomBytes(4).toString('hex');

server.listen(PORT, HOST, () => {
    log.info(`Discloner listening on http://${HOST}:${PORT}`, { bootId, version: APP_VERSION });
    log.info(`CORS: ${allowAllOrigins ? 'ALLOW ALL (insecure)' : (corsOrigin === false ? 'same-origin only' : config.allowedOrigins.join(', '))}`);
    log.info(`Concurrency: ${config.maxConcurrentJobs} · Queue: ${config.maxQueuedJobs} · Mirror sessions: ${config.maxMirrorSessions}`);
    log.info(`Features: ${Object.entries(getFlags()).map(([k, v]) => `${k}=${v ? 'on' : 'off'}`).join(' ')}`);
});

let isShuttingDown = false;

async function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    log.info(`Shutdown requested.`, { signal });
    io.emit('system:shutdown', { message: 'Server is shutting down; active jobs were cancelled.' });

    try {
        await Promise.race([
            jobManager.shutdown(),
            new Promise(resolve => setTimeout(resolve, config.shutdownGraceMs))
        ]);
    } catch {
        // Never block shutdown.
    }

    const exit = () => process.exit(0);
    try { io.close(); } catch { /* already closed */ }
    try { server.close(exit); } catch { exit(); }
    setTimeout(exit, 2000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
    log.error('Unhandled promise rejection.', {
        error: reason instanceof Error ? reason.message : String(reason)
    });
});

process.on('uncaughtException', (err) => {
    log.error('Uncaught exception.', { error: err?.message || 'Unknown error' });
    shutdown('uncaughtException');
});

export { app, server, io, config, JOB_STATUS };
