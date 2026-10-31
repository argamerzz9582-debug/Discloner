import { byId, setHidden, setText, restartAnimation, prefersReducedMotion, all } from '../core/dom.js';
import { formatDuration, stageToPhase, PHASE_ORDER } from '../core/format.js';

const STAGE_LABELS = {
    initializing: 'Initialising',
    authenticating: 'Authenticating',
    validating_servers: 'Validating servers',
    reading_source: 'Reading source',
    cleaning_target: 'Cleaning target',
    cloning_profile: 'Cloning profile',
    cloning_emojis: 'Cloning emojis',
    cloning_stickers: 'Cloning stickers',
    cloning_roles: 'Cloning roles',
    cloning_categories: 'Cloning categories',
    cloning_channels: 'Cloning channels',
    applying_permissions: 'Applying permissions',
    cloning_webhooks: 'Cloning webhooks',
    cloning_messages: 'Replaying messages',
    mirroring: 'Mirroring live',
    verifying: 'Verifying',
    completed: 'Completed'
};

/**
 * ProgressTracker renders the live job panel: stage pill, phase pipeline,
 * percentage bar, counters and the ETA. All DOM writes are guarded so the same
 * instance works in jsdom test harnesses.
 */
export class ProgressTracker {
    constructor() {
        this.emptyState = byId('telemetryEmptyState');
        this.activeView = byId('telemetryActiveView');

        this.stagePill = byId('stagePill');
        this.stageDot = byId('stageDot');
        this.stageLabel = byId('stageLabel');

        this.progressTrack = byId('progressTrack');
        this.progressBar = byId('progressBar');
        this.progressText = byId('progressText');
        this.progressCounts = byId('progressCounts');
        this.progressDetail = byId('progressItemDetail');

        this.etaTimer = byId('etaTimer');
        this.etaPill = byId('etaPill');
        this.elapsedTimer = byId('elapsedTimer');

        this.pipeline = byId('stagePipeline');
        this.recoveryPanel = byId('recoveryPanel');
        this.recoveryTitle = byId('recoveryTitle');
        this.recoveryDesc = byId('recoveryDesc');
        this.recoveryIcon = byId('recoveryIcon');

        this.stats = {
            roles: byId('liveStatRoles'),
            channels: byId('liveStatChannels'),
            messages: byId('liveStatMessages'),
            warnings: byId('liveStatWarnings')
        };

        this.startedAt = 0;
        this.elapsedTimerId = 0;
        this.percent = 0;
        this.stage = 'initializing';
        this.counters = { roles: 0, channels: 0, messages: 0, warnings: 0 };
    }

    /* --------------------------------------------------------------- visibility */

    showIdle() {
        setHidden(this.emptyState, false);
        setHidden(this.activeView, true);
        this.stopTimers();
    }

    showActive() {
        setHidden(this.emptyState, true);
        setHidden(this.activeView, false);
    }

    /**
     * @param {{ startedAt?: number }} [options]
     */
    startTimers(options = {}) {
        this.startedAt = options.startedAt || Date.now();
        this.stopTimers();
        this.tickElapsed();
        this.elapsedTimerId = window.setInterval(() => this.tickElapsed(), 1000);
    }

    stopTimers() {
        if (this.elapsedTimerId) {
            window.clearInterval(this.elapsedTimerId);
            this.elapsedTimerId = 0;
        }
    }

    tickElapsed() {
        if (!this.startedAt) return;
        setText(this.elapsedTimer, formatDuration(Date.now() - this.startedAt));
    }

    reset() {
        this.percent = 0;
        this.stage = 'initializing';
        this.counters = { roles: 0, channels: 0, messages: 0, warnings: 0 };
        this.renderCounters();
        this.setProgress(0, { immediate: true, text: '0%', detail: 'Preparing…', counts: '' });
        this.setStage('initializing');
        this.hideRecovery();
        this.stopTimers();
        setText(this.elapsedTimer, '00:00');
        setText(this.etaTimer, '—');
    }

    /* -------------------------------------------------------------------- stage */

    /**
     * @param {string} stage
     * @param {{ label?: string, progress?: number }} [payload]
     */
    setStage(stage, payload = {}) {
        if (!stage) return;
        this.stage = stage;

        const label = payload.label || STAGE_LABELS[stage] || humanize(stage);
        setText(this.stageLabel, label);

        if (this.stagePill) {
            this.stagePill.className = `stage-pill-raised stage--${stage}`;
            this.stagePill.dataset.stage = stage;
        }

        const phase = stageToPhase(stage);
        this.updatePipeline(phase, stage);

        if (stage === 'completed') {
            this.stageDot?.classList.add('is-done');
            this.setProgress(100, { immediate: true, text: '100%', detail: 'All stages completed' });
            setText(this.etaTimer, '—');
        } else {
            this.stageDot?.classList.remove('is-done');
        }

        if (Number.isFinite(payload.progress)) {
            this.setProgress(payload.progress, { source: 'server' });
        }
    }

    /**
     * @param {string} phase
     * @param {string} stage
     */
    updatePipeline(phase, stage) {
        if (!this.pipeline) return;
        const activeIndex = PHASE_ORDER.indexOf(phase);
        for (const step of all('.pipeline-step', this.pipeline)) {
            const key = step.getAttribute('data-phase');
            const index = PHASE_ORDER.indexOf(key || '');
            const done = stage === 'completed' || index < activeIndex;
            const active = index === activeIndex && stage !== 'completed';
            step.classList.toggle('is-done', done);
            step.classList.toggle('is-active', active);
            step.setAttribute('aria-current', active ? 'step' : 'false');
        }
    }

    /* ----------------------------------------------------------------- progress */

    /**
     * @param {number} percent
     * @param {{ immediate?: boolean, text?: string, detail?: string, counts?: string, source?: string }} [options]
     */
    setProgress(percent, options = {}) {
        const clamped = Math.max(0, Math.min(100, Number(percent) || 0));

        // Progress must be monotonic per job: ignore small backwards updates
        // caused by out-of-order socket frames.
        if (!options.immediate && clamped < this.percent - 0.5) return;
        this.percent = clamped;

        if (this.progressBar) {
            this.progressBar.style.width = `${clamped}%`;
            this.progressBar.classList.toggle('is-indeterminate', clamped <= 0 && !options.immediate);
            if (!prefersReducedMotion() && clamped > 0) restartAnimation(this.progressBar, 'progress-sheen');
        }

        if (this.progressTrack) {
            this.progressTrack.setAttribute('aria-valuenow', String(Math.round(clamped)));
            this.progressTrack.setAttribute('aria-valuetext', `${Math.round(clamped)} percent complete`);
        }

        setText(this.progressText, options.text ?? `${Math.round(clamped)}%`);
        if (options.detail !== undefined) setText(this.progressDetail, options.detail);
        if (options.counts !== undefined) setText(this.progressCounts, options.counts);

        setText(this.etaTimer, this.estimateEta(clamped));
    }

    /**
     * @param {number} percent
     */
    estimateEta(percent) {
        if (!this.startedAt || percent <= 1 || percent >= 100) return percent >= 100 ? 'Done' : '—';
        const elapsed = Date.now() - this.startedAt;
        const remaining = (elapsed / percent) * (100 - percent);
        return formatDuration(remaining);
    }

    /* ------------------------------------------------------------------- counts */

    /**
     * @param {Record<string, number>} counts
     * @param {{ absolute?: boolean }} [options]
     */
    updateCounters(counts = {}, options = {}) {
        for (const key of Object.keys(this.stats)) {
            if (!(key in counts)) continue;
            const value = Number(counts[key]);
            if (!Number.isFinite(value)) continue;
            const next = options.absolute ? value : Math.max(this.counters[key] || 0, value);
            if (next !== this.counters[key]) {
                this.counters[key] = next;
                if (!prefersReducedMotion()) restartAnimation(this.stats[key], 'counter-bump');
            }
        }
        this.renderCounters();
    }

    /**
     * @param {number} counts
     */
    setCountsText(completed, total, unit = 'items') {
        if (!Number.isFinite(completed) || !Number.isFinite(total) || total <= 0) {
            setText(this.progressCounts, '');
            return;
        }
        setText(this.progressCounts, `${completed} / ${total} ${unit}`);
    }

    renderCounters() {
        setText(this.stats.roles, String(this.counters.roles));
        setText(this.stats.channels, String(this.counters.channels));
        setText(this.stats.messages, String(this.counters.messages));
        setText(this.stats.warnings, String(this.counters.warnings));
    }

    /* --------------------------------------------------------------- mirror mode */

    /**
     * @param {{ messagesForwarded?: number, structureEvents?: number, eventsDropped?: number }} stats
     */
    updateMirrorStats(stats = {}) {
        if (Number.isFinite(stats.messagesForwarded)) {
            this.updateCounters({ messages: stats.messagesForwarded }, { absolute: true });
        }
        if (Number.isFinite(stats.structureEvents)) {
            this.updateCounters({ channels: stats.structureEvents }, { absolute: true });
        }
        if (Number.isFinite(stats.eventsDropped)) {
            this.updateCounters({ warnings: stats.eventsDropped }, { absolute: true });
        }
        this.setStage('mirroring', { label: 'Mirroring live' });
    }

    /* ----------------------------------------------------------------- recovery */

    /**
     * @param {{ title?: string, message?: string, recoverable?: boolean }} detail
     */
    showRecovery(detail = {}) {
        if (!this.recoveryPanel) return;
        setHidden(this.recoveryPanel, false);
        setText(this.recoveryTitle, detail.title || 'Job needs attention');
        setText(this.recoveryDesc, detail.message || '');
        this.recoveryPanel.dataset.recoverable = detail.recoverable ? 'true' : 'false';
        if (this.recoveryIcon) setText(this.recoveryIcon, detail.recoverable ? '↻' : '!');
        this.recoveryPanel.classList.toggle('is-recoverable', Boolean(detail.recoverable));
        setHidden(byId('resumeJobBtn'), !detail.recoverable);
    }

    hideRecovery() {
        setHidden(this.recoveryPanel, true);
    }

    /** @param {string} stageId */
    static labelFor(stageId) {
        return STAGE_LABELS[stageId] || humanize(stageId);
    }
}

/**
 * @param {string} value
 */
function humanize(value) {
    return String(value || '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}
