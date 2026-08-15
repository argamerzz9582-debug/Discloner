/**
 * Cleaner Policy & Protected Resource Rules
 */

import { CLEANUP_MODES } from '../configContract.js';

export class CleanerPolicy {
    constructor(mode = CLEANUP_MODES.NONE, options = {}) {
        this.mode = mode;
        this.options = options;
    }

    /**
     * Determines whether a role is protected from deletion.
     * @param {Object} role - Discord Role object
     * @param {Object} context - { clientUserId, clientHighestRolePosition }
     * @returns {{ protected: boolean, reason?: string }}
     */
    isRoleProtected(role, context = {}) {
        if (!role) {
            return { protected: true, reason: 'Invalid role object' };
        }

        // @everyone cannot and must not be deleted
        if (role.name === '@everyone' || role.id === role.guild?.id) {
            return { protected: true, reason: 'System role (@everyone) cannot be deleted' };
        }

        // Managed roles (bots, integrations, nitro booster) cannot be deleted manually
        if (role.managed) {
            return { protected: true, reason: 'Managed integration role' };
        }

        // Discord client cannot delete roles higher or equal to its highest role unless server owner
        if (context.clientHighestRolePosition !== undefined && role.position >= context.clientHighestRolePosition) {
            if (!context.isOwner) {
                return { protected: true, reason: 'Role position is higher than or equal to client role hierarchy' };
            }
        }

        if (role.editable === false) {
            return { protected: true, reason: 'Role is marked non-editable by client' };
        }

        return { protected: false };
    }

    /**
     * Determines whether a channel is protected from deletion.
     * @param {Object} channel - Discord Channel object
     * @param {Object} context - { systemChannelId, rulesChannelId, publicUpdatesChannelId }
     * @returns {{ protected: boolean, reason?: string }}
     */
    isChannelProtected(channel, context = {}) {
        if (!channel) {
            return { protected: true, reason: 'Invalid channel object' };
        }

        // Check if channel is deletable by the client
        if (channel.deletable === false) {
            return { protected: true, reason: 'Channel is marked non-deletable by client permissions' };
        }

        // If in MANAGED mode, only delete if managed by previous migration manifest
        if (this.mode === CLEANUP_MODES.MANAGED) {
            const isManaged = context.manifestChannelIds?.has(channel.id);
            if (!isManaged) {
                return { protected: true, reason: 'Unmanaged resource (MANAGED mode)' };
            }
        }

        return { protected: false };
    }
}
