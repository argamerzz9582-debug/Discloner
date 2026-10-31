import test from 'node:test';
import assert from 'node:assert/strict';
import { JobQueue, PRIORITIES, normalizePriority } from '../services/jobQueue.js';

test('queue honours priority bands and FIFO within a band', () => {
    const queue = new JobQueue({ concurrency: 1 });
    queue.enqueue('low-1', { priority: 'low' });
    queue.enqueue('normal-1');
    queue.enqueue('high-1', { priority: 'high' });
    queue.enqueue('normal-2');

    assert.equal(queue.dequeue(), 'high-1');
    assert.equal(queue.dequeue(), 'normal-1');
    assert.equal(queue.dequeue(), 'normal-2');
    assert.equal(queue.dequeue(), 'low-1');
    assert.equal(queue.dequeue(), null);
});

test('queue rejects when full with a structured code', () => {
    const queue = new JobQueue({ concurrency: 1, maxQueued: 2 });
    queue.enqueue('a');
    queue.enqueue('b');
    assert.throws(() => queue.enqueue('c'), (err) => err.code === 'JOB_QUEUE_FULL');
});

test('queue reports 1-based positions and wait estimates', () => {
    const queue = new JobQueue({ concurrency: 1, defaultDurationMs: 60_000 });
    queue.enqueue('a');
    queue.enqueue('b');
    queue.enqueue('c');

    assert.equal(queue.positionOf('a'), 1);
    assert.equal(queue.positionOf('c'), 3);
    assert.equal(queue.positionOf('missing'), 0);
    assert.equal(queue.estimatedWaitMs('a'), 60_000);
    assert.equal(queue.estimatedWaitMs('c'), 180_000);
});

test('ETA estimation uses observed durations once available', () => {
    const queue = new JobQueue({ concurrency: 1 });
    queue.recordDuration(10_000);
    queue.recordDuration(20_000);
    assert.equal(queue.averageDurationMs(), 15_000);
});

test('removing and clearing entries behaves predictably', () => {
    const queue = new JobQueue({ concurrency: 1 });
    queue.enqueue('a');
    queue.enqueue('b');

    assert.equal(queue.remove('a'), true);
    assert.equal(queue.remove('a'), false);
    assert.equal(queue.size, 1);
    assert.deepEqual(queue.clear(), ['b']);
    assert.equal(queue.size, 0);
});

test('priority normalization falls back to normal', () => {
    assert.equal(normalizePriority('urgent'), 'normal');
    assert.equal(normalizePriority('high'), 'high');
    assert.ok(PRIORITIES.high.weight < PRIORITIES.low.weight);
});

test('queue list exposes resolved job payloads', () => {
    const queue = new JobQueue({ concurrency: 2 });
    queue.enqueue('a', { priority: 'high' });
    const list = queue.list((id) => ({ id, label: `job ${id}` }));
    assert.equal(list.length, 1);
    assert.equal(list[0].job.label, 'job a');
    assert.equal(list[0].position, 1);
});
