import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig, loadConfig } from '../services/config.js';

test('parseConfig falls back to safe defaults', () => {
    const { config, warnings } = parseConfig({});
    assert.equal(config.port, 3000);
    assert.equal(config.host, '0.0.0.0');
    assert.equal(config.maxConcurrentJobs, 2);
    assert.equal(config.persistJobs, true);
    assert.equal(config.features.continuousMirror, true);
    assert.deepEqual(warnings, []);
});

test('parseConfig clamps and reports out-of-range values', () => {
    const { config, warnings } = parseConfig({ PORT: '999999', MAX_CONCURRENT_JOBS: '42' });
    assert.equal(config.port, 65535);
    assert.equal(config.maxConcurrentJobs, 5);
    assert.ok(warnings.some(w => w.includes('PORT')));
    assert.ok(warnings.some(w => w.includes('MAX_CONCURRENT_JOBS')));
});

test('parseConfig rejects non-numeric values without throwing', () => {
    const { config, warnings } = parseConfig({ PORT: 'banana' });
    assert.equal(config.port, 3000);
    assert.ok(warnings.some(w => w.includes('banana')));
});

test('parseConfig handles booleans in every common spelling', () => {
    assert.equal(parseConfig({ FEATURE_MULTI_JOB: 'yes' }).config.features.multiJobQueue, true);
    assert.equal(parseConfig({ FEATURE_MULTI_JOB: 'off' }).config.features.multiJobQueue, false);
    assert.equal(parseConfig({ FEATURE_MULTI_JOB: '0' }).config.features.multiJobQueue, false);
});

test('parseConfig warns about wildcard CORS and local-only telemetry', () => {
    const { config, warnings } = parseConfig({ ALLOWED_ORIGINS: '*', TELEMETRY_OPT_IN: 'true' });
    assert.deepEqual(config.allowedOrigins, ['*']);
    assert.ok(warnings.some(w => w.includes('ALLOWED_ORIGINS')));
    assert.ok(warnings.some(w => w.includes('TELEMETRY_ENDPOINT')));
});

test('loadConfig throws in strict mode when the bind address is invalid', () => {
    assert.throws(
        () => loadConfig({ HOST: 'not a host', NODE_ENV: 'production' }, { strict: true }),
        /Invalid configuration/
    );
});

test('strict mode is not applied in development', () => {
    const { config } = loadConfig({ NODE_ENV: 'development', HOST: 'bad host' }, { strict: false });
    assert.equal(config.host, 'bad host');
});
