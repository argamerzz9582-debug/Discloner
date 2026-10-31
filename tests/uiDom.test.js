/**
 * DOM-level regression tests for the dashboard shell.
 *
 * These cover markup structure and client-side behaviour that the pure unit
 * suites cannot see — most importantly the two layout bugs fixed in the UI/UX
 * pass: the Save/Reset toolbar being trapped inside a collapsed drawer, and
 * the primary CTA rendering inside the setup card.
 *
 * jsdom is optional. When it is not installed the suite skips instead of
 * failing, so `npm test` still works with zero dev dependencies.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(here, '..', 'public', 'index.html');
const scriptPath = path.join(here, '..', 'public', 'script.js');

let JSDOM = null;
try {
    ({ JSDOM } = await import('jsdom'));
} catch {
    JSDOM = null;
}

const skipReason = JSDOM ? false : 'jsdom is not installed (npm i --no-save jsdom)';

function loadDocument({ withScript = false } = {}) {
    const dom = new JSDOM(readFileSync(htmlPath, 'utf8'), {
        url: 'http://localhost:3000/',
        runScripts: 'outside-only',
        pretendToBeVisual: true
    });

    const { window } = dom;
    const handlers = new Map();
    const emitted = [];

    window.io = () => ({
        id: 'socket_test',
        on(event, cb) {
            if (!handlers.has(event)) handlers.set(event, []);
            handlers.get(event).push(cb);
        },
        emit(event, payload) { emitted.push({ event, payload }); },
        close() {}
    });
    window.matchMedia = window.matchMedia || (() => ({
        matches: false,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {}
    }));
    if (!window.navigator.sendBeacon) window.navigator.sendBeacon = () => true;
    window.HTMLElement.prototype.scrollIntoView = function () {};

    if (withScript) {
        window.eval(readFileSync(scriptPath, 'utf8'));
    }

    return {
        dom,
        window,
        document: window.document,
        emitted,
        fire: (event, payload) => (handlers.get(event) || []).forEach(cb => cb(payload))
    };
}

test('dashboard markup keeps the fixed element hierarchy', { skip: skipReason }, () => {
    const { document } = loadDocument();
    const query = (selector) => document.querySelector(selector);

    assert.equal(
        query('#messageSettingsDrawer #configActionsBar'),
        null,
        'Save/Reset toolbar must not live inside the collapsible message drawer'
    );
    assert.ok(query('#advancedPanel #configActionsBar'), 'toolbar belongs to the advanced panel');
    assert.ok(query('form#clonerForm > .cta-actions-group'), 'CTA group is a direct child of the form');
    assert.equal(query('#migrationSetupCard #startBtn'), null, 'primary CTA must not be nested in the setup card');
    assert.ok(query('#messageSettingsDrawer > .drawer-inner-card'), 'drawer still wraps its inner card');
});

test('dashboard exposes accessible landmarks and semantics', { skip: skipReason }, () => {
    const { document } = loadDocument();
    const query = (selector) => document.querySelector(selector);

    assert.equal(query('.skip-link')?.getAttribute('href'), '#mainDashboard');
    assert.equal(query('main')?.getAttribute('tabindex'), '-1');
    assert.equal(query('#progressTrack')?.getAttribute('aria-valuemax'), '100');
    assert.equal(query('#logStream')?.getAttribute('aria-live'), 'off', 'chatty log stream stays out of the SR queue');
    assert.equal(query('#logAnnouncer')?.getAttribute('role'), 'status');
    assert.equal(query('#userToken')?.getAttribute('aria-describedby'), 'tokenHelper');
    assert.equal(query('#userToken')?.getAttribute('spellcheck'), 'false');
    assert.equal(query('.filter-chips-scroll')?.getAttribute('role'), 'group');
    assert.equal(document.querySelectorAll('.filter-count').length, 5);
    assert.equal(document.querySelectorAll('.workflow-stepper .step-chip[id]').length, 3);
});

test('workflow stepper tracks real form state', { skip: skipReason }, () => {
    const { window, document } = loadDocument({ withScript: true });
    const stepToken = document.getElementById('stepToken');
    const stepRoute = document.getElementById('stepRoute');
    const stepClone = document.getElementById('stepClone');

    const type = (id, value) => {
        const input = document.getElementById(id);
        input.value = value;
        input.dispatchEvent(new window.Event('input', { bubbles: true }));
    };

    assert.equal(stepToken.getAttribute('aria-current'), 'step', 'starts on the token step');

    type('userToken', 'a'.repeat(60));
    assert.equal(stepRoute.getAttribute('aria-current'), 'step');
    assert.ok(stepToken.classList.contains('done'));

    type('sourceId', '110293847561829401');
    type('targetId', '129384756102938475');
    assert.equal(stepClone.getAttribute('aria-current'), 'step');

    // Identical source/target is not a valid route.
    type('targetId', '110293847561829401');
    assert.equal(stepRoute.getAttribute('aria-current'), 'step');
});

test('dialogs trap focus, close on Escape and restore focus', { skip: skipReason }, () => {
    const { window, document } = loadDocument({ withScript: true });
    const modal = document.getElementById('helpModal');
    const trigger = document.getElementById('navGuidesBtn');

    trigger.focus();
    trigger.click();

    assert.equal(modal.classList.contains('hidden'), false);
    assert.ok(modal.contains(document.activeElement), 'focus moves inside the dialog');
    assert.equal(document.body.style.overflow, 'hidden');

    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    assert.equal(modal.classList.contains('hidden'), true);
    assert.equal(document.activeElement, trigger, 'focus returns to the opener');
    assert.equal(document.body.style.overflow, '');
});

test('console counters, filters and empty states stay in sync', { skip: skipReason }, async () => {
    const { window, document, fire } = loadDocument({ withScript: true });

    fire('clone:log', { type: 'success', message: 'Created role Admin' });
    fire('clone:log', { type: 'warning', message: 'Rate limited on channel' });
    fire('clone:log', { type: 'error', message: 'Failed to clone emoji' });

    const counts = {};
    document.querySelectorAll('.filter-count').forEach(el => { counts[el.dataset.count] = el.textContent; });
    assert.equal(counts.all, '3');
    assert.equal(counts.warning, '1');
    assert.equal(counts.error, '1');

    document.querySelector('.filter-pill[data-filter="error"]').click();
    assert.equal(document.querySelectorAll('#logStream .log-entry').length, 1);
    assert.equal(
        document.querySelector('.filter-pill[data-filter="error"]').getAttribute('aria-pressed'),
        'true'
    );

    document.getElementById('logSearchInput').value = 'definitely-no-match';
    document.getElementById('logSearchInput').dispatchEvent(new window.Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 120));

    const emptyState = document.getElementById('logEmptyState');
    assert.equal(emptyState.classList.contains('hidden'), false);
    assert.equal(document.getElementById('logEmptyTitle').textContent, 'No matching activity');
});

test('toasts are dismissible and capped in number', { skip: skipReason }, async () => {
    const { window, document } = loadDocument({ withScript: true });
    const container = document.getElementById('toastContainer');

    // Clearing an empty log draws a toast.
    document.getElementById('copyLogsBtn').click();
    await new Promise(r => setTimeout(r, 60));

    const toast = container.querySelector('.toast');
    assert.ok(toast, 'a toast is rendered');
    assert.ok(toast.getAttribute('role'), 'toasts carry an ARIA role');
    assert.ok(toast.querySelector('.toast-dismiss'), 'toasts have a dismiss button');

    toast.querySelector('.toast-dismiss').click();
    await new Promise(r => setTimeout(r, 260));
    assert.equal(container.querySelectorAll('.toast').length, 0);

    // Force several distinct toasts and confirm the stack is bounded.
    for (let i = 0; i < 8; i++) {
        document.getElementById('resetConfigBtn').click();
        document.getElementById('saveConfigBtn').click();
    }
    await new Promise(r => setTimeout(r, 80));
    assert.ok(container.querySelectorAll('.toast').length <= 4, 'toast stack never exceeds four');
});

test('Ctrl+Enter submits while Esc respects an in-flight preflight', { skip: skipReason }, async () => {
    const { window, document, emitted } = loadDocument({ withScript: true });
    const modal = document.getElementById('confirmModal');

    const type = (id, value) => {
        const input = document.getElementById(id);
        input.value = value;
        input.dispatchEvent(new window.Event('input', { bubbles: true }));
    };
    type('userToken', 'b'.repeat(60));
    type('sourceId', '110293847561829401');
    type('targetId', '129384756102938475');

    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    await new Promise(r => setTimeout(r, 80));

    assert.equal(modal.classList.contains('hidden'), false, 'confirmation dialog opens');
    assert.ok(emitted.some(e => e.event === 'clone:preflight'), 'preflight was requested');

    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(modal.classList.contains('hidden'), false, 'dialog stays open while preflight runs');
});
