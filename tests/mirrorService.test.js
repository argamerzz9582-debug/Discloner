import test from 'node:test';
import assert from 'node:assert/strict';
import {
    MirrorSession,
    normalizeMessage,
    normalizeStructure
} from '../services/mirrorService.js';

/**
 * Minimal fake channel/role collections that mimic the parts of discord.js the
 * mirror engine actually touches.
 */
function createCollection(entries = []) {
    const map = new Map(entries.map(entry => [entry.id, entry]));
    return {
        map,
        get: (id) => map.get(id),
        has: (id) => map.has(id),
        find: (fn) => [...map.values()].find(fn),
        values: () => map.values(),
        get size() { return map.size; }
    };
}

function createGuild({ id, name, channels = [], roles = [] }) {
    return {
        id,
        name,
        channels: { cache: createCollection(channels) },
        roles: { cache: createCollection(roles) }
    };
}

function createAdapter() {
    const calls = { sent: [], created: [] };
    return {
        calls,
        async createRole(spec) { calls.created.push(['role', spec.name]); return { id: `new_role_${calls.created.length}` }; },
        async updateRole() {},
        async deleteRole() {},
        async createChannel(spec) { calls.created.push(['channel', spec.name]); return { id: `new_chan_${calls.created.length}` }; },
        async updateChannel() {},
        async deleteChannel() {},
        async getWebhook(channel) { return { channelId: channel.id, send: async (payload) => { calls.sent.push(payload); return { id: `sent_${calls.sent.length}` }; } }; },
        async sendWebhook(webhook, payload) { calls.sent.push(payload); return { id: `sent_${calls.sent.length}` }; },
        async disposeWebhooks() {}
    };
}

function buildSession(overrides = {}) {
    const sourceChannel = { id: 'c1', name: 'general', type: 'GUILD_TEXT' };
    const targetChannel = { id: 'tc1', name: 'general', type: 'GUILD_TEXT' };
    const source = createGuild({ id: 's1', name: 'Source', channels: [sourceChannel], roles: [] });
    const target = createGuild({ id: 't1', name: 'Target', channels: [targetChannel], roles: [] });
    const adapter = createAdapter();
    const logs = [];

    const session = new MirrorSession({
        client: { on() {}, removeListener() {} },
        sourceGuild: source,
        targetGuild: target,
        adapter,
        emit: (type, message) => logs.push({ type, message }),
        ...overrides
    });

    return { session, adapter, source, target, logs, sourceChannel, targetChannel };
}

test('normalizeMessage produces a serializable, sanitized payload', () => {
    const event = normalizeMessage({
        id: 'm1',
        channelId: 'c1',
        content: 'hello @everyone',
        author: { id: 'u1', username: 'Alice' },
        attachments: new Map([['a1', { url: 'https://cdn.example/a.png' }]]),
        createdTimestamp: 1700
    });

    assert.equal(event.kind, 'message');
    assert.equal(event.authorName, 'Alice');
    assert.equal(event.channelId, 'c1');
    assert.deepEqual(event.attachmentUrls, ['https://cdn.example/a.png']);
    assert.equal(normalizeMessage(null), null);
});

test('normalizeStructure maps channels and roles', () => {
    const channel = normalizeStructure('channel', { id: 'c1', name: 'general', type: 'GUILD_TEXT', parentId: 'p1', position: 3 }, 'create');
    assert.equal(channel.parentId, 'p1');
    assert.equal(channel.position, 3);

    const role = normalizeStructure('role', { id: 'r1', name: 'Admin', color: 255, hoist: true }, 'create');
    assert.equal(role.color, 255);
    assert.equal(role.hoist, true);
});

test('messages are forwarded through the webhook into the mapped channel', async () => {
    const { session, adapter, sourceChannel } = buildSession({
        options: { channelMap: { c1: 'tc1' } }
    });

    session.attach();
    session._handleMessage({
        id: 'm1',
        channelId: sourceChannel.id,
        content: 'hello world',
        author: { id: 'u1', username: 'Alice' },
        attachments: new Map()
    }, 'create');

    await new Promise(r => setTimeout(r, 20));

    assert.equal(adapter.calls.sent.length, 1);
    assert.equal(adapter.calls.sent[0].content, 'hello world');
    assert.equal(adapter.calls.sent[0].username, 'Alice');
    assert.equal(session.stats.messagesForwarded, 1);
});

test('paused sessions drop events instead of forwarding', async () => {
    const { session, adapter, sourceChannel } = buildSession({ options: { channelMap: { c1: 'tc1' } } });

    session.pause();
    session._onGatewayEvent('messageCreate', [{
        id: 'm2',
        channelId: sourceChannel.id,
        content: 'ignored',
        author: { username: 'Bob' },
        attachments: new Map()
    }]);

    await new Promise(r => setTimeout(r, 20));
    assert.equal(adapter.calls.sent.length, 0);
    assert.equal(session.stats.eventsDropped, 1);

    session.resume();
    session._onGatewayEvent('messageCreate', [{
        id: 'm3',
        channelId: sourceChannel.id,
        content: 'forwarded',
        author: { username: 'Bob' },
        attachments: new Map()
    }]);

    await new Promise(r => setTimeout(r, 20));
    assert.equal(adapter.calls.sent.length, 1);
});

test('echo protection prevents feedback loops', async () => {
    const { session, adapter, sourceChannel } = buildSession({ options: { channelMap: { c1: 'tc1' } } });

    session._handleMessage({
        id: 'm4',
        channelId: sourceChannel.id,
        content: 'loop',
        author: { username: 'Echo' },
        attachments: new Map()
    }, 'create');
    await new Promise(r => setTimeout(r, 20));

    const sentId = 'sent_1';
    session._rememberEcho(sentId);
    assert.equal(session._echoIds.has(sentId), true);

    // A message already seen as an echo must not be forwarded again.
    session._handleMessage({ id: sentId, channelId: sourceChannel.id, content: 'again' }, 'create');
    await new Promise(r => setTimeout(r, 20));
    assert.equal(adapter.calls.sent.length, 1);
});

test('structure changes are mirrored after the debounce window', async () => {
    const { session, adapter, source } = buildSession({
        options: { structureDebounceMs: 5, channelMap: { c1: 'tc1' } }
    });

    session.attach();
    session._onGatewayEvent('channelCreate', [{
        id: 'c2',
        name: 'new-channel',
        type: 'GUILD_TEXT',
        guild: source
    }]);

    await new Promise(r => setTimeout(r, 40));
    assert.ok(adapter.calls.created.some(([kind, name]) => kind === 'channel' && name === 'new-channel'));
    assert.equal(session.channelMap.get('c2'), 'new_chan_1');
});

test('edits and deletes respect their individual toggles', async () => {
    const { session, adapter, sourceChannel } = buildSession({
        options: { channelMap: { c1: 'tc1' }, mirrorEdits: false, mirrorDeletes: false }
    });

    session._handleMessage({ id: 'm5', channelId: sourceChannel.id, content: 'edited' }, 'update');
    session._handleMessage({ id: 'm6', channelId: sourceChannel.id }, 'delete');
    await new Promise(r => setTimeout(r, 20));

    assert.equal(adapter.calls.sent.length, 0);
    assert.equal(session.stats.messagesUpdated, 0);
});

test('stop() detaches listeners and disposes webhooks', async () => {
    const { session } = buildSession();
    let disposed = false;
    session.adapter.disposeWebhooks = async () => { disposed = true; };

    session.attach();
    await session.stop();

    assert.equal(session.status, 'stopped');
    assert.equal(disposed, true);
    assert.equal(session.isRunning, false);
});

test('snapshot exposes a serializable view for the UI', () => {
    const { session } = buildSession({ options: { channelMap: { c1: 'tc1' } } });
    const snapshot = session.getSnapshot();
    assert.equal(snapshot.status, 'running');
    assert.equal(typeof snapshot.stats.messagesForwarded, 'number');
    assert.equal(snapshot.channelMapSize, 1);
});
