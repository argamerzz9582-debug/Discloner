import test from 'node:test';
import assert from 'node:assert/strict';
import {
    SlidingWindowLimiter,
    SocketCooldown,
    createRateLimitMiddleware,
    resetGuards
} from '../services/httpGuard.js';

test('SlidingWindowLimiter allows up to the limit then blocks', () => {
    const limiter = new SlidingWindowLimiter({ limit: 3, windowMs: 60000 });

    assert.equal(limiter.hit('1.2.3.4').allowed, true);
    assert.equal(limiter.hit('1.2.3.4').allowed, true);
    const third = limiter.hit('1.2.3.4');
    assert.equal(third.allowed, true);
    assert.equal(third.remaining, 0);

    const blocked = limiter.hit('1.2.3.4');
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterMs > 0);
    assert.ok(blocked.retryAfterMs <= 60000);

    // Unrelated keys keep their own budget
    assert.equal(limiter.hit('5.6.7.8').allowed, true);
});

test('SlidingWindowLimiter window expires and frees the budget', async () => {
    const limiter = new SlidingWindowLimiter({ limit: 1, windowMs: 40 });

    assert.equal(limiter.hit('key').allowed, true);
    assert.equal(limiter.hit('key').allowed, false);

    await new Promise(r => setTimeout(r, 60));
    assert.equal(limiter.hit('key').allowed, true);
});

test('SlidingWindowLimiter caps tracked keys to stay memory-bounded', () => {
    const limiter = new SlidingWindowLimiter({ limit: 5, windowMs: 60000, maxKeys: 10 });
    for (let i = 0; i < 50; i++) {
        limiter.hit(`ip-${i}`);
    }
    assert.ok(limiter.keyCount <= 10, `expected <= 10 tracked keys, got ${limiter.keyCount}`);
});

test('SocketCooldown debounces rapid repeats per connection', () => {
    const cooldown = new SocketCooldown({ cooldownMs: 1000 });

    assert.equal(cooldown.check('socket_a').allowed, true);
    const second = cooldown.check('socket_a');
    assert.equal(second.allowed, false);
    assert.ok(second.retryAfterMs > 0);

    // A different connection is unaffected
    assert.equal(cooldown.check('socket_b').allowed, true);

    // Clearing a connection restores the budget
    cooldown.clear('socket_a');
    assert.equal(cooldown.check('socket_a').allowed, true);
});

test('createRateLimitMiddleware returns 429 with retry metadata', () => {
    const limiter = new SlidingWindowLimiter({ limit: 1, windowMs: 60000 });
    const middleware = createRateLimitMiddleware(limiter, { message: 'slow down' });

    const res = {
        headers: {},
        statusCode: 200,
        body: null,
        setHeader(name, value) {
            this.headers[name] = value;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        }
    };

    let nextCalled = 0;
    middleware({ ip: '10.0.0.1' }, res, () => { nextCalled++; });
    middleware({ ip: '10.0.0.1' }, res, () => { nextCalled++; });

    assert.equal(nextCalled, 1);
    assert.equal(res.statusCode, 429);
    assert.equal(res.body.code, 'RATE_LIMITED');
    assert.equal(res.body.error, 'slow down');
    assert.ok(res.headers['Retry-After']);
    assert.ok(res.headers['X-RateLimit-Remaining'] === '0');
});

test('resetGuards clears limiter state', () => {
    resetGuards();
    assert.equal(resetGuards(), undefined);
});
