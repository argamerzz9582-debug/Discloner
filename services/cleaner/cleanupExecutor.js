/**
 * Cleaner Executor - Executes planned deletions with rate-limit pacing and cancellation support
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function executeCleanupPlan({
    targetGuild,
    plan,
    onProgress = () => {},
    onLog = () => {},
    isCancelled = () => false
}) {
    if (!plan || !plan.enabled || plan.mode === 'none') {
        return {
            status: 'SKIPPED',
            channels: { planned: 0, deleted: 0, failed: 0, skipped: 0 },
            roles: { planned: 0, deleted: 0, failed: 0, skipped: 0 }
        };
    }

    const checkCancelled = () => {
        if (isCancelled()) throw new Error('Cleanup operation was cancelled by user.');
    };

    const channelStats = {
        planned: plan.channelsToDelete.length,
        deleted: 0,
        failed: 0,
        skipped: plan.protectedChannels.length
    };

    const roleStats = {
        planned: plan.rolesToDelete.length,
        deleted: 0,
        failed: 0,
        skipped: plan.protectedRoles.length
    };

    onLog('info', `Executing cleanup (${channelStats.planned} channels, ${roleStats.planned} roles to purge)...`, null, 'cleaning_target');

    // 1. Delete Channels in controlled batches
    const CH_BATCH_SIZE = 3;
    for (let i = 0; i < plan.channelsToDelete.length; i += CH_BATCH_SIZE) {
        checkCancelled();
        const batch = plan.channelsToDelete.slice(i, i + CH_BATCH_SIZE);
        
        await Promise.allSettled(batch.map(async (item, idx) => {
            const ch = targetGuild.channels.cache.get(item.id);
            if (!ch) {
                channelStats.skipped++;
                return;
            }
            try {
                await ch.delete();
                channelStats.deleted++;
                const count = i + idx + 1;
                onProgress(
                    Math.round((count / Math.max(1, plan.channelsToDelete.length)) * 50),
                    count,
                    plan.channelsToDelete.length,
                    `Deleted #${item.name}`
                );
            } catch (err) {
                channelStats.failed++;
                onLog('warning', `Could not delete channel #${item.name}: ${err.message}`, null, 'cleaning_target');
            }
        }));

        await sleep(150); // slight rate-limit breathing room
    }

    // 2. Delete Custom Roles in controlled batches (lowest to highest position)
    const sortedRoles = [...plan.rolesToDelete].sort((a, b) => a.position - b.position);
    const ROLE_BATCH_SIZE = 3;

    for (let i = 0; i < sortedRoles.length; i += ROLE_BATCH_SIZE) {
        checkCancelled();
        const batch = sortedRoles.slice(i, i + ROLE_BATCH_SIZE);

        await Promise.allSettled(batch.map(async (item) => {
            const role = targetGuild.roles.cache.get(item.id);
            if (!role) {
                roleStats.skipped++;
                return;
            }
            try {
                await role.delete();
                roleStats.deleted++;
            } catch (err) {
                roleStats.failed++;
                onLog('warning', `Could not delete role @${item.name}: ${err.message}`, null, 'cleaning_target');
            }
        }));

        await sleep(150);
    }

    const hasFailures = channelStats.failed > 0 || roleStats.failed > 0;
    const allPlannedDeleted = (channelStats.deleted === channelStats.planned) && (roleStats.deleted === roleStats.planned);

    let status = 'SUCCESS';
    if (hasFailures && (channelStats.deleted > 0 || roleStats.deleted > 0)) {
        status = 'PARTIAL';
    } else if (hasFailures && channelStats.deleted === 0 && roleStats.deleted === 0 && (channelStats.planned > 0 || roleStats.planned > 0)) {
        status = 'FAILED';
    } else if (!allPlannedDeleted) {
        status = 'PARTIAL';
    }

    return {
        status,
        channels: channelStats,
        roles: roleStats
    };
}
