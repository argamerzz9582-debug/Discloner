/**
 * DISCLONER - Continuous Mirror Engine
 *
 * Keeps a long-lived Discord session open and forwards source-guild activity to
 * the target guild:
 *
 *   messages   create / update / delete  -> replayed through webhooks
 *   structure  channel & role create / update / delete -> mirrored
 *
 * Design notes
 * ------------
 * - The engine never talks to discord.js directly. It receives duck-typed
 *   objects through an `adapter`, which is what makes it testable without a
 *   live gateway connection.
 * - Structure events are debounced: a burst of channel edits collapses into a
 *   single pass, which also keeps us far away from rate limits.
 * - Every outbound call is wrapped by the caller (jobManager) in the shared
 *   reliability layer; this module only decides *what* to do.
 * - Echo protection: message ids we produced are remembered so a source==target
 *   misconfiguration cannot build an infinite feedback loop.
 */

import { sanitizeText } from '../utils/logger.js';

export const MIRROR_ACTIONS = Object.freeze({
    create: 'create',
    update: 'update',
    delete: 'delete'
});

const MIRRORED_GATEWAY_EVENTS = Object.freeze([
    'messageCreate',
    'messageUpdate',
    'messageDelete',
    'channelCreate',
    'channelUpdate',
    'channelDelete',
    'roleCreate',
    'roleUpdate',
    'roleDelete'
]);

const MAX_ECHO_MEMORY = 500;

/**
 * Normalizes a discord.js message into a plain, serializable shape.
 * @param {any} message
 * @param {'create'|'update'|'delete'} action
 */
export function normalizeMessage(message, action = 'create') {
    if (!message || !message.id) return null;

    const author = message.author || {};
    const attachments = Array.from(message.attachments?.values?.() || []);

    return {
        kind: 'message',
        action,
        id: message.id,
        channelId: message.channelId || message.channel?.id || null,
        authorId: author.id || null,
        authorName: sanitizeText(author.username || author.tag || 'Unknown'),
        authorAvatar: author.displayAvatarURL?.({ size: 128, dynamic: true }) || author.avatarURL?.() || null,
        content: sanitizeText(message.content || ''),
        attachmentUrls: attachments.map((/** @type {any} */ a) => a.url).filter(Boolean),
        createdAt: message.createdTimestamp || Date.now()
    };
}

/**
 * Normalizes a channel/role object for structure mirroring.
 * @param {'channel'|'role'} kind
 * @param {any} object
 * @param {'create'|'update'|'delete'} action
 */
export function normalizeStructure(kind, object, action) {
    if (!object || !object.id) return null;

    if (kind === 'channel') {
        return {
            kind: 'channel',
            action,
            id: object.id,
            name: object.name || 'unnamed',
            type: object.type || 'GUILD_TEXT',
            parentId: object.parentId || object.parent?.id || null,
            position: object.position || 0,
            topic: object.topic ? sanitizeText(object.topic) : null,
            nsfw: Boolean(object.nsfw),
            bitrate: object.bitrate || null
        };
    }

    return {
        kind: 'role',
        action,
        id: object.id,
        name: object.name || 'unnamed',
        color: object.color || 0,
        hoist: Boolean(object.hoist),
        mentionable: Boolean(object.mentionable),
        position: object.position || 0,
        managed: Boolean(object.managed)
    };
}

/**
 * @param {any} guild
 * @returns {any} adapter backed by real discord.js guild objects
 */
export function createDiscordAdapter(guild) {
    /** @type {Map<string, any>} */
    const webhookCache = new Map();

    return {
        async createRole(spec) {
            return guild.roles.create({
                name: spec.name,
                color: spec.color,
                hoist: spec.hoist,
                mentionable: spec.mentionable,
                reason: 'Discloner continuous mirror'
            });
        },
        async updateRole(role, spec) {
            return role?.edit?.({ name: spec.name, color: spec.color, hoist: spec.hoist, mentionable: spec.mentionable });
        },
        async deleteRole(role) {
            return role?.delete?.('Discloner continuous mirror');
        },
        async createChannel(spec) {
            return guild.channels.create(spec.name, {
                type: spec.type,
                topic: spec.topic || undefined,
                nsfw: spec.nsfw,
                bitrate: spec.bitrate || undefined,
                reason: 'Discloner continuous mirror'
            });
        },
        async updateChannel(channel, spec) {
            return channel?.edit?.({ name: spec.name, topic: spec.topic || null, nsfw: spec.nsfw });
        },
        async deleteChannel(channel) {
            return channel?.delete?.('Discloner continuous mirror');
        },
        async getWebhook(channel) {
            if (webhookCache.has(channel.id)) return webhookCache.get(channel.id);

            const existing = await channel.fetchWebhooks?.().catch(() => null);
            const own = existing?.find?.((/** @type {any} */ wh) => wh.name === 'Discloner Mirror');
            const webhook = own || await channel.createWebhook('Discloner Mirror', { reason: 'Discloner continuous mirror' });
            webhookCache.set(channel.id, webhook);
            return webhook;
        },
        async sendWebhook(webhook, payload) {
            return webhook.send(payload);
        },
        async disposeWebhooks() {
            for (const webhook of webhookCache.values()) {
                try {
                    await webhook.delete('Discloner mirror stopped');
                } catch {
                    // Webhook may already be gone.
                }
            }
            webhookCache.clear();
        }
    };
}

export class MirrorSession {
    /**
     * @param {{
     *   client: any,
     *   sourceGuild: any,
     *   targetGuild: any,
     *   options?: Record<string, any>,
     *   adapter?: any,
     *   emit?: (type: string, message: string, detail?: string|null) => void,
     *   onStat?: (stat: string, delta?: number) => void,
     *   checkpoint?: () => void,
     *   logger?: any
     * }} input
     */
    constructor(input) {
        this.client = input.client;
        this.sourceGuild = input.sourceGuild;
        this.targetGuild = input.targetGuild;
        this.options = input.options || {};
        this.adapter = input.adapter || createDiscordAdapter(input.targetGuild);
        this.emitLog = input.emit || (() => {});
        this.onStat = input.onStat || (() => {});
        this.checkpoint = input.checkpoint || (() => {});
        this.log = input.logger || null;

        this.status = 'running'; // running | paused | stopped
        this.forwardMessages = this.options.mirrorMessages !== false;
        this.forwardEdits = this.options.mirrorEdits !== false;
        this.forwardDeletes = this.options.mirrorDeletes !== false;
        this.mirrorStructure = this.options.mirrorStructure !== false;

        this.stats = {
            messagesForwarded: 0,
            messagesUpdated: 0,
            messagesDeleted: 0,
            channelsSynced: 0,
            rolesSynced: 0,
            eventsDropped: 0,
            errors: 0
        };

        /** @type {Map<string, string>} source channel id -> target channel id */
        this.channelMap = new Map(Object.entries(this.options.channelMap || {}));
        /** @type {Map<string, string>} source role id -> target role id */
        this.roleMap = new Map(Object.entries(this.options.roleMap || {}));

        this._echoIds = new Set();
        /** @type {Map<string, any>} */
        this._pendingStructure = new Map();
        this._structureTimer = null;
        this._listeners = [];
        this._attached = false;
    }

    /* ---------------------------------------------------------------- lifecycle */

    attach() {
        if (this._attached) return;
        this._attached = true;

        for (const eventName of MIRRORED_GATEWAY_EVENTS) {
            const handler = (...args) => this._onGatewayEvent(eventName, args);
            this.client.on(eventName, handler);
            this._listeners.push([eventName, handler]);
        }
    }

    detach() {
        if (!this._attached) return;
        for (const [eventName, handler] of this._listeners) {
            try {
                this.client.removeListener?.(eventName, handler);
            } catch {
                // Listener already removed.
            }
        }
        this._listeners = [];
        this._attached = false;

        if (this._structureTimer) {
            clearTimeout(this._structureTimer);
            this._structureTimer = null;
        }
    }

    pause() {
        if (this.status === 'stopped') return false;
        this.status = 'paused';
        this.emitLog('info', 'Continuous mirror paused. Changes are not being forwarded.');
        this.checkpoint();
        return true;
    }

    resume() {
        if (this.status === 'stopped') return false;
        if (this.status === 'running') return true;
        this.status = 'running';
        this.emitLog('info', 'Continuous mirror resumed.');
        this.checkpoint();
        return true;
    }

    async stop() {
        this.status = 'stopped';
        this.detach();
        await this.adapter.disposeWebhooks?.();
        this.emitLog('info', 'Continuous mirror stopped and webhooks cleaned up.');
        this.checkpoint();
    }

    get isRunning() {
        return this.status === 'running';
    }

    getSnapshot() {
        return {
            status: this.status,
            stats: { ...this.stats },
            channelMapSize: this.channelMap.size,
            roleMapSize: this.roleMap.size
        };
    }

    /* ------------------------------------------------------------------ events */

    /**
     * Routes a raw gateway event. Exposed for tests.
     * @param {string} eventName
     * @param {any[]} args
     */
    _onGatewayEvent(eventName, args) {
        if (this.status !== 'running') {
            this.stats.eventsDropped++;
            return;
        }

        try {
            switch (eventName) {
                case 'messageCreate':
                    this._handleMessage(args[0], 'create');
                    break;
                case 'messageUpdate':
                    this._handleMessage(args[1] || args[0], 'update');
                    break;
                case 'messageDelete':
                    this._handleMessage({ id: args[0]?.id, channelId: args[0]?.channelId, channel: args[0]?.channel }, 'delete');
                    break;
                case 'channelCreate':
                case 'channelUpdate':
                case 'channelDelete':
                    this._queueStructure('channel', eventName.replace('channel', '').toLowerCase(), args[0]);
                    break;
                case 'roleCreate':
                case 'roleUpdate':
                case 'roleDelete':
                    this._queueStructure('role', eventName.replace('role', '').toLowerCase(), args[0]);
                    break;
                default:
                    this.stats.eventsDropped++;
            }
        } catch (err) {
            this.stats.errors++;
            this.emitLog('warning', 'Mirror event failed.', err instanceof Error ? err.message : String(err));
        }
    }

    /**
     * @param {any} message
     * @param {'create'|'update'|'delete'} action
     */
    _handleMessage(message, action) {
        const event = normalizeMessage(message, action);
        if (!event) {
            this.stats.eventsDropped++;
            return;
        }

        // Ignore activity on the target guild itself (prevents loops).
        if (event.channelId && this._isTargetChannel(event.channelId)) {
            this.stats.eventsDropped++;
            return;
        }
        if (event.id && this._echoIds.has(event.id)) {
            this.stats.eventsDropped++;
            return;
        }

        if (action === 'create' && !this.forwardMessages) return;
        if (action === 'update' && !this.forwardEdits) return;
        if (action === 'delete' && !this.forwardDeletes) return;
        if (!event.content && event.attachmentUrls.length === 0 && action !== 'delete') return;

        this._dispatchMessage(event).catch((err) => {
            this.stats.errors++;
            this.emitLog('warning', `Failed to mirror message ${event.id}.`, err instanceof Error ? err.message : String(err));
        });
    }

    /**
     * @param {string} channelId
     */
    _isTargetChannel(channelId) {
        for (const targetId of this.channelMap.values()) {
            if (targetId === channelId) return true;
        }
        return this.targetGuild?.channels?.cache?.has?.(channelId) === true
            && !this.sourceGuild?.channels?.cache?.has?.(channelId);
    }

    /**
     * @param {any} event
     */
    async _dispatchMessage(event) {
        if (!event.channelId) return;
        const targetChannel = this._resolveTargetChannel(event.channelId);
        if (!targetChannel) {
            this.emitLog('warning', `Skipping mirror for unmapped channel ${event.channelId}.`);
            return;
        }

        if (event.action === 'delete') {
            this.emitLog('info', `Message deleted in source (#${targetChannel.name || event.channelId}); delete mirrors are informational only.`);
            this.stats.messagesDeleted++;
            this.onStat('messagesDeleted');
            return;
        }

        const webhook = await this.adapter.getWebhook(targetChannel);
        const payload = {
            username: event.action === 'update'
                ? `${event.authorName} (edited)`
                : event.authorName,
            avatarURL: event.authorAvatar || undefined,
            content: event.content || undefined,
            files: event.attachmentUrls.length > 0 ? event.attachmentUrls : undefined
        };

        const sent = await this.adapter.sendWebhook(webhook, payload);
        if (sent?.id) this._rememberEcho(sent.id);

        if (event.action === 'update') {
            this.stats.messagesUpdated++;
            this.onStat('messagesUpdated');
        } else {
            this.stats.messagesForwarded++;
            this.onStat('messagesForwarded');
        }
    }

    /**
     * @param {string} id
     */
    _rememberEcho(id) {
        this._echoIds.add(id);
        if (this._echoIds.size > MAX_ECHO_MEMORY) {
            const first = this._echoIds.values().next().value;
            if (first) this._echoIds.delete(first);
        }
    }

    /**
     * @param {string} sourceChannelId
     */
    _resolveTargetChannel(sourceChannelId) {
        const mappedId = this.channelMap.get(sourceChannelId);
        const channels = this.targetGuild?.channels?.cache;

        if (mappedId) {
            const mapped = channels?.get?.(mappedId);
            if (mapped) return mapped;
        }

        const sourceChannel = this.sourceGuild?.channels?.cache?.get?.(sourceChannelId);
        if (sourceChannel) {
            const byName = channels?.find?.((/** @type {any} */ c) => c.name === sourceChannel.name && c.type === sourceChannel.type);
            if (byName) {
                this.channelMap.set(sourceChannelId, byName.id);
                return byName;
            }
        }
        return null;
    }

    /* --------------------------------------------------------------- structure */

    /**
     * @param {'channel'|'role'} kind
     * @param {string} action
     * @param {any} object
     */
    _queueStructure(kind, action, object) {
        if (!this.mirrorStructure || !object?.id) return;
        if (!this.sourceGuild?.id || object.guild?.id !== this.sourceGuild.id) return;

        const key = `${kind}:${object.id}`;
        this._pendingStructure.set(key, { kind, action, object });

        if (this._structureTimer) return;
        this._structureTimer = setTimeout(() => {
            this._structureTimer = null;
            const pending = Array.from(this._pendingStructure.values());
            this._pendingStructure.clear();
            this._flushStructure(pending).catch((err) => {
                this.stats.errors++;
                this.emitLog('warning', 'Structure sync failed.', err instanceof Error ? err.message : String(err));
            });
        }, this.options.structureDebounceMs ?? 1200);

        if (typeof this._structureTimer.unref === 'function') this._structureTimer.unref();
    }

    /**
     * @param {Array<{kind: string, action: string, object: any}>} pending
     */
    async _flushStructure(pending) {
        if (this.status !== 'running') return;

        for (const item of pending) {
            const spec = normalizeStructure(item.kind, item.object, item.action);
            if (!spec) continue;

            if (item.kind === 'channel') {
                await this._applyChannelChange(spec);
            } else {
                await this._applyRoleChange(spec);
            }
        }
        this.checkpoint();
    }

    /**
     * @param {any} spec
     */
    async _applyChannelChange(spec) {
        if (spec.action === 'delete') {
            const targetId = this.channelMap.get(spec.id);
            const channel = targetId ? this.targetGuild?.channels?.cache?.get?.(targetId) : null;
            if (channel) await this.adapter.deleteChannel(channel);
            this.channelMap.delete(spec.id);
            this.onStat('channelsSynced');
            this.emitLog('info', `Deleted mirrored channel #${spec.name}.`);
            return;
        }

        if (spec.action === 'update') {
            const targetId = this.channelMap.get(spec.id);
            const channel = targetId ? this.targetGuild?.channels?.cache?.get?.(targetId) : null;
            if (channel) {
                await this.adapter.updateChannel(channel, spec);
                this.onStat('channelsSynced');
                this.emitLog('info', `Updated mirrored channel #${spec.name}.`);
            }
            return;
        }

        const created = await this.adapter.createChannel(spec);
        if (created?.id) this.channelMap.set(spec.id, created.id);
        this.stats.channelsSynced++;
        this.onStat('channelsSynced');
        this.emitLog('success', `Created mirrored channel #${spec.name}.`);
    }

    /**
     * @param {any} spec
     */
    async _applyRoleChange(spec) {
        if (spec.managed) return; // Booster/integration roles cannot be cloned.

        if (spec.action === 'delete') {
            const targetId = this.roleMap.get(spec.id);
            const role = targetId ? this.targetGuild?.roles?.cache?.get?.(targetId) : null;
            if (role) await this.adapter.deleteRole(role);
            this.roleMap.delete(spec.id);
            this.onStat('rolesSynced');
            return;
        }

        if (spec.action === 'update') {
            const targetId = this.roleMap.get(spec.id);
            const role = targetId ? this.targetGuild?.roles?.cache?.get?.(targetId) : null;
            if (role) {
                await this.adapter.updateRole(role, spec);
                this.onStat('rolesSynced');
                this.emitLog('info', `Updated mirrored role ${spec.name}.`);
            }
            return;
        }

        const created = await this.adapter.createRole(spec);
        if (created?.id) this.roleMap.set(spec.id, created.id);
        this.stats.rolesSynced++;
        this.onStat('rolesSynced');
        this.emitLog('success', `Created mirrored role ${spec.name}.`);
    }
}

/**
 * @param {any} input
 */
export function createMirrorSession(input) {
    return new MirrorSession(input);
}

export { MIRRORED_GATEWAY_EVENTS };
