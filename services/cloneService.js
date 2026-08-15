import { createLogEntry } from '../utils/logger.js';
import { createDiscordClient, authenticateClient, destroyClient } from './discordService.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Executes a full Discord server cloning operation.
 *
 * @param {Object} params
 * @param {string} params.userToken
 * @param {string} params.sourceId
 * @param {string} params.targetId
 * @param {Object} params.options
 * @param {Function} params.onStage - (stage, label, progress) => void
 * @param {Function} params.onProgress - (percent, current, total, item) => void
 * @param {Function} params.onLog - (logEntry) => void
 * @param {Function} params.isCancelled - () => boolean
 * @returns {Promise<Object>} statistics
 */
export async function executeClone({
    userToken,
    sourceId,
    targetId,
    options,
    onStage = () => {},
    onProgress = () => {},
    onLog = () => {},
    isCancelled = () => false
}) {
    const startTime = Date.now();
    const stats = {
        rolesCreated: 0,
        categoriesCreated: 0,
        channelsCreated: 0,
        messagesCopied: 0,
        attachmentsCopied: 0,
        warningsCount: 0,
        durationMs: 0,
        sourceServerName: 'Unknown',
        targetServerName: 'Unknown'
    };

    const emitLog = (type, message, detail = null, stage = null) => {
        if (type === 'warning') stats.warningsCount++;
        onLog(createLogEntry(type, message, detail, stage));
    };

    let client = null;
    let activeWebhooks = [];

    const checkCancellation = () => {
        if (isCancelled()) {
            throw new Error('Operation was cancelled by user.');
        }
    };

    try {
        // 1. INITIALIZING
        onStage('initializing', 'Initializing Discord Client', 2);
        emitLog('info', 'Initializing secure client session...', null, 'initializing');
        client = createDiscordClient();

        // 2. AUTHENTICATING
        checkCancellation();
        onStage('authenticating', 'Authenticating with Discord', 6);
        emitLog('info', 'Authenticating credentials with Discord gateway...', null, 'authenticating');

        const user = await authenticateClient(client, userToken);
        emitLog('success', `Authenticated successfully as ${user.tag}`, null, 'authenticating');

        // 3. VALIDATING SERVERS
        checkCancellation();
        onStage('validating_servers', 'Detecting Source and Target Guilds', 12);
        emitLog('info', 'Searching for source & target servers in client cache...', null, 'validating_servers');

        const sourceGuild = client.guilds.cache.get(sourceId);
        const targetGuild = client.guilds.cache.get(targetId);

        if (!sourceGuild) {
            throw new Error(`Source server with ID (${sourceId}) was not found or the account does not have access.`);
        }
        if (!targetGuild) {
            throw new Error(`Target server with ID (${targetId}) was not found or the account is not joined.`);
        }

        stats.sourceServerName = sourceGuild.name;
        stats.targetServerName = targetGuild.name;

        emitLog('success', `Source server confirmed: "${sourceGuild.name}" (${sourceGuild.memberCount || 'N/A'} members)`, null, 'validating_servers');
        emitLog('success', `Target server confirmed: "${targetGuild.name}"`, null, 'validating_servers');

        // 4. READING SOURCE
        checkCancellation();
        onStage('reading_source', 'Reading Source Guild Structure', 18);
        emitLog('info', 'Fetching roles, channels, and guild configuration...', null, 'reading_source');

        try {
            await Promise.all([
                sourceGuild.roles.fetch().catch(() => {}),
                sourceGuild.channels.fetch().catch(() => {})
            ]);
        } catch (fetchErr) {
            emitLog('warning', 'Could not pre-fetch full guild cache, using existing cached structure.', fetchErr.message, 'reading_source');
        }

        // 5. CLEANING TARGET
        if (options.cleanTarget) {
            checkCancellation();
            onStage('cleaning_target', 'Cleaning Target Server Structure', 25);
            emitLog('info', 'Cleaning existing channels & custom roles in target server...', null, 'cleaning_target');

            const targetChannels = Array.from(targetGuild.channels.cache.values());
            for (let i = 0; i < targetChannels.length; i++) {
                checkCancellation();
                const ch = targetChannels[i];
                try {
                    await ch.delete();
                    onProgress(25 + Math.round((i / Math.max(1, targetChannels.length)) * 5), i + 1, targetChannels.length, `Deleted #${ch.name}`);
                } catch (delErr) {
                    emitLog('warning', `Skipped deleting channel #${ch.name}: ${delErr.message}`, null, 'cleaning_target');
                }
            }

            const targetRoles = Array.from(targetGuild.roles.cache.values());
            for (let i = 0; i < targetRoles.length; i++) {
                checkCancellation();
                const role = targetRoles[i];
                if (role.editable && role.name !== '@everyone' && !role.managed) {
                    try {
                        await role.delete();
                    } catch (rErr) {
                        emitLog('warning', `Skipped deleting role @${role.name}: ${rErr.message}`, null, 'cleaning_target');
                    }
                }
            }
            emitLog('success', 'Target server structure cleaned successfully.', null, 'cleaning_target');
        }

        // 6. CLONING SERVER PROFILE
        if (options.cloneProfile) {
            checkCancellation();
            onStage('cloning_profile', 'Cloning Server Profile & Branding', 35);
            emitLog('info', 'Synchronizing server name and visual assets...', null, 'cloning_profile');

            try {
                if (targetGuild.name !== sourceGuild.name) {
                    await targetGuild.setName(sourceGuild.name);
                    emitLog('success', `Updated server name to "${sourceGuild.name}"`, null, 'cloning_profile');
                }
            } catch (nameErr) {
                emitLog('warning', 'Failed to update server name', nameErr.message, 'cloning_profile');
            }

            const iconUrl = sourceGuild.iconURL({ dynamic: true, size: 4096 });
            if (iconUrl) {
                try {
                    await targetGuild.setIcon(iconUrl);
                    emitLog('success', 'Synchronized server icon asset', null, 'cloning_profile');
                } catch (iconErr) {
                    emitLog('warning', 'Could not apply server icon', iconErr.message, 'cloning_profile');
                }
            }

            const bannerUrl = sourceGuild.bannerURL ? sourceGuild.bannerURL({ size: 4096 }) : null;
            if (bannerUrl) {
                try {
                    await targetGuild.setBanner(bannerUrl);
                    emitLog('success', 'Synchronized server banner asset', null, 'cloning_profile');
                } catch (bannerErr) {
                    emitLog('warning', 'Could not apply server banner (tier requirement or permission issue)', bannerErr.message, 'cloning_profile');
                }
            }
        }

        // 7. CLONING ROLES
        const roleMap = new Map(); // sourceRoleId -> targetRoleId
        if (options.cloneRoles) {
            checkCancellation();
            onStage('cloning_roles', 'Cloning Roles & Permissions', 45);
            emitLog('info', 'Cloning role hierarchy and base permissions...', null, 'cloning_roles');

            const sourceRoles = Array.from(sourceGuild.roles.cache.values())
                .filter(r => !r.managed)
                .sort((a, b) => a.position - b.position);

            const totalRoles = sourceRoles.length;
            let roleIdx = 0;

            for (const role of sourceRoles) {
                checkCancellation();
                roleIdx++;
                const currentPct = 45 + Math.round((roleIdx / Math.max(1, totalRoles)) * 15);
                onProgress(currentPct, roleIdx, totalRoles, `@${role.name}`);

                if (role.name === '@everyone') {
                    const targetEveryone = targetGuild.roles.cache.find(r => r.name === '@everyone');
                    if (targetEveryone) {
                        try {
                            await targetEveryone.setPermissions(role.permissions);
                            roleMap.set(role.id, targetEveryone.id);
                        } catch (permErr) {
                            emitLog('warning', 'Could not set @everyone base permissions', permErr.message, 'cloning_roles');
                        }
                    }
                    continue;
                }

                try {
                    const newRole = await targetGuild.roles.create({
                        name: role.name,
                        color: role.color,
                        hoist: role.hoist,
                        permissions: role.permissions,
                        mentionable: role.mentionable
                    });
                    if (newRole) {
                        roleMap.set(role.id, newRole.id);
                        stats.rolesCreated++;
                        emitLog('success', `Created role @${role.name}`, null, 'cloning_roles');
                    }
                } catch (rCreateErr) {
                    emitLog('warning', `Failed to create role @${role.name}`, rCreateErr.message, 'cloning_roles');
                }
            }
            emitLog('success', `Finished cloning roles (${stats.rolesCreated} custom roles created).`, null, 'cloning_roles');
        }

        // 8. CLONING CATEGORIES
        const catMap = new Map(); // sourceCatId -> targetCatId
        if (options.cloneChannels) {
            checkCancellation();
            onStage('cloning_categories', 'Cloning Category Hierarchy', 62);
            emitLog('info', 'Building category containers...', null, 'cloning_categories');

            const sourceCategories = Array.from(sourceGuild.channels.cache.values())
                .filter(c => c.type === 'GUILD_CATEGORY')
                .sort((a, b) => a.position - b.position);

            const totalCats = sourceCategories.length;
            let catIdx = 0;

            for (const cat of sourceCategories) {
                checkCancellation();
                catIdx++;
                const currentPct = 62 + Math.round((catIdx / Math.max(1, totalCats)) * 8);
                onProgress(currentPct, catIdx, totalCats, `📁 ${cat.name}`);

                try {
                    const newCat = await targetGuild.channels.create(cat.name, {
                        type: 'GUILD_CATEGORY',
                        position: cat.position
                    });
                    if (newCat) {
                        catMap.set(cat.id, newCat.id);
                        stats.categoriesCreated++;
                        emitLog('success', `Created category [${cat.name}]`, null, 'cloning_categories');
                    }
                } catch (catErr) {
                    emitLog('warning', `Failed to create category [${cat.name}]`, catErr.message, 'cloning_categories');
                }
            }
        }

        // 9. CLONING CHANNELS
        const channelMap = new Map(); // sourceChannelId -> targetChannel (Discord Channel object)
        if (options.cloneChannels) {
            checkCancellation();
            onStage('cloning_channels', 'Building Guild Channels', 70);
            emitLog('info', 'Creating text, voice, and announcement channels...', null, 'cloning_channels');

            const sourceChannels = Array.from(sourceGuild.channels.cache.values())
                .filter(c => c.type !== 'GUILD_CATEGORY')
                .sort((a, b) => a.position - b.position);

            const totalChans = sourceChannels.length;
            let chIdx = 0;

            for (const ch of sourceChannels) {
                checkCancellation();
                chIdx++;
                const currentPct = 70 + Math.round((chIdx / Math.max(1, totalChans)) * 12);
                onProgress(currentPct, chIdx, totalChans, `#${ch.name}`);

                const parentId = ch.parentId ? catMap.get(ch.parentId) : null;
                const channelOptions = {
                    type: ch.type,
                    topic: ch.topic || undefined,
                    nsfw: Boolean(ch.nsfw),
                    bitrate: ch.bitrate || undefined,
                    userLimit: ch.userLimit || undefined,
                    parent: parentId || undefined,
                    position: ch.position
                };

                try {
                    const newChannel = await targetGuild.channels.create(ch.name, channelOptions);
                    if (newChannel) {
                        channelMap.set(ch.id, newChannel);
                        stats.channelsCreated++;
                        emitLog('success', `Created channel #${ch.name}`, null, 'cloning_channels');
                    }
                } catch (chErr) {
                    // Try fallback without custom bitrate/topic if failed
                    try {
                        const fallbackChannel = await targetGuild.channels.create(ch.name, {
                            type: ch.type === 'GUILD_VOICE' ? 'GUILD_VOICE' : 'GUILD_TEXT',
                            parent: parentId || undefined
                        });
                        if (fallbackChannel) {
                            channelMap.set(ch.id, fallbackChannel);
                            stats.channelsCreated++;
                            emitLog('warning', `Created channel #${ch.name} with standard fallback parameters`, chErr.message, 'cloning_channels');
                        }
                    } catch (fallbackErr) {
                        emitLog('warning', `Could not create channel #${ch.name}`, fallbackErr.message, 'cloning_channels');
                    }
                }
            }
            emitLog('success', `Finished building channels (${stats.channelsCreated} channels created).`, null, 'cloning_channels');
        }

        // 10. APPLYING PERMISSION OVERWRITES
        if (options.clonePermissions && (options.cloneRoles || options.cloneChannels)) {
            checkCancellation();
            onStage('applying_permissions', 'Applying Channel Permission Overwrites', 84);
            emitLog('info', 'Configuring channel privacy & role overwrites...', null, 'applying_permissions');

            let overwriteCount = 0;
            for (const [sourceChId, targetCh] of channelMap.entries()) {
                checkCancellation();
                const sourceCh = sourceGuild.channels.cache.get(sourceChId);
                if (!sourceCh || !sourceCh.permissionOverwrites) continue;

                const newOverwrites = [];
                for (const [id, overwrite] of sourceCh.permissionOverwrites.cache.entries()) {
                    let targetIdResolved = null;
                    if (overwrite.type === 'role') {
                        targetIdResolved = roleMap.get(id);
                    }
                    if (targetIdResolved) {
                        newOverwrites.push({
                            id: targetIdResolved,
                            type: overwrite.type,
                            allow: overwrite.allow,
                            deny: overwrite.deny
                        });
                    }
                }

                if (newOverwrites.length > 0 && targetCh.permissionOverwrites) {
                    try {
                        await targetCh.permissionOverwrites.set(newOverwrites);
                        overwriteCount++;
                    } catch (permErr) {
                        emitLog('warning', `Failed to apply permissions to #${targetCh.name}`, permErr.message, 'applying_permissions');
                    }
                }
            }
            emitLog('success', `Applied permission overrides across ${overwriteCount} channels.`, null, 'applying_permissions');
        }

        // 11. CLONING MESSAGES
        if (options.cloneMessages && options.cloneChannels && channelMap.size > 0) {
            checkCancellation();
            const limit = options.msgLimit || 15;
            const delay = options.msgDelay || 1000;

            onStage('cloning_messages', `Cloning Message History (Up to ${limit}/channel)`, 90);
            emitLog('info', `Syncing recent chat history via secure Webhooks (${limit} msgs/channel)...`, null, 'cloning_messages');

            const textChannelsToSync = Array.from(channelMap.entries()).filter(([srcId, tgtCh]) => {
                const src = sourceGuild.channels.cache.get(srcId);
                return src && src.isText() && tgtCh && tgtCh.isText();
            });

            let syncedChannelsCount = 0;
            const totalTextChannels = textChannelsToSync.length;

            for (const [srcId, targetChannel] of textChannelsToSync) {
                checkCancellation();
                syncedChannelsCount++;
                const sourceChannel = sourceGuild.channels.cache.get(srcId);
                onProgress(
                    90 + Math.round((syncedChannelsCount / Math.max(1, totalTextChannels)) * 8),
                    syncedChannelsCount,
                    totalTextChannels,
                    `Syncing messages in #${targetChannel.name}`
                );

                try {
                    const messages = await sourceChannel.messages.fetch({ limit }).catch(() => null);
                    if (messages && messages.size > 0) {
                        let webhook = null;
                        try {
                            webhook = await targetChannel.createWebhook('MigrationSync', {
                                avatar: client.user.displayAvatarURL({ format: 'png' })
                            });
                            activeWebhooks.push(webhook);
                        } catch (whErr) {
                            emitLog('warning', `Could not create webhook in #${targetChannel.name} (Missing Manage Webhooks permission)`, whErr.message, 'cloning_messages');
                            continue;
                        }

                        const msgArray = Array.from(messages.values()).reverse();
                        for (const msg of msgArray) {
                            checkCancellation();
                            if (msg.content || (options.cloneAttachments && msg.attachments.size > 0)) {
                                const files = options.cloneAttachments 
                                    ? msg.attachments.map(a => a.url)
                                    : [];

                                try {
                                    await webhook.send({
                                        content: msg.content || ' ',
                                        username: msg.author ? msg.author.username.substring(0, 32) : 'User',
                                        avatarURL: msg.author ? msg.author.displayAvatarURL({ dynamic: true }) : undefined,
                                        files: files.slice(0, 10)
                                    });
                                    stats.messagesCopied++;
                                    stats.attachmentsCopied += files.length;
                                    await sleep(delay);
                                } catch (sendErr) {
                                    emitLog('warning', `Failed to copy message from ${msg.author?.username || 'user'}`, sendErr.message, 'cloning_messages');
                                }
                            }
                        }

                        try {
                            await webhook.delete();
                            activeWebhooks = activeWebhooks.filter(w => w.id !== webhook.id);
                        } catch {
                            // ignore webhook deletion error
                        }
                    }
                } catch (chMsgErr) {
                    emitLog('warning', `Could not fetch messages from #${sourceChannel.name}`, chMsgErr.message, 'cloning_messages');
                }
            }
            emitLog('success', `Message history sync finished (${stats.messagesCopied} messages cloned).`, null, 'cloning_messages');
        }

        // 12. COMPLETED
        onStage('completed', 'Migration Completed Successfully', 100);
        onProgress(100, 1, 1, 'Completed');
        stats.durationMs = Date.now() - startTime;

        emitLog('success', `All migration stages completed in ${(stats.durationMs / 1000).toFixed(1)}s`, null, 'completed');
        return stats;

    } catch (err) {
        stats.durationMs = Date.now() - startTime;
        // Clean any dangling webhooks created in this run
        for (const wh of activeWebhooks) {
            try { await wh.delete(); } catch {}
        }
        throw err;
    } finally {
        destroyClient(client);
        client = null;
    }
}
