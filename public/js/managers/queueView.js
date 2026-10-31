import { byId, setHidden, setText } from '../core/dom.js';
import { formatWait, formatDuration } from '../core/format.js';
import { t } from '../core/i18n.js';

const STATUS_LABEL = {
    queued: 'Queued',
    running: 'Running',
    paused: 'Paused',
    completed: 'Completed',
    failed: 'Failed',
    cancelled: 'Stopped',
    interrupted: 'Interrupted'
};

/**
 * QueueView renders the multi-job queue: running jobs, waiting jobs with their
 * position and estimated wait, and a short recent-history strip. It is
 * read-only apart from the "cancel all" control, which is delegated back to the
 * controller through `onCancelAll`.
 */
export class QueueView {
    /** @param {{ onCancelJob?: (id: string) => void, onSelectJob?: (id: string) => void, onCancelAll?: () => void }} [options] */
    constructor(options = {}) {
        this.list = byId('queueList');
        this.empty = byId('queueEmpty');
        this.meta = byId('queueMeta');
        this.clearAllBtn = byId('clearQueueBtn');
        this.onCancelJob = options.onCancelJob || (() => {});
        this.onSelectJob = options.onSelectJob || (() => {});
        this.onCancelAll = options.onCancelAll || (() => {});

        this.clearAllBtn?.addEventListener('click', () => this.onCancelAll());
        this.lastSnapshot = { entries: [], running: 0, queued: 0, concurrency: 1 };
    }

    /**
     * @param {{ entries?: any[], running?: number, queued?: number, concurrency?: number, averageDurationMs?: number }} snapshot
     */
    render(snapshot = {}) {
        const entries = Array.isArray(snapshot.entries) ? snapshot.entries : [];
        const running = Number(snapshot.running ?? entries.filter((e) => e.status === 'running').length);
        const queued = Number(snapshot.queued ?? entries.filter((e) => e.status === 'queued').length);
        const concurrency = Number(snapshot.concurrency ?? 1);

        this.lastSnapshot = { entries, running, queued, concurrency };

        if (this.meta) {
            setText(this.meta, entries.length === 0
                ? t('empty.queue')
                : t('queue.meta', { running, queued, limit: concurrency }));
        }

        const hasQueued = entries.some((entry) => entry.status === 'queued');
        setHidden(this.clearAllBtn, !hasQueued);

        if (!this.list) return;
        this.list.innerHTML = '';

        if (entries.length === 0) {
            setHidden(this.empty, false);
            return;
        }
        setHidden(this.empty, true);

        entries.forEach((entry, index) => {
            this.list.append(this.renderRow(entry, index, snapshot));
        });
    }

    /**
     * @param {any} entry
     * @param {number} index
     * @param {any} snapshot
     */
    renderRow(entry, index, snapshot) {
        const item = document.createElement('li');
        item.className = `queue-item status-${entry.status || 'queued'}`;
        item.dataset.jobId = entry.id || '';

        const head = document.createElement('div');
        head.className = 'queue-item-head';

        const status = document.createElement('span');
        status.className = `queue-status status-${entry.status || 'queued'}`;
        status.textContent = STATUS_LABEL[entry.status] || entry.status || 'Queued';

        const title = document.createElement('span');
        title.className = 'queue-item-title';
        title.textContent = entry.mode === 'mirror' ? 'Continuous mirror' : 'One-shot clone';

        head.append(status, title);

        if (entry.status === 'queued' && Number.isFinite(entry.position)) {
            const pos = document.createElement('span');
            pos.className = 'queue-position font-mono';
            pos.textContent = `#${entry.position}`;
            head.append(pos);
        }

        if (entry.status === 'queued') {
            const eta = document.createElement('span');
            eta.className = 'queue-eta font-mono';
            const waitMs = Number(entry.estimatedWaitMs ?? snapshot.averageDurationMs * (entry.position || index + 1));
            eta.textContent = `≈ ${formatWait(waitMs)}`;
            head.append(eta);
        }

        if (entry.status === 'running' && Number.isFinite(entry.progress)) {
            const pct = document.createElement('span');
            pct.className = 'queue-progress font-mono';
            pct.textContent = `${Math.round(entry.progress)}%`;
            head.append(pct);
        }

        item.append(head);

        const meta = document.createElement('div');
        meta.className = 'queue-item-meta font-mono';
        const bits = [];
        if (entry.sourceId && entry.targetId) bits.push(`${short(entry.sourceId)} → ${short(entry.targetId)}`);
        if (entry.priority && entry.priority !== 'normal') bits.push(entry.priority.toUpperCase());
        if (entry.startedAt && entry.status !== 'queued') {
            const end = entry.finishedAt || Date.now();
            bits.push(formatDuration(end - entry.startedAt));
        }
        meta.textContent = bits.join(' · ');
        if (bits.length) item.append(meta);

        if (entry.status === 'queued' || entry.status === 'running' || entry.status === 'paused') {
            const actions = document.createElement('div');
            actions.className = 'queue-item-actions';

            const view = document.createElement('button');
            view.type = 'button';
            view.className = 'queue-action-btn';
            view.textContent = 'View';
            view.addEventListener('click', () => this.onSelectJob(entry.id));
            actions.append(view);

            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = 'queue-action-btn danger';
            cancel.textContent = entry.status === 'queued' ? 'Remove' : 'Stop';
            cancel.addEventListener('click', () => this.onCancelJob(entry.id));
            actions.append(cancel);

            item.append(actions);
        }

        return item;
    }

    clear() {
        this.render({ entries: [], running: 0, queued: 0, concurrency: this.lastSnapshot.concurrency });
    }
}

/** @param {string} id */
function short(id) {
    const value = String(id || '');
    return value.length > 8 ? `…${value.slice(-6)}` : value;
}
