import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateClonePayload } from './services/validationService.js';
import { executeClone } from './services/cloneService.js';
import { createLogEntry, sanitizeText } from './utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : '*';

const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST']
    }
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health status route
app.get('/api/health', (req, res) => {
    res.json({
        status: 'online',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Active clone operations map by socket ID for cancellation
const activeSessions = new Map();

io.on('connection', (socket) => {
    // Client connects
    socket.emit('system:ready', {
        serverTime: new Date().toISOString(),
        version: '2.0.0'
    });

    // Start Clone Sequence handler (supports both new 'clone:start' and legacy 'start_clone')
    const handleStartClone = async (data) => {
        // Prevent concurrent clone on single connection
        if (activeSessions.has(socket.id)) {
            socket.emit('clone:error', {
                message: 'An operation is already in progress for this session.'
            });
            socket.emit('log', '[ERROR] An operation is already in progress for this session.');
            return;
        }

        // Validate payload
        const validation = validateClonePayload(data);
        if (!validation.valid) {
            socket.emit('clone:error', {
                message: validation.error
            });
            socket.emit('log', `[ERROR] ${validation.error}`);
            return;
        }

        const sessionState = {
            isCancelled: false
        };
        activeSessions.set(socket.id, sessionState);

        const { userToken, sourceId, targetId, options } = validation;

        // Structured event emitters
        const onStage = (stage, label, progress) => {
            socket.emit('clone:stage', { stage, label, progress });
        };

        const onProgress = (percent, current, total, item) => {
            socket.emit('clone:progress', {
                progress: percent,
                current,
                total,
                item: sanitizeText(item)
            });
            // Legacy progress emit
            socket.emit('progress', percent);
        };

        const onLog = (logEntry) => {
            socket.emit('clone:log', logEntry);
            // Legacy log emit
            const prefix = logEntry.type === 'error' ? '[ERROR]' : logEntry.type === 'warning' ? '[WARN]' : logEntry.type === 'success' ? '[SUCCESS]' : '[SYS]';
            socket.emit('log', `${prefix} ${logEntry.message}${logEntry.detail ? ` (${logEntry.detail})` : ''}`);
        };

        try {
            socket.emit('clone:started', {
                sourceId,
                targetId,
                startedAt: Date.now()
            });

            const stats = await executeClone({
                userToken,
                sourceId,
                targetId,
                options,
                onStage,
                onProgress,
                onLog,
                isCancelled: () => sessionState.isCancelled
            });

            socket.emit('clone:completed', {
                success: true,
                stats
            });
            socket.emit('log', '[SUCCESS] Task Completed Successfully.');
            socket.emit('progress', 100);

        } catch (err) {
            const isUserCancelled = sessionState.isCancelled || err.message?.includes('cancelled by user');

            if (isUserCancelled) {
                const cancelLog = createLogEntry('warning', 'Clone sequence was cancelled by the user.');
                socket.emit('clone:cancelled', { message: 'Operation cancelled by user.' });
                socket.emit('clone:log', cancelLog);
                socket.emit('log', '[WARN] Operation cancelled by user.');
            } else {
                const cleanError = sanitizeText(err.message || 'An unexpected error occurred during the cloning process.');
                const errorLog = createLogEntry('error', cleanError);
                socket.emit('clone:error', {
                    message: cleanError,
                    details: err.code || null
                });
                socket.emit('clone:log', errorLog);
                socket.emit('log', `[ERROR] ${cleanError}`);
            }
        } finally {
            activeSessions.delete(socket.id);
        }
    };

    socket.on('clone:start', handleStartClone);
    socket.on('start_clone', handleStartClone);

    // Cancel Clone Sequence handler
    socket.on('clone:cancel', () => {
        const session = activeSessions.get(socket.id);
        if (session) {
            session.isCancelled = true;
            socket.emit('clone:cancelling', { message: 'Cancellation signal received. Releasing resources...' });
        }
    });

    // Cleanup on disconnect
    socket.on('disconnect', () => {
        const session = activeSessions.get(socket.id);
        if (session) {
            session.isCancelled = true;
            activeSessions.delete(socket.id);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Discord Server Cloner running on http://0.0.0.0:${PORT}`);
});
