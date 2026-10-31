import test from 'node:test';
import assert from 'node:assert/strict';
import {
    recordEvent,
    sanitizeTelemetryProps,
    getTelemetrySnapshot,
    flushTelemetry,
    resetTelemetry,
    ALLOWED_EVENTS
} from '../services/telemetry.js';
import { setConfigForTests, getConfig } from '../services/config.js';
import { setFlag, resetFlags } from '../services/featureFlags.js';

test.beforeEach(() => {
    resetTelemetry();
    resetFlags();
    setConfigForTests(null);
});

test('only allowlisted events are recorded', () => {
    assert.equal(recordEvent('job.created', { mode: 'clone' }), true);
    assert.equal(recordEvent('user.token', { token: 'secret' }), false);

    const snapshot = getTelemetrySnapshot();
    assert.equal(snapshot.queued, 1);
    assert.equal(snapshot.dropped, 1);
    assert.equal(snapshot.counters['job.created'], 1);
    assert.equal(snapshot.counters['user.token'], undefined);
});

test('properties are sanitised: no nested objects, truncated strings, capped keys', () => {
    const long = 'x'.repeat(500);
    const props = {
        mode: 'mirror',
        durationMs: 1234,
        ok: true,
        list: [1, 2, 3],
        nested: { token: 'abc' },
        long,
        'bad key': 'dropped',
        __proto__: 'nope'
    };

    const clean = sanitizeTelemetryProps(props);

    assert.equal(clean.mode, 'mirror');
    assert.equal(clean.durationMs, 1234);
    assert.equal(clean.ok, true);
    assert.equal(clean.list, 3, 'arrays collapse to their length');
    assert.equal(clean.nested, null, 'objects are dropped');
    assert.ok(clean.long.length <= 121, 'strings are truncated');
    assert.equal(clean['bad key'], undefined, 'invalid keys are dropped');
});

test('property key count is capped', () => {
    const props = {};
    for (let i = 0; i < 40; i += 1) props[`k${i}`] = i;
    assert.ok(Object.keys(sanitizeTelemetryProps(props)).length <= 12);
});

test('remote flush is refused without the feature flag, opt-in and endpoint', async () => {
    recordEvent('job.created', { mode: 'clone' });

    // Defaults: nothing is sent.
    let result = await flushTelemetry({ force: true });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'feature-disabled');

    setFlag('telemetry', true);
    result = await flushTelemetry({ force: true });
    assert.equal(result.reason, 'opt-in-required');

    setConfigForTests({ ...getConfig(), telemetryOptIn: true });
    result = await flushTelemetry({ force: true });
    assert.equal(result.reason, 'no-endpoint');
});

test('flush is throttled and never throws on network failure', async () => {
    setFlag('telemetry', true);
    setConfigForTests({
        ...getConfig(),
        telemetryOptIn: true,
        // A port that nothing listens on: fetch must fail closed.
        telemetryEndpoint: 'http://127.0.0.1:9/collect'
    });

    recordEvent('job.completed', { mode: 'clone', durationMs: 100 });
    const result = await flushTelemetry({ force: true });

    // `recordEvent` may have already started an opportunistic flush, in which
    // case our explicit call finds an empty buffer. Either way it must fail
    // closed rather than throw.
    assert.equal(result.ok, false);
    assert.ok(['network-error', 'http-error', 'empty'].includes(result.reason));

    // Let any in-flight flush settle; the batch must be restored, not lost.
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(getTelemetrySnapshot().queued >= 1);
});

test('the event allowlist is frozen and exported', () => {
    assert.ok(Object.isFrozen(ALLOWED_EVENTS));
    assert.ok(ALLOWED_EVENTS.includes('job.created'));
    assert.ok(ALLOWED_EVENTS.includes('server.boot'));
});
