/**
 * Input Validation & Normalization Service
 */

const SNOWFLAKE_REGEX = /^[0-9]{17,20}$/;

export function validateSnowflake(id, fieldName = 'ID') {
    if (!id || typeof id !== 'string' && typeof id !== 'number') {
        return { valid: false, error: `${fieldName} is required.` };
    }
    const cleanId = String(id).trim();
    if (!SNOWFLAKE_REGEX.test(cleanId)) {
        return { 
            valid: false, 
            error: `${fieldName} must be a valid 17-20 digit Discord Snowflake ID.` 
        };
    }
    return { valid: true, value: cleanId };
}

export function validateToken(token) {
    if (!token || typeof token !== 'string') {
        return { valid: false, error: 'Discord authentication token is required.' };
    }
    const cleanToken = token.trim();
    if (cleanToken.length < 20) {
        return { valid: false, error: 'The provided token appears too short or invalid.' };
    }
    return { valid: true, value: cleanToken };
}

export function normalizeCloneOptions(options = {}) {
    const rawLimit = parseInt(options.msgLimit, 10);
    const msgLimit = isNaN(rawLimit) ? 15 : Math.max(1, Math.min(100, rawLimit));

    const rawDelay = parseInt(options.msgDelay, 10);
    const msgDelay = isNaN(rawDelay) ? 1000 : Math.max(200, Math.min(5000, rawDelay));

    const cloneMessages = Boolean(options.cloneMessages);
    const cloneAttachments = cloneMessages ? Boolean(options.cloneAttachments) : false;

    return {
        cloneRoles: options.cloneRoles !== false,
        cloneChannels: options.cloneChannels !== false,
        clonePermissions: options.clonePermissions !== false,
        cloneMessages,
        cloneAttachments,
        cloneProfile: options.cloneProfile !== false,
        cleanTarget: options.cleanTarget !== false,
        msgLimit,
        msgDelay
    };
}

export function validateClonePayload(payload) {
    if (!payload || typeof payload !== 'object') {
        return { valid: false, error: 'Invalid request payload.' };
    }

    const tokenRes = validateToken(payload.userToken);
    if (!tokenRes.valid) return tokenRes;

    const sourceRes = validateSnowflake(payload.sourceId, 'Source Server ID');
    if (!sourceRes.valid) return sourceRes;

    const targetRes = validateSnowflake(payload.targetId, 'Target Server ID');
    if (!targetRes.valid) return targetRes;

    if (sourceRes.value === targetRes.value) {
        return { 
            valid: false, 
            error: 'Source and Target Server IDs cannot be identical.' 
        };
    }

    return {
        valid: true,
        userToken: tokenRes.value,
        sourceId: sourceRes.value,
        targetId: targetRes.value,
        options: normalizeCloneOptions(payload.options)
    };
}
