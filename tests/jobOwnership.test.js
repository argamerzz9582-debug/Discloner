import test from 'node:test';
import assert from 'node:assert/strict';
import { jobManager } from '../services/jobManager.js';

const baseJob = (overrides = {}) => ({
    userToken: 'fake-token-test-12345678901234567890',
    sourceId: '110293847561829401',
    targetId: '129384756102938475',
    options: {},
    executor: async () => {
        await new Promise(r => setTimeout(r, 30));
        return { rolesCreated: 0 };
    },
    ...overrides
});

test('every job receives a capability token that never leaks in snapshots', async () => {
    const job = jobManager.startJob(baseJob());
    assert.equal(typeof job.jobToken, 'string');
    assert.equal(job.jobToken.length, 48); // 24 random bytes, hex encoded

    const snapshot = jobManager.getJobSnapshot(job.id);
    assert.equal('jobToken' in snapshot, false, 'snapshot must not expose the capability');

    await job._promise;
});

test('job capabilities are unique per job', async () => {
    const first = jobManager.startJob(baseJob());
    const second = jobManager.startJob(baseJob());
    assert.notEqual(first.jobToken, second.jobToken);

    await Promise.all([first._promise, second._promise]);
});

test('cancellation is refused without a matching socket or capability', async () => {
    const job = jobManager.startJob(baseJob({ socketId: 'socket_owner' }));

    assert.equal(jobManager.cancelJob(job.id), false, 'no credentials supplied');
    assert.equal(jobManager.cancelJob(job.id, { socketId: 'socket_other' }), false, 'wrong socket');
    assert.equal(jobManager.cancelJob(job.id, { jobToken: 'x'.repeat(48) }), false, 'wrong token');

    assert.equal(jobManager.canControlJob(job.id, { socketId: 'socket_owner' }), true);
    assert.equal(jobManager.canControlJob(job.id, { jobToken: job.jobToken }), true);
    assert.equal(jobManager.canControlJob(job.id, { socketId: 'socket_other' }), false);

    assert.equal(jobManager.cancelJob(job.id, { socketId: 'socket_owner' }), true);
    await job._promise;
});

test('cancelAllRunning signals each running job once', async () => {
    const first = jobManager.startJob(baseJob());
    const second = jobManager.startJob(baseJob());

    const signalled = jobManager.cancelAllRunning();
    assert.ok(signalled >= 2);
    assert.equal(first.isCancelled, true);
    assert.equal(second.isCancelled, true);

    await Promise.all([first._promise, second._promise]);
});

test('unknown job ids are never controllable', () => {
    assert.equal(jobManager.canControlJob('job_does_not_exist', { jobToken: 'a'.repeat(48) }), false);
    assert.equal(jobManager.cancelJob('job_does_not_exist', { jobToken: 'a'.repeat(48) }), false);
});
