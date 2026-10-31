/**
 * Application entry point.
 *
 * Boot order matters: theme first (no flash), then services, then the managers
 * that own DOM, then the controller that wires them together. Every module is
 * an ES module, so this file runs after the DOM has been parsed.
 */
import { byId, setHidden, setText, all } from './core/dom.js';
import { t } from './core/i18n.js';
import { ThemeManager } from './managers/themeManager.js';
import { TokenManager } from './managers/tokenManager.js';
import { ServerSelector } from './managers/serverSelector.js';
import { ConfigPanel } from './managers/configPanel.js';
import { ProgressTracker } from './managers/progressTracker.js';
import { ActivityConsole } from './managers/activityConsole.js';
import { JobController } from './managers/jobController.js';
import { QueueView } from './managers/queueView.js';
import { ToastManager } from './ui/toast.js';
import { Tour } from './ui/tour.js';
import { JobClient } from './services/jobClient.js';
import { api } from './services/api.js';

/**
 * @param {{ socketFactory?: () => any }} [options]
 * @returns {{ controller: JobController, client: JobClient, console: ActivityConsole, toast: ToastManager, tour: Tour, theme: ThemeManager }}
 */
export function boot(options = {}) {
    const theme = new ThemeManager();
    const toast = new ToastManager();

    const client = new JobClient({ socketFactory: options.socketFactory }).connect();

    const progress = new ProgressTracker();
    const activityConsole = new ActivityConsole({ toast });

    /** @type {JobController | null} */
    let controller = null;

    const tokenManager = new TokenManager({
        onChange: () => controller?.render()
    });

    const serverSelector = new ServerSelector({
        onChange: () => controller?.render()
    });

    const configPanel = new ConfigPanel({
        toast,
        onDirty: ({ mode }) => {
            if (mode && controller) controller.mode = mode;
            controller?.render();
        }
    });

    const queueView = new QueueView({
        onCancelJob: (id) => {
            client.cancel({ jobId: id, jobToken: controller?.jobId === id ? controller.jobToken : null });
            toast.info('Cancel requested.');
        },
        onSelectJob: (id) => {
            client.subscribeJob(id);
            byId('progressCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
        onCancelAll: () => {
            for (const entry of queueView.lastSnapshot.entries) {
                if (entry.status === 'queued') client.cancel({ jobId: entry.id });
            }
            toast.info('Queued jobs cancelled.');
        }
    });

    controller = new JobController({
        client,
        tokenManager,
        serverSelector,
        configPanel,
        progress,
        console: activityConsole,
        toast,
        onStateChange: (state) => {
            document.body.dataset.jobState = state;
        }
    });

    bindTransportStatus(client, controller, activityConsole);
    client.on('queue', (snapshot) => queueView.render(snapshot));
    client.on('jobs:list', (jobs) => {
        if (Array.isArray(jobs) && jobs.length > 0) queueView.render({ entries: jobs });
    });
    bindConsoleActions(activityConsole);
    bindModals();
    bindPageInteractions();

    const tour = new Tour();
    byId('navTourBtn')?.addEventListener('click', () => tour.start());

    // Expose for the guided-tour button and for the E2E/test harnesses.
    window.Discloner = { controller, client, console: activityConsole, toast, tour, theme };
    window.DisclonerTour = tour;
    window.DisclonerConsole = activityConsole;

    loadFeatures();
    refreshQueue(queueView);

    return { controller, client, console: activityConsole, toast, tour, theme };
}

/* ------------------------------------------------------------- transport ui */

/**
 * @param {JobClient} client
 * @param {JobController} controller
 * @param {ActivityConsole} activityConsole
 */
function bindTransportStatus(client, controller, activityConsole) {
    const pill = byId('connStatus');
    const label = byId('connStatusText');

    client.on('connect', () => {
        setText(label, t('state.connected'));
        pill?.classList.remove('is-offline');
        pill?.classList.add('is-online');
    });

    client.on('disconnect', () => {
        setText(label, t('state.offline'));
        pill?.classList.add('is-offline');
        pill?.classList.remove('is-online');
        if (controller.isActive()) {
            activityConsole.append('Connection to the server lost. Reconnecting…', 'warning');
        }
    });
}

/**
 * @param {ActivityConsole} activityConsole
 */
function bindConsoleActions(activityConsole) {
    byId('copyLogsBtn')?.addEventListener('click', async () => {
        const result = await activityConsole.copy();
        if (result.ok) activityConsole.toast?.success(t('toast.copied'));
        else if (result.reason === 'empty') activityConsole.toast?.info(t('toast.nothingToCopy'));
        else activityConsole.toast?.error(t('toast.copyFailed'));
    });

    byId('clearLogsBtn')?.addEventListener('click', () => {
        activityConsole.clear();
    });
}

/* ------------------------------------------------------------------- modals */

function bindModals() {
    const openers = [
        ['navGuidesBtn', 'helpModal'],
        ['navTemplatesBtn', 'templatesModal'],
        ['navSupportBtn', 'supportModal']
    ];

    for (const [buttonId, modalId] of openers) {
        byId(buttonId)?.addEventListener('click', () => openModal(modalId));
    }

    const closers = [
        ['closeHelpBtn', 'helpModal'],
        ['dismissHelpBtn', 'helpModal'],
        ['closeTemplatesBtn', 'templatesModal'],
        ['dismissTemplatesBtn', 'templatesModal'],
        ['closeSupportBtn', 'supportModal'],
        ['dismissSupportBtn', 'supportModal']
    ];

    for (const [buttonId, modalId] of closers) {
        byId(buttonId)?.addEventListener('click', () => closeModal(modalId));
    }

    // Backdrop click closes; clicks inside the card do not.
    for (const backdrop of all('.modal-backdrop')) {
        backdrop.addEventListener('click', (event) => {
            if (event.target === backdrop) backdrop.classList.add('hidden');
        });
    }

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Tab') return;
        const open = all('.modal-backdrop').find((element) => !element.classList.contains('hidden'));
        if (!open) return;

        const focusable = all(
            'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
            open
        ).filter((element) => element instanceof HTMLElement && element.offsetParent !== null);

        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });
}

/** @param {string} modalId */
export function openModal(modalId) {
    const modal = byId(modalId);
    if (!modal) return;
    setHidden(modal, false);
    const focusTarget = modal.querySelector('button:not([disabled]), [href], input');
    if (focusTarget instanceof HTMLElement) focusTarget.focus();
}

/** @param {string} modalId */
export function closeModal(modalId) {
    setHidden(byId(modalId), true);
}

/* ------------------------------------------------------------------ page fx */

function bindPageInteractions() {
    byId('navHome')?.addEventListener('click', (event) => {
        event.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Shrink the hero after scrolling so the CTA stays reachable.
    let ticking = false;
    window.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(() => {
            document.body.classList.toggle('is-scrolled', window.scrollY > 24);
            ticking = false;
        });
    }, { passive: true });
}

/* -------------------------------------------------------------- async loads */

async function loadFeatures() {
    try {
        const payload = await api.features();
        const features = Array.isArray(payload?.features) ? payload.features : [];
        const mirror = features.find((feature) => feature.name === 'continuousMirror');
        const resumable = features.find((feature) => feature.name === 'resumableJobs');
        const queue = features.find((feature) => feature.name === 'multiJobQueue');

        if (mirror && !mirror.enabled) {
            const option = byId('mirrorModeOption');
            if (option) {
                option.classList.add('is-disabled');
                const input = option.querySelector('input');
                if (input) input.disabled = true;
                option.setAttribute('title', 'Continuous mirror is disabled on this server.');
            }
        }

        if (resumable && !resumable.enabled) setHidden(byId('resumeJobBtn'), true);
        if (queue && !queue.enabled) setHidden(byId('queueCard'), true);

        document.body.dataset.features = features.filter((f) => f.enabled).map((f) => f.name).join(',');
    } catch {
        // A feature probe failure must never block the dashboard.
    }
}

/**
 * @param {QueueView} queueView
 */
async function refreshQueue(queueView) {
    try {
        const payload = await api.queue();
        // REST wraps the snapshot as `{ success, queue }`; the socket emits it bare.
        queueView.render(payload?.queue || payload);
    } catch {
        // The socket will push queue state shortly; a REST miss is non-fatal.
    }
}

/* ------------------------------------------------------------------ start-up */

// Test harnesses can import this module without starting the app.
if (typeof document !== 'undefined' && !globalThis.__DISCLONER_NO_AUTOBOOT) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => boot(), { once: true });
    } else {
        boot();
    }
}
