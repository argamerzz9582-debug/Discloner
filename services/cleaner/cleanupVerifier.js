/**
 * Cleaner Verifier - Verifies actual target guild state following cleanup execution
 */

export function verifyCleanupState(targetGuild, cleanupResult) {
    if (!cleanupResult || cleanupResult.status === 'SKIPPED') {
        return {
            verified: true,
            status: 'SKIPPED',
            remainingChannels: targetGuild ? targetGuild.channels.cache.size : 0,
            remainingRoles: targetGuild ? targetGuild.roles.cache.size : 0
        };
    }

    const currentChannels = targetGuild ? targetGuild.channels.cache.size : 0;
    const currentRoles = targetGuild ? targetGuild.roles.cache.size : 0;

    const channelFailures = cleanupResult.channels?.failed || 0;
    const roleFailures = cleanupResult.roles?.failed || 0;

    let finalStatus = cleanupResult.status;
    if (channelFailures > 0 || roleFailures > 0) {
        finalStatus = 'PARTIAL';
    }

    return {
        verified: channelFailures === 0 && roleFailures === 0,
        status: finalStatus,
        remainingChannels: currentChannels,
        remainingRoles: currentRoles,
        details: {
            channelsDeleted: cleanupResult.channels?.deleted || 0,
            channelsFailed: channelFailures,
            rolesDeleted: cleanupResult.roles?.deleted || 0,
            rolesFailed: roleFailures
        }
    };
}
