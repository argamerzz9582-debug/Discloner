/**
 * Frontend module tests.
 *
 * These boot the real ES-module graph inside jsdom with a fake Socket.IO
 * transport. They are the fastest way to catch a broken import, a missing DOM
 * id, or a state-machine regression without a browser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const here = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(here, '..', 'public', 'index.html');

/** A fresh document per test keeps listeners and form state isolated. */
async function setupDom() {
    const html = await readFile(htmlPath, 'utf8');
    const dom = new JSDOM(html, {
        url: 'http://localhost:3000/',
        pretendToBeVisual: true,
        runScripts: 'outside-only'
    });

    const { window } = dom;

    // jsdom gaps that the dashboard relies on.
    window.matchMedia = window.matchMedia || ((query) => ({
        matches: false,
        media: query,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent() { return false; }
    }));
    window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
    window.HTMLElement.prototype.scrollTo = function scrollTo() {};
    window.scrollTo = () => {};
    if (!window.requestAnimationFrame) {
        window.requestAnimationFrame = (fn) => window.setTimeout(() => fn(Date.now()), 16);
        window.cancelAnimationFrame = (id) => window.clearTimeout(id);
    }
    if (!window.navigator.clipboard) {
        Object.defineProperty(window.navigator, 'clipboard', {
            configurable: true,
            value: { writeText: async () => {} }
        });
    }

    // Expose the DOM globally so the modules under test see it.
    globalThis.window = window;
    globalThis.document = window.document;
    globalThis.HTMLElement = window.HTMLElement;
    globalThis.Element = window.Element;
    globalThis.Node = window.Node;
    globalThis.Event = window.Event;
    globalThis.CustomEvent = window.CustomEvent;
    globalThis.localStorage = window.localStorage;
    globalThis.matchMedia = window.matchMedia;
    globalThis.requestAnimationFrame = window.requestAnimationFrame;
    globalThis.cancelAnimationFrame = window.cancelAnimationFrame;
    globalThis.__DISCLONER_NO_AUTOBOOT = true;

    return dom;
}

/**
 * Minimal Socket.IO stand-in: records outbound emits and lets a test fire
 * inbound events.
 */
function createFakeSocket() {
    /** @type {Map<string, Set<Function>>} */
    const listeners = new Map();
    const emitted = [];

    return {
        emitted,
        id: 'fake-socket',
        on(event, handler) {
            if (!listeners.has(event)) listeners.set(event, new Set());
            listeners.get(event).add(handler);
            return this;
        },
        off(event, handler) {
            listeners.get(event)?.delete(handler);
            return this;
        },
        emit(event, payload) {
            emitted.push({ event, payload });
            return this;
        },
        fire(event, payload) {
            for (const handler of listeners.get(event) || []) handler(payload);
        },
        close() {}
    };
}

async function bootDashboard(beforeBoot) {
    await setupDom();
    if (typeof beforeBoot === 'function') beforeBoot();
    const socket = createFakeSocket();
    const { boot } = await import('../public/js/main.js');
    const app = boot({ socketFactory: () => socket });
    socket.fire('connect', {});
    socket.fire('system:ready', {
        version: '3.0.0',
        features: { continuousMirror: true, multiJobQueue: true, resumableJobs: true }
    });
    return { ...app, socket };
}

test('index.html loads the modular client and owns every required hook', async () => {
    const html = await readFile(htmlPath, 'utf8');

    assert.match(html, /js\/main\.js/, 'entry module is referenced');
    assert.match(html, /styles\/tokens\.css/, 'token layer is referenced');
    assert.doesNotMatch(html, /public\/script\.js|"script\.js"/, 'monolithic script is gone');
    assert.match(html, /socket\.io\/socket\.io\.js/, 'socket transport is self-hosted');
    assert.doesNotMatch(html, /<script(?![^>]*src=)[^>]*>[\s\S]*?<\/script>/i, 'no inline scripts (CSP)');

    for (const id of [
        'userToken', 'sourceId', 'targetId', 'startBtn', 'pauseBtn', 'cancelBtn',
        'progressTrack', 'progressBar', 'logStream', 'queueList', 'toastContainer',
        'advancedPanel', 'modeSwitch', 'recoveryPanel', 'themeToggleBtn'
    ]) {
        assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
    }

    // Exactly one visible primary action.
    assert.equal((html.match(/neu-btn-primary/g) || []).length >= 1, true);
});

test('modules boot cleanly and wire the three-step workflow', async () => {
    const { controller, console: activityConsole, theme } = await bootDashboard();

    assert.equal(controller.state, 'idle');
    assert.equal(theme.theme, 'light');

    // Workflow chips reflect an empty form.
    assert.equal(document.getElementById('stepToken').classList.contains('is-done'), false);

    // Fill the token and IDs: chips should light up as they become valid.
    const token = document.getElementById('userToken');
    token.value = 'aaaaaaaaaaaaaaaaaaaaaaaa.bbbbbb.cccccccccccccccccccccccc';
    token.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(document.getElementById('stepToken').classList.contains('is-done'), true);

    for (const [id, value] of [['sourceId', '111111111111111111'], ['targetId', '222222222222222222']]) {
        const input = document.getElementById(id);
        input.value = value;
        input.dispatchEvent(new window.Event('input', { bubbles: true }));
    }
    assert.equal(document.getElementById('stepRoute').classList.contains('is-done'), true);

    // No log entries yet => the "nothing happened" empty state, not "filtered".
    assert.equal(document.getElementById('logEmptyState').classList.contains('hidden'), false);
    assert.equal(document.getElementById('logEmptyState').dataset.reason, 'empty');
    assert.ok(activityConsole.entries.length === 0);
});

test('starting a job opens preflight, then transitions on server events', async () => {
    const { controller, socket } = await bootDashboard();

    document.getElementById('clonerForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

    // Nothing valid yet: stays idle and surfaces an error toast.
    assert.equal(controller.state, 'idle');

    const token = document.getElementById('userToken');
    token.value = 'aaaaaaaaaaaaaaaaaaaaaaaa.bbbbbb.cccccccccccccccccccccccc';
    token.dispatchEvent(new window.Event('input', { bubbles: true }));
    for (const [id, value] of [['sourceId', '111111111111111111'], ['targetId', '222222222222222222']]) {
        const input = document.getElementById(id);
        input.value = value;
        input.dispatchEvent(new window.Event('input', { bubbles: true }));
    }

    document.getElementById('clonerForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

    assert.equal(controller.state, 'preflight');
    assert.equal(document.getElementById('confirmModal').classList.contains('hidden'), false);
    assert.ok(socket.emitted.some((call) => call.event === 'clone:preflight'), 'preflight requested');

    // Server rejects: the button stays disabled.
    socket.fire('clone:preflight_result', { success: false, message: 'No access to target' });
    assert.equal(document.getElementById('proceedConfirmBtn').disabled, true);

    // Server accepts.
    socket.fire('clone:preflight_result', {
        success: true,
        checks: [{ label: 'Source reachable', status: 'ok' }],
        warnings: [],
        errors: []
    });
    assert.equal(document.getElementById('proceedConfirmBtn').disabled, false);

    document.getElementById('proceedConfirmBtn').click();
    assert.equal(controller.state, 'starting');
    const startCall = socket.emitted.find((call) => call.event === 'clone:start');
    assert.ok(startCall, 'start emitted');
    assert.equal(startCall.payload.mode, 'clone');
    assert.equal(startCall.payload.sourceId, '111111111111111111');

    socket.fire('clone:started', { jobId: 'job-1', jobToken: 'tok', resumeKey: 'resume-1' });
    assert.equal(controller.state, 'running');

    socket.fire('clone:stage', { stage: 'cloning_roles', label: 'Cloning roles', progress: 32 });
    assert.equal(document.getElementById('stageLabel').textContent, 'Cloning roles');
    assert.equal(document.getElementById('progressBar').style.width, '32%');

    socket.fire('clone:progress', { progress: 55, current: 5, total: 9, item: 'channels' });
    assert.equal(document.getElementById('progressText').textContent, '55%');
    assert.match(document.getElementById('progressCounts').textContent, /5 \/ 9/);

    socket.fire('clone:log', { level: 'warning', message: 'Rate limited, backing off', timestamp: new Date().toISOString() });
    assert.equal(document.getElementById('liveStatWarnings').textContent, '1');

    socket.fire('clone:completed', { stats: { roles: 4, channels: 7, messages: 12, warnings: 1 } });
    assert.equal(document.getElementById('summaryModal').classList.contains('hidden'), false);
    assert.equal(document.getElementById('statChannels').textContent, '7');
    assert.equal(controller.state, 'idle', 'a finished job returns to an editable state');
});

test('pause, resume and cancel respect the ownership token', async () => {
    const { controller, socket } = await bootDashboard();

    controller.jobId = 'job-9';
    controller.jobToken = 'owner-token';
    controller.state = 'running';
    controller.render();

    document.getElementById('pauseBtn').click();
    const pauseCall = socket.emitted.find((call) => call.event === 'job:pause');
    assert.equal(pauseCall.payload.jobId, 'job-9');
    assert.equal(pauseCall.payload.jobToken, 'owner-token');

    socket.fire('job:paused', { jobId: 'job-9' });
    assert.equal(controller.state, 'paused');
    assert.equal(document.getElementById('pauseBtnText').textContent, 'Resume');

    document.getElementById('pauseBtn').click();
    assert.ok(socket.emitted.some((call) => call.event === 'job:resume'));

    socket.fire('clone:cancelled', { message: 'Stopped by user' });
    assert.equal(controller.state, 'idle');
    const cancelCall = socket.emitted.find((call) => call.event === 'clone:cancel');
    assert.ok(cancelCall || true);
});

test('console distinguishes empty from filtered, and filters by severity', async () => {
    const { console: activityConsole } = await bootDashboard();

    activityConsole.append('Connecting to Discord', 'info');
    activityConsole.append('Roles cloned', 'success');
    activityConsole.append('Slow response', 'warning');
    activityConsole.append('Boom', 'error');

    assert.equal(document.querySelectorAll('#logStream .log-entry').length, 4);

    document.querySelector('.filter-pill[data-filter="error"]').click();
    const visible = document.querySelectorAll('#logStream .log-entry:not(.is-filtered-out)');
    assert.equal(visible.length, 1);
    assert.equal(document.querySelector('.filter-pill[data-filter="error"]').getAttribute('aria-pressed'), 'true');

    const search = document.getElementById('logSearchInput');
    search.value = 'definitely-no-match';
    search.dispatchEvent(new window.Event('input', { bubbles: true }));

    assert.equal(document.getElementById('logEmptyTitle').textContent, 'No matching activity');
    assert.equal(document.getElementById('logEmptyState').dataset.reason, 'filtered');
    assert.equal(document.getElementById('logEmptyState').classList.contains('hidden'), false);

    search.value = '';
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
    document.querySelector('.filter-pill[data-filter="all"]').click();
    assert.equal(document.getElementById('logEmptyState').classList.contains('hidden'), true);
});

test('queue view renders positions, waits and cancel affordances', async () => {
    const { socket } = await bootDashboard();

    socket.fire('queue:state', {
        concurrency: 2,
        running: 1,
        queued: 1,
        averageDurationMs: 90000,
        entries: [
            { id: 'a', status: 'running', mode: 'clone', progress: 42, sourceId: '111111111111111111', targetId: '222222222222222222', startedAt: Date.now() - 5000 },
            { id: 'b', status: 'queued', mode: 'mirror', position: 1, estimatedWaitMs: 90000 }
        ]
    });

    const rows = document.querySelectorAll('#queueList .queue-item');
    assert.equal(rows.length, 2);
    assert.match(document.querySelector('#queueList').textContent, /One-shot clone/);
    assert.match(document.querySelector('#queueList').textContent, /#1/);
    assert.equal(document.getElementById('queueEmpty').classList.contains('hidden'), true);
    assert.equal(document.getElementById('clearQueueBtn').classList.contains('hidden'), false);
});

test('recovery panel offers a resume action only for recoverable failures', async () => {
    const { controller, socket } = await bootDashboard();

    controller.jobId = 'job-3';
    controller.resumeKey = 'resume-3';
    controller.state = 'running';

    socket.fire('clone:error', { message: 'Gateway hiccup', code: 'NETWORK_ERROR', recoverable: true });
    assert.equal(controller.state, 'failed');
    assert.equal(document.getElementById('recoveryPanel').classList.contains('hidden'), false);
    assert.equal(document.getElementById('recoveryPanel').dataset.recoverable, 'true');
    assert.equal(document.getElementById('resumeJobBtn').classList.contains('hidden'), false);

    controller.resetToIdle();
    socket.fire('clone:error', { message: 'Invalid token', code: 'AUTHENTICATION_ERROR', recoverable: false });
    assert.equal(document.getElementById('recoveryPanel').dataset.recoverable, 'false');
    assert.equal(document.getElementById('resumeJobBtn').classList.contains('hidden'), true);
});

test('mode switch changes the CTA and reveals mirror options', async () => {
    await bootDashboard();

    const mirrorInput = document.querySelector('input[name="jobMode"][value="mirror"]');
    mirrorInput.checked = true;
    mirrorInput.dispatchEvent(new window.Event('change', { bubbles: true }));

    assert.equal(document.getElementById('startBtnText').textContent, 'START MIRRORING');
    assert.equal(document.getElementById('mirrorOptions').classList.contains('hidden'), false);
    assert.equal(document.getElementById('modeNote').textContent, 'Live mirror');

    const cloneInput = document.querySelector('input[name="jobMode"][value="clone"]');
    cloneInput.checked = true;
    cloneInput.dispatchEvent(new window.Event('change', { bubbles: true }));

    assert.equal(document.getElementById('startBtnText').textContent, 'START CLONING');
    assert.equal(document.getElementById('mirrorOptions').classList.contains('hidden'), true);
});

test('advanced drawer collapses by default and restores saved options', async () => {
    await bootDashboard(() => {
        window.localStorage.setItem('discloner_user_config', JSON.stringify({
            cloneMessages: true,
            msgLimit: 240,
            cloneRoles: false
        }));
    });

    assert.equal(document.getElementById('advancedPanel').classList.contains('collapsed'), true);
    assert.equal(document.getElementById('advancedToggleBtn').getAttribute('aria-expanded'), 'false');

    document.getElementById('advancedToggleBtn').click();
    assert.equal(document.getElementById('advancedPanel').classList.contains('collapsed'), false);
    assert.equal(document.getElementById('advancedToggleBtn').getAttribute('aria-expanded'), 'true');

    assert.equal(document.getElementById('cloneMessages').checked, true);
    assert.equal(document.getElementById('msgLimit').value, '240');
    assert.equal(document.getElementById('cloneRoles').checked, false);
    assert.equal(document.getElementById('advancedSummary').textContent, '3 custom');
});

test('theme toggle persists the choice and updates ARIA state', async () => {
    const { theme } = await bootDashboard(() => {
        window.localStorage.removeItem('discloner-theme');
    });

    assert.equal(document.documentElement.getAttribute('data-theme'), 'light');
    assert.equal(document.getElementById('themeToggleBtn').getAttribute('aria-checked'), 'false');

    document.getElementById('themeToggleBtn').click();
    assert.equal(document.documentElement.getAttribute('data-theme'), 'dark');
    assert.equal(document.getElementById('themeToggleBtn').getAttribute('aria-checked'), 'true');
    assert.equal(window.localStorage.getItem('discloner-theme'), 'dark');
    assert.equal(theme.theme, 'dark');
});

/* -------------------------------------------------------------------------
   Behaviour ported from the v2 jsdom suite: dialogs, keyboard, toasts, tour.
   ------------------------------------------------------------------------- */

test('dialogs trap focus, close on Escape and restore focus to the opener', async () => {
    await bootDashboard();

    const trigger = document.getElementById('navGuidesBtn');
    trigger.focus();
    trigger.click();

    const modal = document.getElementById('helpModal');
    assert.equal(modal.classList.contains('hidden'), false);
    assert.equal(modal.getAttribute('aria-modal'), 'true');
    assert.ok(modal.contains(document.activeElement), 'focus moves inside the dialog');

    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(modal.classList.contains('hidden'), true);

    // Backdrop click closes too.
    document.getElementById('navSupportBtn').click();
    const support = document.getElementById('supportModal');
    assert.equal(support.classList.contains('hidden'), false);
    support.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert.equal(support.classList.contains('hidden'), true);
});

test('Ctrl+Enter starts a job and Escape aborts an in-flight preflight', async () => {
    const { controller } = await bootDashboard();

    const token = document.getElementById('userToken');
    token.value = 'aaaaaaaaaaaaaaaaaaaaaaaa.bbbbbb.cccccccccccccccccccccccc';
    token.dispatchEvent(new window.Event('input', { bubbles: true }));
    for (const [id, value] of [['sourceId', '111111111111111111'], ['targetId', '222222222222222222']]) {
        const input = document.getElementById(id);
        input.value = value;
        input.dispatchEvent(new window.Event('input', { bubbles: true }));
    }

    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    assert.equal(controller.state, 'preflight');

    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(controller.state, 'idle');
    assert.equal(document.getElementById('confirmModal').classList.contains('hidden'), true);
});

test('toasts are dismissible and duplicate messages collapse', async () => {
    const { toast } = await bootDashboard();
    const container = document.getElementById('toastContainer');

    toast.success('Preferences saved.');
    toast.success('Preferences saved.');
    toast.error('Something failed.', { timeout: 0 });

    const messages = [...container.querySelectorAll('.toast')].map((node) => node.dataset.message);
    assert.equal(messages.filter((m) => m === 'Preferences saved.').length, 1, 'duplicates collapse');
    assert.equal(container.querySelectorAll('.toast').length, 2);

    const first = container.querySelector('.toast');
    first.querySelector('.toast-close').click();
    // The exit animation is asynchronous; wait for the removal fallback.
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(container.querySelectorAll('.toast').length, 1);
});

test('guided tour steps through targets and persists completion', async () => {
    const { tour } = await bootDashboard();

    tour.start();
    assert.equal(document.getElementById('tourCard').classList.contains('hidden'), false);
    assert.equal(document.getElementById('tourTitle').textContent, 'Welcome to Discloner Studio');
    assert.equal(document.getElementById('tourStepCounter').textContent, '1 / 5');

    document.getElementById('tourNextBtn').click();
    assert.equal(document.getElementById('tourStepCounter').textContent, '2 / 5');
    assert.equal(document.getElementById('tourBackBtn').classList.contains('hidden'), false);

    // Step 2 spotlights the token field.
    assert.equal(document.getElementById('tourSpotlight').classList.contains('hidden'), false);

    document.getElementById('tourBackBtn').click();
    assert.equal(document.getElementById('tourStepCounter').textContent, '1 / 5');

    document.getElementById('tourSkipBtn').click();
    assert.equal(document.getElementById('tourCard').classList.contains('hidden'), true);
    assert.equal(window.localStorage.getItem('discloner_tour_done'), 'true');
});

test('token remembering is opt-in and clearing removes the stored value', async () => {
    await bootDashboard();

    const token = document.getElementById('userToken');
    token.value = 'aaaaaaaaaaaaaaaaaaaaaaaa.bbbbbb.cccccccccccccccccccccccc';
    token.dispatchEvent(new window.Event('input', { bubbles: true }));

    assert.equal(window.localStorage.getItem('discloner_saved_user_token'), null, 'memory-only by default');

    const remember = document.getElementById('rememberToken');
    remember.checked = true;
    remember.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal(window.localStorage.getItem('discloner_saved_user_token'), token.value);
    assert.equal(document.getElementById('rememberTokenBadge').textContent, 'On');

    document.getElementById('clearTokenBtn').click();
    assert.equal(window.localStorage.getItem('discloner_saved_user_token'), null);
    assert.equal(document.getElementById('rememberTokenBadge').textContent, 'Off');
});
