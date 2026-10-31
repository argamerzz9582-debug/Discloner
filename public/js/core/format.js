/** Formatting helpers shared by the progress, queue and console views. */

/**
 * @param {number} ms
 */
export function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '—';

    const totalSeconds = Math.round(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * @param {number} ms
 */
export function formatWait(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return '—';
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * @param {string|number} value
 */
export function pad2(value) {
    return String(value).padStart(2, '0');
}

/**
 * @param {Date} [date]
 */
export function formatClock(date = new Date()) {
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

/**
 * Maps a server stage id onto one of the four pipeline phases.
 * @param {string} stage
 */
export function stageToPhase(stage) {
    switch (stage) {
        case 'initializing':
        case 'authenticating':
        case 'validating_servers':
        case 'reading_source':
        case 'cleaning_target':
            return 'prepare';
        case 'cloning_profile':
        case 'cloning_emojis':
        case 'cloning_stickers':
        case 'cloning_roles':
        case 'cloning_categories':
        case 'cloning_channels':
        case 'applying_permissions':
            return 'structure';
        case 'cloning_webhooks':
        case 'cloning_messages':
        case 'mirroring':
            return 'content';
        case 'verifying':
        case 'completed':
            return 'verify';
        default:
            return 'prepare';
    }
}

export const PHASE_ORDER = ['prepare', 'structure', 'content', 'verify'];
