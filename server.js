import express from 'express';
import { createServer } from 'http';
import { randomBytes } from 'node:crypto';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateClonePayload } from './services/validationService.js';
import { jobManager } from './services/jobManager.js';
import { runPreflightCheck } from './services/preflightService.js';
import { sanitizeText, registerSecret } from './utils/logger.js';
import { globalRateLimiter } from './services/reliability/index.js';
import { HTTP_GUARD, APP_VERSION } from './services/configContract.js';
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
// CONFIGURATION (environment driven, validated)
// ============================================================================
const parsePort = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) return fallback;
    return parsed;
};

const PORT = parsePort(process.env.PORT, 3000);
const HOST = process.env.HOST || '0.0.0.0';

/**
 * Origin policy:
 *  - Unset  -> same-origin only (no CORS headers). The bundled dashboard is
 *              served by this same process, so nothing else is needed.
 *  - Set    -> explicit comma-separated allowlist. "*" is still honoured for
 *              backwards compatibility but logs a warning at boot.
 */
const rawAllowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
    : null;
const allowAllOrigins = rawAllowedOrigins?.includes('*') ?? false;
const corsOrigin = allowAllOrigins ? '*' : (rawAllowedOrigins ?? false);

const app = express();
const server = createServer(app);

const io = new Server(server, {
    cors: {
        origin: corsOrigin,
        methods: ['GET', 'POST']
    },
    // Dashboard payloads contain migration logs; cap abuse of the framing layer.
    maxHttpBufferSize: 1e6
});

// Attach socket server to job manager
jobManager.setSocketServer(io);

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

    // API responses can contain guild names, channel listings and job logs.
    if (req.path.startsWith('/api/')) {
        res.setHeader('Cache-Control', 'no-store');
    }
    next();
});

app.use(express.json({ limit: HTTP_GUARD.maxBodySize }));

app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, filePath) => {
        // The dashboard shell must never be cached stale across releases.
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

// Periodically surfaced guard statistics (no secrets, aggregate counts only).
const getGuardStats = () => ({
    startRequests: { limit: startLimiter.limit, windowMs: startLimiter.windowMs },
    preflight: { limit: preflightLimiter.limit, windowMs: preflightLimiter.windowMs }
});

// ============================================================================
// REST API
// ============================================================================

// Health status route
app.get('/api/health', (req, res) => {
    res.json({
        status: 'online',
        uptime: process.uptime(),
        activeJobs: jobManager.getActiveJobCount(),
        telemetry: globalRateLimiter.getStats(),
        guards: getGuardStats(),
        timestamp: new Date().toISOString()
    });
});

// Active / Latest Job query
app.get('/api/jobs/active', (req, res) => {
    const job = jobManager.getActiveOrLatestJob();
    res.json({ success: true, job });
});

// Specific Job snapshot query
app.get('/api/jobs/:jobId', (req, res) => {
    const job = jobManager.getJobSnapshot(req.params.jobId);
    if (!job) {
        return res.status(404).json({ success: false, error: 'Job not found' });
    }
    res.json({ success: true, job });
});

// Validate before consuming rate-limit budget: typos should never lock the
// operator out, only actual gateway authenticating requests should count.
const validateStartRequest = (req, res, next) => {
    const validation = validateClonePayload(req.body);
    if (!validation.valid) {
        return res.status(400).json({ success: false, error: validation.error, code: validation.code });
    }
    req.clonePayload = validation;
    return next();
};

// Start Job via REST (rate limited: each start opens a Discord gateway session)
app.post(
    '/api/jobs/start',
    validateStartRequest,
    createRateLimitMiddleware(startLimiter, {
        message: 'Too many migration start attempts. Wait a moment before retrying to protect the Discord account behind this token.'
    }),
    (req, res) => {
        const validation = req.clonePayload;

        // Exact-value redaction for anything the token ends up inside of.
        registerSecret(validation.userToken);

        try {
            const job = jobManager.startJob({
                userToken: validation.userToken,
                sourceId: validation.sourceId,
                targetId: validation.targetId,
                options: validation.options
            });

            res.json({
                success: true,
                jobId: job.id,
                // Capability required to cancel this job later (REST-started jobs
                // have no owning socket).
                jobToken: job.jobToken,
                job: jobManager.getJobSnapshot(job.id)
            });
        } catch (err) {
            const status = (err.code === 'JOB_QUEUE_FULL' || err.code === 'JOB_ALREADY_RUNNING') ? 429 : 500;
            res.status(status).json({
                success: false,
                error: sanitizeText(err.message) || 'Unable to start migration job.',
                code: err.code || 'JOB_START_ERROR'
            });
        }
    }
);

// Cancel Job via REST (supports POST, GET, Beacon keepalive).
// Requires the job token issued at start time; without it, only the owning
// socket may cancel (see the clone:cancel handler below).
app.all('/api/jobs/:jobId/cancel', (req, res) => {
    const providedToken = req.query.token || req.body?.jobToken || req.get('x-job-token');
    const cancelled = jobManager.cancelJob(req.params.jobId, { jobToken: providedToken });

    if (!cancelled) {
        const exists = Boolean(jobManager.getJobSnapshot(req.params.jobId));
        if (!exists) {
            return res.status(404).json({ success: false, error: 'Job not found' });
        }
        return res.status(403).json({
            success: false,
            error: 'A valid job token is required to cancel this job.'
        });
    }
    return res.json({ success: true });
});

// Unknown API routes should fail as JSON, not as the HTML shell.
app.use('/api', (req, res) => {
    res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Central error handler: never leak stack traces or credentials to clients.
app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);

    const status = err.status || err.statusCode || 500;
    if (status === 413) {
        return res.status(413).json({ success: false, error: 'Request body is too large.' });
    }
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ success: false, error: 'Malformed JSON payload.' });
    }
    console.error('[HTTP_ERROR]', sanitizeText(err.message || 'Unhandled request error'));
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

    // Client connects
    socket.emit('system:ready', {
        serverTime: new Date().toISOString(),
        version: APP_VERSION
    });

    // Subscribe to a specific background job
    socket.on('job:subscribe', ({ jobId } = {}) => {
        if (!jobId || typeof jobId !== 'string') return;
        if (currentSubscribedJobId) {
            socket.leave(`job:${currentSubscribedJobId}`);
        }
        currentSubscribedJobId = jobId;
        socket.join(`job:${jobId}`);

        const snapshot = jobManager.getJobSnapshot(jobId);
        if (snapshot) {
            socket.emit('job:state', snapshot);
        }
    });

    // Query active/latest job on reconnection
    socket.on('job:query_active', () => {
        const activeJob = jobManager.getActiveOrLatestJob();
        if (activeJob) {
            currentSubscribedJobId = activeJob.id;
            socket.emit('job:state', activeJob);
        } else {
            socket.emit('job:state', null);
        }
    });

    // Preflight Check Handler (throttled: each check authenticates the token)
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

    // Start Clone Sequence handler
    const handleStartClone = (data) => {
        const cooldown = startCooldown.check(socket.id);
        if (!cooldown.allowed) {
            socket.emit('clone:error', {
                message: `Please wait ${Math.ceil(cooldown.retryAfterMs / 1000)}s before starting another migration.`,
                code: 'RATE_LIMITED'
            });
            socket.emit('log', '[ERROR] Start request throttled.');
            return;
        }

        const validation = validateClonePayload(data);
        if (!validation.valid) {
            socket.emit('clone:error', {
                message: validation.error,
                code: validation.code
            });
            socket.emit('log', `[ERROR] ${validation.error}`);
            return;
        }

        const { userToken, sourceId, targetId, options } = validation;
        registerSecret(userToken);

        try {
            const job = jobManager.startJob({
                userToken,
                sourceId,
                targetId,
                options,
                socketId: socket.id
            });

            currentSubscribedJobId = job.id;
            socket.join(`job:${job.id}`);

            socket.emit('clone:started', {
                jobId: job.id,
                jobToken: job.jobToken,
                sourceId,
                targetId,
                startedAt: job.startedAt
            });
        } catch (err) {
            socket.emit('clone:error', {
                message: sanitizeText(err.message) || 'Unable to start migration job.',
                code: err.code || 'JOB_START_ERROR'
            });
            socket.emit('log', `[ERROR] ${sanitizeText(err.message) || 'Unable to start migration job.'}`);
        }
    };

    socket.on('clone:start', handleStartClone);
    socket.on('start_clone', handleStartClone);

    // Cancel Clone Sequence handler (ownership enforced by the job manager)
    socket.on('clone:cancel', (data = {}) => {
        const targetJobId = data.jobId || currentSubscribedJobId;
        if (!targetJobId) return;

        const cancelled = jobManager.cancelJob(targetJobId, {
            socketId: socket.id,
            jobToken: data.jobToken
        });

        if (!cancelled) {
            socket.emit('log', '[WARN] Cancellation refused: this connection does not own that job.');
        }
    });

    // Safe disconnect: Do NOT cancel background tasks!
    socket.on('disconnect', () => {
        preflightCooldown.clear(socket.id);
        startCooldown.clear(socket.id);
        if (currentSubscribedJobId) {
            socket.leave(`job:${currentSubscribedJobId}`);
        }
    });
});

// ============================================================================
// LIFECYCLE
// ============================================================================
const bootId = randomBytes(4).toString('hex');

server.listen(PORT, HOST, () => {
    console.log(`[BOOT ${bootId}] Discloner listening on http://${HOST}:${PORT}`);
    console.log(`[BOOT ${bootId}] CORS origin policy: ${allowAllOrigins ? 'ALLOW ALL (insecure)' : (corsOrigin === false ? 'same-origin only' : corsOrigin.join(', '))}`);
    console.log(`[BOOT ${bootId}] Guards: start ${HTTP_GUARD.startLimit}/${HTTP_GUARD.startWindowMs / 1000}s, preflight ${HTTP_GUARD.preflightLimit}/${HTTP_GUARD.preflightWindowMs / 1000}s`);
});

/**
 * Graceful shutdown:
 * A self-token session left open holds a live gateway connection. Signalling
 * running jobs and closing the Socket.IO server lets cloneService tear down its
 * Discord client through the normal finally{} path.
 */
let isShuttingDown = false;
const SHUTDOWN_GRACE_MS = 8000;

async function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    const signalled = jobManager.cancelAllRunning();
    console.log(`[SHUTDOWN] ${signal} received. Signalled ${signalled} running job(s).`);

    jobManager.shutdown();
    io.emit('system:shutdown', { message: 'Server is shutting down; active migrations were cancelled.' });

    // Give executors a chance to unwind (closing their Discord clients) before exit.
    try {
        await Promise.race([
            jobManager.waitForIdle(),
            new Promise(resolve => setTimeout(resolve, SHUTDOWN_GRACE_MS))
        ]);
    } catch {
        // Never block shutdown on a stubborn job.
    }

    const exit = () => process.exit(0);
    try {
        io.close();
    } catch {
        // already closed
    }
    try {
        server.close(exit);
    } catch {
        exit();
    }
    setTimeout(exit, 2000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    console.error('[UNHANDLED_REJECTION]', sanitizeText(message));
});

process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT_EXCEPTION]', sanitizeText(err?.message || 'Unknown error'));
    shutdown('uncaughtException');
});
