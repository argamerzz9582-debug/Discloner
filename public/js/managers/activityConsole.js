import { byId, setHidden, setText, all, prefersReducedMotion } from '../core/dom.js';
import { formatClock } from '../core/format.js';
import { t } from '../core/i18n.js';

const MAX_ENTRIES = 1000;
const SEVERITIES = ['info', 'success', 'warning', 'error'];

/**
 * ActivityConsole — the log stream.
 *
 * Renders incrementally (append a node per entry) instead of re-rendering the
 * whole list, keeps counts per severity for the filter chips, and distinguishes
 * "nothing happened yet" from "filters hide everything" so the empty state is
 * never misleading.
 */
export class ActivityConsole {
    /** @param {{ announce?: boolean, toast?: any }} [options] */
    constructor(options = {}) {
        this.toast = options.toast || null;
        this.stream = byId('logStream');
        this.emptyState = byId('logEmptyState');
        this.emptyTitle = byId('logEmptyTitle');
        this.emptyDesc = byId('logEmptyDesc');
        this.countPill = byId('logCountPill');
        this.searchInput = byId('logSearchInput');
        this.jumpBtn = byId('jumpLatestBtn');
        this.announcer = byId('logAnnouncer');

        this.autoAnnounce = options.announce !== false;
        /** @type {Array<{ severity: string, message: string, timestamp: number, element?: HTMLElement }>} */
        this.entries = [];
        this.counts = { all: 0, info: 0, success: 0, warning: 0, error: 0 };
        this.filter = 'all';
        this.query = '';
        this.pinnedToBottom = true;
        this.cleared = false;

        this.bind();
        this.renderEmptyState();
    }

    bind() {
        for (const pill of all('.filter-pill')) {
            pill.addEventListener('click', () => {
                const filter = pill.getAttribute('data-filter') || 'all';
                this.setFilter(filter);
            });
        }

        this.searchInput?.addEventListener('input', () => {
            this.query = (this.searchInput?.value || '').trim().toLowerCase();
            this.applyVisibility();
        });

        this.stream?.addEventListener('scroll', () => {
            if (!this.stream) return;
            const distance = this.stream.scrollHeight - this.stream.scrollTop - this.stream.clientHeight;
            this.pinnedToBottom = distance < 48;
            setHidden(this.jumpBtn, this.pinnedToBottom || this.entries.length === 0);
        });

        this.jumpBtn?.addEventListener('click', () => this.scrollToBottom());
    }

    /* ------------------------------------------------------------------ writing */

    /**
     * @param {string} message
     * @param {'info'|'success'|'warning'|'error'} [severity]
     * @param {{ timestamp?: number, silent?: boolean }} [options]
     */
    append(message, severity = 'info', options = {}) {
        const text = String(message ?? '').trim();
        if (!text) return null;

        const normalised = SEVERITIES.includes(severity) ? severity : 'info';
        const timestamp = options.timestamp || Date.now();

        const entry = { severity: normalised, message: text, timestamp };
        this.entries.push(entry);

        // Cap the buffer so a runaway mirror session cannot grow without bound.
        while (this.entries.length > MAX_ENTRIES) {
            const removed = this.entries.shift();
            removed?.element?.remove();
        }

        const element = this.renderEntry(entry);
        entry.element = element;
        this.stream?.append(element);
        this.cleared = false;

        this.counts[normalised] += 1;
        this.counts.all += 1;
        this.updateCounts();
        this.applyVisibilityTo(element, entry);

        if (this.pinnedToBottom) {
            this.scrollToBottom();
        } else {
            setHidden(this.jumpBtn, false);
        }

        this.renderEmptyState();

        if (this.autoAnnounce && this.announcer && (normalised === 'error' || normalised === 'success')) {
            setText(this.announcer, text);
        }

        return element;
    }

    /**
     * @param {{ severity: string, message: string, timestamp: number }} entry
     */
    renderEntry(entry) {
        const row = document.createElement('div');
        row.className = `log-entry log-${entry.severity}`;
        row.dataset.severity = entry.severity;
        row.dataset.search = entry.message.toLowerCase();

        const time = document.createElement('span');
        time.className = 'log-time';
        time.textContent = formatClock(new Date(entry.timestamp));

        const badge = document.createElement('span');
        badge.className = `log-badge log-badge--${entry.severity}`;
        badge.textContent = entry.severity === 'success' ? 'OK' : entry.severity.toUpperCase();

        const text = document.createElement('span');
        text.className = 'log-text';
        text.textContent = entry.message;

        row.append(time, badge, text);
        return row;
    }

    /* ----------------------------------------------------------------- filtering */

    /** @param {string} filter */
    setFilter(filter) {
        this.filter = SEVERITIES.includes(filter) ? filter : 'all';

        for (const pill of all('.filter-pill')) {
            const isActive = pill.getAttribute('data-filter') === this.filter;
            pill.classList.toggle('active', isActive);
            pill.setAttribute('aria-pressed', String(isActive));
        }

        this.applyVisibility();
    }

    applyVisibility() {
        let visible = 0;
        for (const entry of this.entries) {
            if (!entry.element) continue;
            if (this.applyVisibilityTo(entry.element, entry)) visible += 1;
        }
        setText(this.countPill, this.visibleLabel(visible));
        this.renderEmptyState(visible);
    }

    /**
     * @param {HTMLElement} element
     * @param {{ severity: string, message: string }} entry
     */
    applyVisibilityTo(element, entry) {
        const matchesSeverity = this.filter === 'all' || entry.severity === this.filter;
        const matchesQuery = !this.query || entry.message.toLowerCase().includes(this.query);
        const visible = matchesSeverity && matchesQuery;
        element.classList.toggle('is-filtered-out', !visible);
        return visible;
    }

    visibleCount() {
        return this.entries.reduce((total, entry) => {
            const matchesSeverity = this.filter === 'all' || entry.severity === this.filter;
            const matchesQuery = !this.query || entry.message.toLowerCase().includes(this.query);
            return total + (matchesSeverity && matchesQuery ? 1 : 0);
        }, 0);
    }

    /**
     * @param {number} [visible]
     */
    renderEmptyState(visible = this.visibleCount()) {
        if (!this.emptyState) return;

        const hasEntries = this.entries.length > 0;
        const showEmpty = visible === 0;

        setHidden(this.emptyState, !showEmpty);

        if (showEmpty) {
            if (!hasEntries) {
                setText(this.emptyTitle, this.cleared ? 'Log cleared' : t('empty.noActivity'));
                setText(this.emptyDesc, this.cleared
                    ? 'New activity will appear here as it arrives.'
                    : t('empty.noActivityDesc'));
                this.emptyState.dataset.reason = 'empty';
            } else {
                const parts = [];
                if (this.filter !== 'all') parts.push(`the “${this.filter}” filter`);
                if (this.query) parts.push(`the search “${this.query}”`);
                setText(this.emptyTitle, t('empty.noMatch'));
                setText(this.emptyDesc, `No entry matches ${parts.join(' and ') || 'the current filter'}.`);
                this.emptyState.dataset.reason = 'filtered';
            }
        }
    }

    /**
     * @param {number} visible
     */
    visibleLabel(visible) {
        const total = this.counts.all;
        if (total === 0) return '0 entries';
        if (visible === total) return `${total} ${total === 1 ? 'entry' : 'entries'}`;
        return `${visible} of ${total}`;
    }

    updateCounts() {
        for (const key of ['all', ...SEVERITIES]) {
            const node = document.querySelector(`.filter-count[data-count="${key}"]`);
            setText(node, String(this.counts[key] || 0));
        }
        setText(this.countPill, this.visibleLabel(this.visibleCount()));
    }

    scrollToBottom() {
        if (!this.stream) return;
        this.stream.scrollTop = this.stream.scrollHeight;
        this.pinnedToBottom = true;
        setHidden(this.jumpBtn, true);
    }

    clear() {
        this.entries = [];
        this.counts = { all: 0, info: 0, success: 0, warning: 0, error: 0 };
        this.cleared = true;
        if (this.stream) this.stream.innerHTML = '';
        this.updateCounts();
        this.renderEmptyState(0);
        setHidden(this.jumpBtn, true);
    }

    /* ------------------------------------------------------------------ bulk ops */

    async copy() {
        const visible = this.entries.filter((entry) => {
            const matchesSeverity = this.filter === 'all' || entry.severity === this.filter;
            const matchesQuery = !this.query || entry.message.toLowerCase().includes(this.query);
            return matchesSeverity && matchesQuery;
        });

        if (visible.length === 0) {
            return { ok: false, reason: 'empty' };
        }

        const text = visible
            .map((entry) => `[${formatClock(new Date(entry.timestamp))}] ${entry.severity.toUpperCase().padEnd(7)} ${entry.message}`)
            .join('\n');

        try {
            await navigator.clipboard.writeText(text);
            return { ok: true, count: visible.length };
        } catch {
            try {
                const area = document.createElement('textarea');
                area.value = text;
                area.setAttribute('readonly', '');
                area.style.position = 'fixed';
                area.style.opacity = '0';
                document.body.append(area);
                area.select();
                const ok = document.execCommand('copy');
                area.remove();
                return ok ? { ok: true, count: visible.length } : { ok: false, reason: 'denied' };
            } catch {
                return { ok: false, reason: 'denied' };
            }
        }
    }

    /**
     * Restores a persisted log for a job after a page reload.
     * @param {Array<{ level?: string, severity?: string, message: string, timestamp?: number }>} logs
     */
    hydrate(logs = []) {
        for (const log of logs) {
            if (!log || !log.message) continue;
            this.append(log.message, log.severity || log.level || 'info', { timestamp: log.timestamp, silent: true });
        }
    }

    /** Scroll to the newest entry without a smooth scroll when motion is reduced. */
    focusLatest() {
        if (prefersReducedMotion()) {
            this.scrollToBottom();
        } else {
            this.stream?.scrollTo?.({ top: this.stream.scrollHeight, behavior: 'smooth' });
        }
    }
}
