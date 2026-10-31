/**
 * Internationalisation foundation.
 *
 * English is the only shipped catalogue today. Every user-facing string added
 * from now on goes through `t()` so adding a locale is a data change, not a
 * refactor. Missing keys fall back to English and then to the key itself, which
 * makes omissions obvious in development without breaking the UI.
 */

/** @type {Record<string, Record<string, string>>} */
export const catalogues = {
    en: {
        'app.tagline': 'Server clone & migration',
        'mode.clone': 'One-shot clone',
        'mode.clone.desc': 'Copy structure once, then finish.',
        'mode.mirror': 'Continuous mirror',
        'mode.mirror.desc': 'Keep forwarding new activity live.',
        'mode.note.clone': 'One-shot',
        'mode.note.mirror': 'Live mirror',

        'action.start.clone': 'START CLONING',
        'action.start.mirror': 'START MIRRORING',
        'action.starting': 'STARTING…',
        'action.pause': 'Pause',
        'action.resume': 'Resume',
        'action.stop': 'Stop',
        'action.cancel': 'Cancel',
        'action.dismiss': 'Dismiss',
        'action.resumeFromCheckpoint': 'Resume from checkpoint',
        'action.startFresh': 'Start fresh',
        'action.retry': 'Try again',

        'state.connecting': 'Connecting…',
        'state.connected': 'Connected',
        'state.offline': 'Offline',
        'state.queued': 'Queued',
        'state.running': 'Running',
        'state.paused': 'Paused',
        'state.completed': 'Completed',
        'state.failed': 'Failed',
        'state.cancelled': 'Stopped',
        'state.interrupted': 'Interrupted',

        'empty.noActivity': 'No activity yet',
        'empty.noActivityDesc': 'Log output will stream here once a job starts.',
        'empty.noMatch': 'No matching activity',
        'empty.noMatchDesc': 'Adjust the severity filter or clear the search to see entries.',
        'empty.queue': 'No queued jobs',
        'empty.queueDesc': 'Queued and recent jobs appear here with live position and estimated wait.',

        'recovery.title': 'Job needs attention',
        'recovery.recoverable': 'This failure is recoverable — completed work is saved.',
        'recovery.fatal': 'This failure cannot be resumed automatically.',

        'toast.tokenRemembered': 'Token will be remembered on this device.',
        'toast.tokenCleared': 'Stored token removed from this browser.',
        'toast.configSaved': 'Preferences saved.',
        'toast.configReset': 'Restored default preferences.',
        'toast.copied': 'Activity logs copied.',
        'toast.copyFailed': 'Could not copy logs to the clipboard.',
        'toast.nothingToCopy': 'No logs to copy yet.',
        'toast.queued': 'Job queued.',
        'toast.paused': 'Job paused.',
        'toast.resumed': 'Job resumed.',
        'toast.cancelled': 'Job stopped.',
        'toast.reconnected': 'Reconnected to the running job.',

        'error.tokenRequired': 'Enter your Discord authorization token.',
        'error.sourceRequired': 'Provide a valid 17–20 digit source server ID.',
        'error.targetRequired': 'Provide a valid 17–20 digit target server ID.',
        'error.sameServer': 'Source and target servers cannot be identical.',

        'queue.meta': '{running} running · {queued} queued · up to {limit} at once',
        'queue.position': 'Position {position}',
        'queue.eta': '≈ {eta} wait'
    }
};

let activeLocale = 'en';

/**
 * @param {string} locale
 */
export function setLocale(locale) {
    if (catalogues[locale]) activeLocale = locale;
}

export function getLocale() {
    return activeLocale;
}

/**
 * @param {string} key
 * @param {Record<string, string|number>} [vars]
 */
export function t(key, vars = {}) {
    const template = catalogues[activeLocale]?.[key] ?? catalogues.en[key] ?? key;
    return template.replace(/\{(\w+)\}/g, (match, name) =>
        Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
    );
}

export function hasKey(key) {
    return Boolean(catalogues.en[key]);
}
