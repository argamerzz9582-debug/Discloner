import { byId, setHidden, setText } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { read, write, remove, KEYS } from '../services/storage.js';

/**
 * Explicit client-side state machine.
 *
 * idle ──start──▶ preflight ──ok──▶ starting ──▶ queued ──▶ running
 *                   │                                      │  ▲
 *                   └──cancel──▶ idle            pause ─────┘  │
 *                                                resume ───────┘
 * running ──▶ stopping ──▶ cancelled
 * running ──▶ completed | failed
 *
 * Illegal transitions are ignored (and logged), which keeps a slow or
 * duplicated socket frame from corrupting the UI.
 */
export const STATES = Object.freeze({
    IDLE: 'idle',
    PREFLIGHT: 'preflight',
    STARTING: 'starting',
    QUEUED: 'queued',
    RUNNING: 'running',
    PAUSED: 'paused',
    STOPPING: 'stopping',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled'
});

/** @type {Record<string, string[]>} */
const TRANSITIONS = {
    idle: ['preflight', 'queued', 'running', 'failed', 'completed', 'cancelled'],
    preflight: ['starting', 'idle', 'failed'],
    starting: ['queued', 'running', 'failed', 'idle', 'cancelled'],
    queued: ['running', 'cancelled', 'failed', 'stopping', 'paused'],
    running: ['paused', 'stopping', 'completed', 'failed', 'cancelled', 'queued'],
    paused: ['running', 'stopping', 'cancelled', 'failed', 'completed'],
    stopping: ['cancelled', 'completed', 'failed'],
    completed: ['idle', 'preflight', 'queued', 'running'],
    failed: ['idle', 'preflight', 'queued', 'running'],
    cancelled: ['idle', 'preflight', 'queued', 'running']
};

const ACTIVE_STATES = [
    STATES.PREFLIGHT,
    STATES.STARTING,
    STATES.QUEUED,
    STATES.RUNNING,
    STATES.PAUSED,
    STATES.STOPPING
];

export class JobController {
    /**
     * @param {{
     *   client: any, tokenManager: any, serverSelector: any, configPanel: any,
     *   progress: any, console: any, toast: any,
     *   onStateChange?: (state: string, detail?: any) => void
     * }} deps
     */
    constructor(deps) {
        this.client = deps.client;
        this.token = deps.tokenManager;
        this.servers = deps.serverSelector;
        this.config = deps.configPanel;
        this.progress = deps.progress;
        this.console = deps.console;
        this.toast = deps.toast;
        this.onStateChange = deps.onStateChange || (() => {});

        this.state = STATES.IDLE;
        this.jobId = null;
        this.jobToken = null;
        this.resumeKey = null;
        this.mode = 'clone';
        this.startedAt = 0;
        this.preflightReport = null;
        this.ownershipLost = false;
        this.warningCount = 0;

        this.startBtn = byId('startBtn');
        this.startBtnText = byId('startBtnText');
        this.pauseBtn = byId('pauseBtn');
        this.pauseBtnText = byId('pauseBtnText');
        this.cancelBtn = byId('cancelBtn');
        this.resumeBtn = byId('resumeJobBtn');
        this.dismissRecoveryBtn = byId('dismissRecoveryBtn');

        this.restoreSession();
        this.bindUi();
        this.bindSocket();
        this.render();
    }

    /* ------------------------------------------------------------- persistence */

    restoreSession() {
        const jobId = read(KEYS.activeJob);
        if (!jobId) return;
        this.jobId = jobId;
        this.jobToken = read(KEYS.activeJobToken);
        this.resumeKey = read(KEYS.activeResumeKey);
    }

    persistSession() {
        if (!this.jobId) return;
        write(KEYS.activeJob, this.jobId);
        if (this.jobToken) write(KEYS.activeJobToken, this.jobToken);
        if (this.resumeKey) write(KEYS.activeResumeKey, this.resumeKey);
    }

    clearSession() {
        this.jobId = null;
        this.jobToken = null;
        this.resumeKey = null;
        remove(KEYS.activeJob);
        remove(KEYS.activeJobToken);
        remove(KEYS.activeResumeKey);
    }

    /* -------------------------------------------------------------------- UI */

    bindUi() {
        byId('clonerForm')?.addEventListener('submit', (event) => {
            event.preventDefault();
            this.handleStartRequest();
        });

        byId('cancelBtn')?.addEventListener('click', () => this.requestCancel());
        byId('pauseBtn')?.addEventListener('click', () => this.togglePause());
        this.resumeBtn?.addEventListener('click', () => this.requestResume());
        this.dismissRecoveryBtn?.addEventListener('click', () => {
            this.progress.hideRecovery();
        });

        byId('cancelConfirmBtn')?.addEventListener('click', () => this.closeConfirm());
        byId('proceedConfirmBtn')?.addEventListener('click', () => this.confirmStart());

        byId('closeSummaryBtn')?.addEventListener('click', () => this.closeSummary());
        byId('viewLogsSummaryBtn')?.addEventListener('click', () => {
            this.closeSummary();
            document.getElementById('consoleCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });

        // Ctrl/Cmd+Enter starts, Escape closes the top-most dialog.
        document.addEventListener('keydown', (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                this.handleStartRequest();
            }
            if (event.key === 'Escape') this.closeTopDialog();
        });

        // Restore the last-used mode.
        const savedMode = read(KEYS.jobMode);
        if (savedMode === 'mirror') {
            this.config.setMode('mirror');
        }
        this.mode = this.config.getMode();
    }

    bindSocket() {
        const client = this.client;

        client.on('ready', () => {
            // After a reload the stored capability re-opens the job room.
            if (this.jobId) {
                client.subscribeJob(this.jobId, { jobToken: this.jobToken, resumeKey: this.resumeKey });
            }
        });

        client.on('job:state', (job) => this.handleJobState(job));

        client.on('preflight', (report) => this.handlePreflight(report));

        client.on('job:started', (payload) => {
            if (payload?.jobId) {
                this.jobId = payload.jobId;
                this.jobToken = payload.jobToken || null;
                this.resumeKey = payload.resumeKey || null;
                this.persistSession();
                client.subscribeJob(payload.jobId);
            }
            if (this.state !== STATES.QUEUED) this.transition(STATES.RUNNING);
            this.progress.showActive();
            this.progress.startTimers({ startedAt: payload?.startedAt || Date.now() });
        });

        client.on('job:restarted', (payload) => {
            if (payload?.jobId) {
                this.jobId = payload.jobId;
                if (payload.jobToken) this.jobToken = payload.jobToken;
                this.persistSession();
                client.subscribeJob(payload.jobId);
            }
            this.transition(STATES.RUNNING);
            this.progress.showActive();
            this.progress.startTimers({ startedAt: Date.now() });
            this.progress.hideRecovery();
        });

        client.on('stage', (payload) => {
            if (!payload) return;
            if (this.state === STATES.IDLE || this.state === STATES.PREFLIGHT) this.transition(STATES.RUNNING);
            this.progress.setStage(payload.stage, payload);
        });

        client.on('progress', (payload) => {
            if (!payload) return;
            this.progress.setProgress(payload.progress ?? payload.percent ?? 0, {
                detail: payload.item ? humanizeItem(payload.item) : undefined,
                counts: Number.isFinite(payload.current) && Number.isFinite(payload.total)
                    ? `${payload.current} / ${payload.total}`
                    : undefined
            });
            if (Number.isFinite(payload.current) && Number.isFinite(payload.total) && payload.stage === 'cloning_messages') {
                this.progress.updateCounters({ messages: payload.current });
            }
        });

        client.on('log', (payload) => {
            if (!payload) return;
            const severity = payload.level || payload.severity || 'info';
            this.console.append(payload.message, severity, { timestamp: payload.timestamp ? Date.parse(payload.timestamp) || Date.now() : Date.now() });
            if (severity === 'warning') {
                this.warningCount += 1;
                this.progress.updateCounters({ warnings: this.warningCount });
            }
        });

        client.on('legacy-log', (message) => {
            const parsed = parseLegacyLog(message);
            if (parsed) this.console.append(parsed.message, parsed.severity);
        });

        client.on('completed', (payload) => this.handleCompleted(payload));
        client.on('cancelled', (payload) => this.handleCancelled(payload));
        client.on('cancelling', () => {
            this.transition(STATES.STOPPING);
            this.console.append('Stop requested — finishing the current item…', 'warning');
        });
        client.on('error', (payload) => this.handleError(payload));

        client.on('paused', () => {
            this.transition(STATES.PAUSED);
            this.console.append('Job paused. Progress is checkpointed.', 'warning');
            this.toast.info(t('toast.paused'));
        });

        client.on('resumed', () => {
            this.transition(STATES.RUNNING);
            this.console.append('Job resumed.', 'success');
        });

        client.on('pause-result', (payload) => {
            if (payload && payload.success === false) {
                this.toast.warning('Could not pause — this connection no longer owns the job.');
            }
        });

        client.on('resume-result', (payload) => {
            if (payload && payload.success === false) {
                this.toast.warning('Could not resume — this connection no longer owns the job.');
            }
        });

        client.on('mirror:stats', (payload) => {
            this.progress.updateMirrorStats(payload || {});
        });

        client.on('shutdown', (payload) => {
            this.console.append(payload?.message || 'Server shutting down.', 'error');
            if (ACTIVE_STATES.includes(this.state)) {
                this.progress.showRecovery({
                    title: 'Server restarted',
                    message: 'The service stopped while your job was running. Resume from the last checkpoint once it is back.',
                    recoverable: Boolean(this.resumeKey)
                });
            }
        });
    }

    /* -------------------------------------------------------------------- state */

    /**
     * @param {string} next
     * @param {any} [detail]
     */
    transition(next, detail) {
        if (!next) return false;
        if (this.state === next) {
            this.render();
            return true;
        }
        const allowed = TRANSITIONS[this.state] || [];
        if (!allowed.includes(next)) {
            console.debug(`[JobController] ignoring transition ${this.state} → ${next}`);
            return false;
        }
        const previous = this.state;
        this.state = next;
        this.render();
        this.onStateChange(next, { previous, detail });
        return true;
    }

    isActive() {
        return ACTIVE_STATES.includes(this.state);
    }

    render() {
        const s = this.state;
        const busy = [STATES.STARTING, STATES.QUEUED, STATES.RUNNING, STATES.PAUSED, STATES.STOPPING].includes(s);

        if (this.startBtn) {
            this.startBtn.disabled = busy || s === STATES.PREFLIGHT;
            this.startBtn.classList.toggle('is-busy', busy);
            this.startBtn.setAttribute('aria-busy', String(busy));
        }

        const label = {
            [STATES.STARTING]: t('action.starting'),
            [STATES.QUEUED]: 'QUEUED',
            [STATES.RUNNING]: this.mode === 'mirror' ? 'MIRRORING' : 'CLONING',
            [STATES.PAUSED]: 'PAUSED',
            [STATES.STOPPING]: 'STOPPING…',
            [STATES.COMPLETED]: t('action.startFresh').toUpperCase(),
            [STATES.FAILED]: t('action.retry').toUpperCase(),
            [STATES.CANCELLED]: t('action.startFresh').toUpperCase()
        }[s] || (this.mode === 'mirror' ? t('action.start.mirror') : t('action.start.clone'));

        setText(this.startBtnText, label);

        setHidden(this.pauseBtn, !(s === STATES.RUNNING || s === STATES.PAUSED));
        setText(this.pauseBtnText, s === STATES.PAUSED ? t('action.resume') : t('action.pause'));

        setHidden(this.cancelBtn, !this.isActive() || s === STATES.PREFLIGHT);
        if (this.cancelBtn) this.cancelBtn.disabled = s === STATES.STOPPING;

        // Phase chips in the hero.
        const reached = {
            [STATES.PREFLIGHT]: 1,
            [STATES.STARTING]: 2,
            [STATES.QUEUED]: 2,
            [STATES.RUNNING]: 3,
            [STATES.PAUSED]: 3,
            [STATES.COMPLETED]: 3,
            [STATES.FAILED]: 2,
            [STATES.CANCELLED]: 2
        }[s] || 0;

        const tokenFilled = this.token.isValid();
        const routeFilled = this.servers.isComplete();

        markStep(byId('stepToken'), tokenFilled || reached >= 1);
        markStep(byId('stepRoute'), routeFilled || reached >= 2);
        markStep(byId('stepClone'), reached >= 3);
    }

    /* ------------------------------------------------------------------- start */

    handleStartRequest() {
        if (this.isActive()) return;

        // A completed/failed job returns the form to editing state.
        if ([STATES.COMPLETED, STATES.FAILED, STATES.CANCELLED].includes(this.state)) {
            this.resetToIdle();
        }

        const token = this.token.getValue();
        if (!this.token.isValid(token)) {
            this.token.showError(t('error.tokenRequired'));
            byId('userToken')?.focus();
            this.toast.error(t('error.tokenRequired'));
            return;
        }
        this.token.clearError();

        const validation = this.servers.validate();
        if (!validation.ok) {
            this.toast.error(validation.errors[0]);
            byId('sourceId')?.focus();
            return;
        }

        this.mode = this.config.getMode();
        this.preflightReport = null;

        if (!this.transition(STATES.PREFLIGHT)) return;

        byId('confirmSourceId') && setText(byId('confirmSourceId'), this.servers.getSourceId());
        setText(byId('confirmTargetId'), this.servers.getTargetId());
        setHidden(byId('confirmCleanupAlert'), !this.config.getOptions().cleanTarget);

        const badge = byId('preflightStatusBadge');
        if (badge) {
            setText(badge, 'CHECKING…');
            badge.className = 'preflight-status-badge checking';
        }
        setText(byId('preflightSubText'), 'Querying guild access & permissions…');
        const checks = byId('preflightChecksList');
        if (checks) checks.innerHTML = '';

        const proceed = byId('proceedConfirmBtn');
        if (proceed) {
            proceed.disabled = true;
            setText(proceed, 'Verifying…');
        }

        setHidden(byId('confirmModal'), false);
        byId('proceedConfirmBtn')?.focus();

        this.client.preflight({
            userToken: token,
            sourceId: this.servers.getSourceId(),
            targetId: this.servers.getTargetId(),
            mode: this.mode
        });
    }

    confirmStart() {
        if (this.state !== STATES.PREFLIGHT) return;

        const token = this.token.getValue();
        const proceed = byId('proceedConfirmBtn');
        if (proceed) {
            proceed.disabled = true;
            setText(proceed, 'Starting…');
        }

        this.mode = this.config.getMode();
        this.transition(STATES.STARTING);
        setHidden(byId('confirmModal'), true);

        this.console.clear();
        this.warningCount = 0;
        this.console.append(`Starting ${this.mode === 'mirror' ? 'continuous mirror' : 'one-shot clone'}…`, 'info');
        this.progress.reset();
        this.progress.showActive();

        this.client.start({
            mode: this.mode,
            userToken: token,
            sourceId: this.servers.getSourceId(),
            targetId: this.servers.getTargetId(),
            options: this.config.getOptions(),
            priority: 'normal'
        });
    }

    closeConfirm() {
        if (this.state === STATES.PREFLIGHT) this.transition(STATES.IDLE);
        setHidden(byId('confirmModal'), true);
    }

    closeTopDialog() {
        const open = ['confirmModal', 'summaryModal', 'helpModal', 'templatesModal', 'supportModal']
            .map(byId)
            .find((element) => element && !element.classList.contains('hidden'));
        if (open) {
            if (open.id === 'confirmModal') this.closeConfirm();
            else if (open.id === 'summaryModal') this.closeSummary();
            else open.classList.add('hidden');
        }
    }

    closeSummary() {
        setHidden(byId('summaryModal'), true);
    }

    /* ---------------------------------------------------------------- preflight */

    /** @param {any} report */
    handlePreflight(report) {
        this.preflightReport = report;
        const badge = byId('preflightStatusBadge');
        const proceed = byId('proceedConfirmBtn');
        const list = byId('preflightChecksList');

        if (!report) return;

        if (report.error || report.success === false) {
            if (badge) {
                setText(badge, 'BLOCKED');
                badge.className = 'preflight-status-badge blocked';
            }
            setText(byId('preflightSubText'), report.message || report.error || 'Preflight failed.');
            if (proceed) {
                proceed.disabled = true;
                setText(proceed, 'Cannot start');
            }
            this.console.append(report.message || report.error || 'Preflight failed.', 'error');
            return;
        }

        const warnings = Array.isArray(report.warnings) ? report.warnings : [];
        const blocking = Array.isArray(report.errors) ? report.errors : [];

        if (badge) {
            const ok = blocking.length === 0;
            setText(badge, ok ? (warnings.length ? 'READY (WARNINGS)' : 'READY') : 'BLOCKED');
            badge.className = `preflight-status-badge ${ok ? (warnings.length ? 'warning' : 'ready') : 'blocked'}`;
        }
        setText(byId('preflightSubText'), blocking.length
            ? blocking[0]
            : warnings.length
                ? `${warnings.length} warning${warnings.length === 1 ? '' : 's'} — review below`
                : 'Both servers reachable and permissions verified.');

        if (list) {
            list.innerHTML = '';
            for (const check of [...(report.checks || [])]) {
                list.append(renderCheck(check));
            }
            for (const warning of warnings) {
                list.append(renderCheck({ label: typeof warning === 'string' ? warning : warning.message, status: 'warning' }));
            }
            for (const error of blocking) {
                list.append(renderCheck({ label: typeof error === 'string' ? error : error.message, status: 'error' }));
            }
        }

        if (proceed) {
            proceed.disabled = blocking.length > 0;
            setText(proceed, blocking.length ? 'Cannot start' : 'Start migration');
        }

        if (this.servers.sourceFeedback) {
            this.servers.showPreflightStage('source', { message: report.source?.name || 'Reachable' });
            this.servers.showPreflightStage('target', { message: report.target?.name || 'Reachable' });
        }
    }

    /* ------------------------------------------------------------------ control */

    requestCancel() {
        if (!this.jobId) {
            this.transition(STATES.IDLE);
            return;
        }
        this.transition(STATES.STOPPING);
        this.console.append('Stop requested.', 'warning');
        this.client.cancel({ jobId: this.jobId, jobToken: this.jobToken, resumeKey: this.resumeKey });

        // Belt-and-braces: also hit the REST endpoint in case the socket is down.
        if (!this.client.connected) {
            import('../services/api.js')
                .then(({ api }) => api.cancel(this.jobId, this.jobToken))
                .catch(() => this.toast.error('Could not reach the server to stop the job.'));
        }
    }

    togglePause() {
        if (!this.jobId) return;
        if (this.state === STATES.PAUSED) {
            this.client.resumePaused({ jobId: this.jobId, jobToken: this.jobToken, resumeKey: this.resumeKey });
        } else if (this.state === STATES.RUNNING) {
            this.client.pause({ jobId: this.jobId, jobToken: this.jobToken, resumeKey: this.resumeKey });
        }
    }

    requestResume() {
        if (!this.jobId || !this.resumeKey) {
            this.toast.warning('No checkpoint is available for this job.');
            return;
        }
        const token = this.token.getValue();
        if (!this.token.isValid(token)) {
            this.toast.error('Re-enter your token to resume this job.');
            byId('userToken')?.focus();
            return;
        }

        this.client.restart({
            jobId: this.jobId,
            userToken: token,
            resumeKey: this.resumeKey,
            sourceId: this.servers.getSourceId() || undefined,
            targetId: this.servers.getTargetId() || undefined
        });
        this.console.append('Resuming from the last checkpoint…', 'info');
        this.transition(STATES.STARTING);
    }

    /* ----------------------------------------------------------------- outcomes */

    /** @param {any} payload */
    handleCompleted(payload) {
        this.transition(STATES.COMPLETED);
        this.progress.stopTimers();
        this.progress.setStage('completed');
        this.progress.setProgress(100, { immediate: true, text: '100%', detail: 'Migration finished', counts: '' });
        this.progress.hideRecovery();

        const stats = payload?.stats || payload || {};
        setText(byId('statDuration'), formatMs(this.progress.startedAt ? Date.now() - this.progress.startedAt : 0));
        setText(byId('statRoles'), String(stats.roles ?? stats.rolesCloned ?? this.progress.counters.roles ?? 0));
        setText(byId('statCategories'), String(stats.categories ?? 0));
        setText(byId('statChannels'), String(stats.channels ?? stats.channelsCloned ?? this.progress.counters.channels ?? 0));
        setText(byId('statMessages'), String(stats.messages ?? stats.messagesCloned ?? this.progress.counters.messages ?? 0));
        setText(byId('statWarnings'), String(stats.warnings ?? this.progress.counters.warnings ?? 0));

        setText(byId('summaryTitle'), this.mode === 'mirror' ? 'Mirror session ended' : 'Migration completed');
        setText(byId('summarySubtitle'), this.mode === 'mirror'
            ? 'The live mirror stopped cleanly. All forwarded activity is listed in the console.'
            : 'Everything requested was applied to the target server.');

        setVerification(byId('statVerifyStatus'), stats.verification || stats.verify);
        setVerification(byId('statPermissions'), stats.permissions);
        setVerification(byId('statCleanup'), stats.cleanup);

        setHidden(byId('summaryModal'), false);
        byId('closeSummaryBtn')?.focus();

        write(KEYS.lastCompletedJob, JSON.stringify({ jobId: this.jobId, at: Date.now() }));
        this.clearSession();
        this.console.append('Job completed successfully.', 'success');

        // Allow starting another job straight away.
        this.transition(STATES.IDLE);
    }

    /** @param {any} payload */
    handleCancelled(payload) {
        this.transition(STATES.CANCELLED);
        this.progress.stopTimers();
        this.progress.setProgress(this.progress.percent, { immediate: true, detail: 'Stopped by user' });
        this.progress.hideRecovery();
        this.console.append(payload?.message || 'Job stopped by user.', 'warning');
        this.toast.info(t('toast.cancelled'));
        this.clearSession();
        this.transition(STATES.IDLE);
    }

    /** @param {any} payload */
    handleError(payload) {
        const message = payload?.message || 'The job stopped unexpectedly.';
        const code = payload?.code || 'UNKNOWN';
        const recoverable = Boolean(payload?.recoverable ?? this.resumeKey);

        this.transition(STATES.FAILED);
        this.progress.stopTimers();
        this.console.append(`${message} (${code})`, 'error');

        this.progress.showRecovery({
            title: recoverable ? 'Recoverable failure' : 'Job failed',
            message: recoverable
                ? `${message} Completed stages are saved — resume to continue from the last checkpoint.`
                : message,
            recoverable: recoverable && Boolean(this.resumeKey)
        });

        this.toast.error(message);
    }

    /** @param {any} job */
    handleJobState(job) {
        if (!job) {
            // Nothing active on the server for us.
            if ([STATES.QUEUED, STATES.RUNNING, STATES.PAUSED].includes(this.state)) {
                this.console.append('No active job found on the server.', 'warning');
            }
            return;
        }

        if (job.jobToken) this.jobToken = job.jobToken;
        if (job.resumeKey) this.resumeKey = job.resumeKey;
        if (job.id) {
            this.jobId = job.id;
            this.persistSession();
        }
        if (job.mode) this.mode = job.mode;
        if (job.startedAt) {
            this.startedAt = job.startedAt;
            this.progress.startTimers({ startedAt: job.startedAt });
        }

        this.progress.showActive();
        if (job.stage) this.progress.setStage(job.stage, { label: job.stageLabel, progress: job.progress });
        if (Number.isFinite(job.progress)) this.progress.setProgress(job.progress, { source: 'restore' });
        if (job.logs?.length) this.console.hydrate(job.logs);

        const statusMap = {
            queued: STATES.QUEUED,
            running: STATES.RUNNING,
            paused: STATES.PAUSED,
            completed: STATES.COMPLETED,
            failed: STATES.FAILED,
            cancelled: STATES.CANCELLED
        };
        const mapped = statusMap[job.status];
        if (mapped && mapped !== this.state) {
            if (mapped === STATES.COMPLETED) this.handleCompleted(job);
            else if (mapped === STATES.CANCELLED) this.handleCancelled(job);
            else if (mapped === STATES.FAILED) this.handleError(job);
            else this.transition(mapped);
        }

        if (this.state === STATES.QUEUED || this.state === STATES.RUNNING) {
            this.console.append('Reattached to the running job.', 'info');
        }
    }

    resetToIdle() {
        this.progress.reset();
        this.progress.showIdle();
        this.transition(STATES.IDLE);
    }
}

/* --------------------------------------------------------------------- helpers */

/**
 * @param {Element|null} element
 * @param {boolean} done
 */
function markStep(element, done) {
    if (!element) return;
    element.classList.toggle('is-done', Boolean(done));
}

/**
 * @param {{ label?: string, message?: string, status?: string, detail?: string }} check
 */
function renderCheck(check) {
    const row = document.createElement('div');
    row.className = `preflight-check is-${check.status || 'ok'}`;

    const icon = document.createElement('span');
    icon.className = 'preflight-check-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = { ok: '✓', warning: '!', error: '×', pending: '…' }[check.status || 'ok'] || '✓';

    const text = document.createElement('div');
    text.className = 'preflight-check-text';

    const label = document.createElement('span');
    label.className = 'preflight-check-label';
    label.textContent = check.label || check.message || '';
    text.append(label);

    if (check.detail) {
        const detail = document.createElement('span');
        detail.className = 'preflight-check-detail';
        detail.textContent = check.detail;
        text.append(detail);
    }

    row.append(icon, text);
    return row;
}

/**
 * @param {string} message
 */
function parseLegacyLog(message) {
    const match = /^\[(INFO|SUCCESS|WARN|WARNING|ERROR)\]\s*(.*)$/i.exec(String(message || '').trim());
    if (!match) return null;
    const level = match[1].toUpperCase();
    return {
        severity: level === 'WARN' || level === 'WARNING' ? 'warning'
            : level === 'SUCCESS' ? 'success'
                : level === 'ERROR' ? 'error'
                    : 'info',
        message: match[2]
    };
}

/**
 * @param {string} item
 */
function humanizeItem(item) {
    const map = {
        roles: 'Roles', channels: 'Channels', categories: 'Categories',
        messages: 'Messages', emojis: 'Emojis', stickers: 'Stickers'
    };
    return map[item] || item;
}

/**
 * @param {number|string|undefined} value
 */
function setVerification(element, value) {
    if (!element) return;
    if (value === undefined || value === null) {
        setText(element, '—');
        element.className = 'verification-badge';
        return;
    }
    const ok = value === true || value === 'passed' || value === 'ok' || value === 'verified';
    setText(element, typeof value === 'string' ? humanizeItem(value) : ok ? 'Passed' : 'Failed');
    element.className = `verification-badge ${ok ? 'is-ok' : 'is-bad'}`;
}

/**
 * @param {number} ms
 */
function formatMs(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return '—';
    const total = Math.round(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
