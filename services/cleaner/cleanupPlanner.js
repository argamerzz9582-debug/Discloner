/**
 * Cleaner Planner - Inspects target guild and generates a safe cleanup preview
 */

import { CLEANUP_MODES } from '../configContract.js';
import { CleanerPolicy } from './cleanerPolicy.js';

export function createCleanupPlan(targetGuild, mode = CLEANUP_MODES.NONE, options = {}) {
    if (!targetGuild) {
        throw new Error('Target guild is required to plan cleanup.');
    }

    if (mode === CLEANUP_MODES.NONE) {
        return {
            mode: CLEANUP_MODES.NONE,
            enabled: false,
            summary: {
                channelsToDeleteCount: 0,
                rolesToDeleteCount: 0,
                protectedChannelsCount: 0,
                protectedRolesCount: 0
            },
            channelsToDelete: [],
            rolesToDelete: [],
            protectedChannels: [],
            protectedRoles: []
        };
    }

    const policy = new CleanerPolicy(mode, options);
    
    // Resolve context
    const clientMember = targetGuild.members?.me || targetGuild.me;
    const isOwner = clientMember?.id === targetGuild.ownerId;
    const clientHighestRolePosition = clientMember?.roles?.highest?.position ?? 0;

    const context = {
        isOwner,
        clientHighestRolePosition,
        systemChannelId: targetGuild.systemChannelId,
        rulesChannelId: targetGuild.rulesChannelId,
        publicUpdatesChannelId: targetGuild.publicUpdatesChannelId,
        manifestChannelIds: options.manifestChannelIds || new Set(),
        manifestRoleIds: options.manifestRoleIds || new Set()
    };

    // Analyze channels
    const channelsToDelete = [];
    const protectedChannels = [];
    const allChannels = Array.from(targetGuild.channels.cache.values());

    for (const ch of allChannels) {
        const check = policy.isChannelProtected(ch, context);
        if (check.protected) {
            protectedChannels.push({
                id: ch.id,
                name: ch.name,
                type: ch.type,
                reason: check.reason
            });
        } else {
            channelsToDelete.push({
                id: ch.id,
                name: ch.name,
                type: ch.type
            });
        }
    }

    // Analyze roles
    const rolesToDelete = [];
    const protectedRoles = [];
    const allRoles = Array.from(targetGuild.roles.cache.values());

    for (const role of allRoles) {
        const check = policy.isRoleProtected(role, context);
        if (check.protected) {
            protectedRoles.push({
                id: role.id,
                name: role.name,
                position: role.position,
                reason: check.reason
            });
        } else {
            rolesToDelete.push({
                id: role.id,
                name: role.name,
                position: role.position
            });
        }
    }

    return {
        mode,
        enabled: true,
        summary: {
            channelsToDeleteCount: channelsToDelete.length,
            rolesToDeleteCount: rolesToDelete.length,
            protectedChannelsCount: protectedChannels.length,
            protectedRolesCount: protectedRoles.length
        },
        channelsToDelete,
        rolesToDelete,
        protectedChannels,
        protectedRoles
    };
}
