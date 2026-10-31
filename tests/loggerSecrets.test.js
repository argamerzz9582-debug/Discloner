import test from 'node:test';
import assert from 'node:assert/strict';
import {
    sanitizeText,
    createLogEntry,
    registerSecret,
    clearRegisteredSecrets,
    getRegisteredSecretCount
} from '../utils/logger.js';

// Fixtures are assembled at runtime on purpose: a realistic-looking token
// literal would be blocked by GitHub push protection (and rightly so).
const fakeToken = (...parts) => parts.join('.');

test('sanitizeText redacts Discord-shaped tokens', () => {
    const sample = fakeToken(
        'MTIzNDU2Nzg5MDEyMzQ1Njc4',
        'GhIjKl',
        'abcdefghijklmnopqrstuvwxyz0123456789'
    );
    const cleaned = sanitizeText(`login failed for ${sample}`);
    assert.equal(cleaned.includes(sample), false);
    assert.match(cleaned, /\[REDACTED_TOKEN\]/);
});

test('sanitizeText redacts mfa-scoped tokens', () => {
    const sample = 'mfa' + '.' + 'abcdefghijklmnopqrstuvwxyz012345';
    assert.equal(sanitizeText(sample).includes('abcdefghijklmnop'), false);
});

test('registerSecret redacts exact credential values that do not match token patterns', () => {
    clearRegisteredSecrets();
    const opaque = 'opaque-credential-value-with-no-dots';

    // Before registration the value passes through untouched
    assert.equal(sanitizeText(opaque), opaque);

    registerSecret(opaque);
    assert.equal(getRegisteredSecretCount(), 1);

    const cleaned = sanitizeText(`Authorization rejected: ${opaque}`);
    assert.equal(cleaned.includes(opaque), false);
    assert.match(cleaned, /\[REDACTED_TOKEN\]/);
});

test('registerSecret ignores short/blank values', () => {
    clearRegisteredSecrets();
    registerSecret('abc');
    registerSecret('');
    registerSecret(null);
    registerSecret(undefined);
    assert.equal(getRegisteredSecretCount(), 0);
});

test('registered secrets are scrubbed from structured log entries', () => {
    clearRegisteredSecrets();
    const secret = 'super-secret-token-value-1234567890';
    registerSecret(secret);

    const entry = createLogEntry('error', `Failed with ${secret}`, `detail ${secret}`, 'auth');
    assert.equal(entry.message.includes(secret), false);
    assert.equal(entry.detail.includes(secret), false);
    assert.match(entry.message, /REDACTED/);
});

test('the secret registry stays bounded', () => {
    clearRegisteredSecrets();
    for (let i = 0; i < 200; i++) {
        registerSecret(`secret-value-${i}-padding-padding`);
    }
    assert.ok(getRegisteredSecretCount() <= 25, `registry grew to ${getRegisteredSecretCount()}`);
    clearRegisteredSecrets();
});
