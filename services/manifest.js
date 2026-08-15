/**
 * Migration Manifest & Ownership Tracking
 * Maintains in-memory session tracking of created resources for verification and managed lifecycle
 */

export class MigrationManifest {
    constructor(sourceGuildId, targetGuildId, options = {}) {
        this.migrationId = 'mig_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
        this.sourceGuildId = sourceGuildId;
        this.targetGuildId = targetGuildId;
        this.options = options;
        this.startTime = Date.now();
        this.endTime = null;

        // Resource mappings: Source ID -> Target ID
        this.roleMap = new Map();
        this.categoryMap = new Map();
        this.channelMap = new Map();
        this.messageMap = new Map();

        // Created resource IDs on target
        this.createdRoleIds = new Set();
        this.createdCategoryIds = new Set();
        this.createdChannelIds = new Set();

        // Itemized records
        this.roles = { planned: 0, created: 0, skipped: 0, failed: 0, items: [] };
        this.categories = { planned: 0, created: 0, skipped: 0, failed: 0, items: [] };
        this.channels = { planned: 0, created: 0, skipped: 0, failed: 0, items: [] };
        this.permissions = { planned: 0, applied: 0, skipped: 0, failed: 0 };
        this.messages = { planned: 0, copied: 0, skipped: 0, failed: 0 };
        this.attachments = { planned: 0, copied: 0, skipped: 0, failed: 0 };

        this.warnings = [];
        this.errors = [];
    }

    recordRole(sourceRole, targetRole, status = 'created', error = null) {
        if (targetRole) {
            this.roleMap.set(sourceRole.id, targetRole.id);
            this.createdRoleIds.add(targetRole.id);
        }
        if (status === 'created') this.roles.created++;
        else if (status === 'skipped') this.roles.skipped++;
        else if (status === 'failed') this.roles.failed++;

        this.roles.items.push({
            sourceId: sourceRole.id,
            sourceName: sourceRole.name,
            targetId: targetRole?.id || null,
            status,
            error: error ? error.message : null
        });
    }

    recordCategory(sourceCat, targetCat, status = 'created', error = null) {
        if (targetCat) {
            this.categoryMap.set(sourceCat.id, targetCat.id);
            this.createdCategoryIds.add(targetCat.id);
        }
        if (status === 'created') this.categories.created++;
        else if (status === 'skipped') this.categories.skipped++;
        else if (status === 'failed') this.categories.failed++;

        this.categories.items.push({
            sourceId: sourceCat.id,
            sourceName: sourceCat.name,
            targetId: targetCat?.id || null,
            status,
            error: error ? error.message : null
        });
    }

    recordChannel(sourceCh, targetCh, status = 'created', error = null) {
        if (targetCh) {
            this.channelMap.set(sourceCh.id, targetCh.id);
            this.createdChannelIds.add(targetCh.id);
        }
        if (status === 'created') this.channels.created++;
        else if (status === 'skipped') this.channels.skipped++;
        else if (status === 'failed') this.channels.failed++;

        this.channels.items.push({
            sourceId: sourceCh.id,
            sourceName: sourceCh.name,
            type: sourceCh.type,
            targetId: targetCh?.id || null,
            status,
            error: error ? error.message : null
        });
    }

    recordPermission(applied = true, detail = null) {
        if (applied) this.permissions.applied++;
        else this.permissions.skipped++;
    }

    recordMessage(copied = true) {
        if (copied) this.messages.copied++;
        else this.messages.skipped++;
    }

    recordAttachment(copied = true) {
        if (copied) this.attachments.copied++;
        else this.attachments.skipped++;
    }

    getSummary() {
        return {
            migrationId: this.migrationId,
            sourceGuildId: this.sourceGuildId,
            targetGuildId: this.targetGuildId,
            rolesCreated: this.roles.created,
            categoriesCreated: this.categories.created,
            channelsCreated: this.channels.created,
            permissionsApplied: this.permissions.applied,
            messagesCopied: this.messages.copied,
            attachmentsCopied: this.attachments.copied,
            warningsCount: this.warnings.length,
            errorsCount: this.errors.length
        };
    }

    addWarning(message, detail = null) {
        this.warnings.push({ message, detail, timestamp: new Date().toISOString() });
    }

    addError(message, code = null, detail = null) {
        this.errors.push({ message, code, detail, timestamp: new Date().toISOString() });
    }

    finalize() {
        this.endTime = Date.now();
        return {
            migrationId: this.migrationId,
            sourceGuildId: this.sourceGuildId,
            targetGuildId: this.targetGuildId,
            durationMs: this.endTime - this.startTime,
            roles: this.roles,
            categories: this.categories,
            channels: this.channels,
            permissions: this.permissions,
            messages: this.messages,
            attachments: this.attachments,
            warningsCount: this.warnings.length,
            errorsCount: this.errors.length
        };
    }
}
