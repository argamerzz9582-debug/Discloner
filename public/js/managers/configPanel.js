import { byId, setHidden, setText, all, prefersReducedMotion } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { readJSON, writeJSON, remove, KEYS } from '../services/storage.js';

/**
 * Mirrors `services/configContract.js` DEFAULT_CONFIG for the options the UI
 * exposes. Kept as plain data so presets can spread over it.
 */
export const DEFAULT_OPTIONS = Object.freeze({
    cloneRoles: true,
    cloneChannels: true,
    clonePermissions: true,
    cloneProfile: true,
    cloneEmojis: true,
    cloneStickers: true,
    cloneWebhooks: true,
    cloneMessages: false,
    cloneAttachments: false,
    cleanTarget: true,
    msgLimit: 15,
    msgDelay: 1000,
    mirrorMessages: true,
    mirrorEdits: false,
    mirrorDeletes: false,
    mirrorStructure: true
});

export const PRESETS = Object.freeze({
    standard: {
        label: 'Full server architecture',
        options: { ...DEFAULT_OPTIONS }
    },
    'complete-archive': {
        label: 'Complete archive',
        options: { ...DEFAULT_OPTIONS, cloneMessages: true, cloneAttachments: true, msgLimit: 500, msgDelay: 750 }
    },
    'roles-only': {
        label: 'Roles & permissions only',
        options: { ...DEFAULT_OPTIONS, cloneChannels: false, cloneMessages: false, cloneAttachments: false }
    }
});

const TOGGLE_FIELDS = [
    'cleanTarget',
    'cloneRoles',
    'cloneChannels',
    'clonePermissions',
    'cloneProfile',
    'cloneEmojis',
    'cloneStickers',
    'cloneWebhooks',
    'cloneMessages',
    'cloneAttachments',
    'mirrorMessages',
    'mirrorEdits',
    'mirrorDeletes',
    'mirrorStructure'
];

const RANGE_FIELDS = ['msgLimit', 'msgDelay'];

/**
 * ConfigPanel owns every option input, the advanced drawer, presets and the
 * saved-preferences round trip. It exposes `getOptions()` for the controller
 * and emits `onDirty` whenever the effective option set changes.
 */
export class ConfigPanel {
    /** @param {{ onDirty?: (options: any) => void, toast?: any }} [options] */
    constructor(options = {}) {
        this.toast = options.toast;
        this.onDirty = options.onDirty || (() => {});

        /** @type {Record<string, any>} */
        this.options = { ...DEFAULT_OPTIONS };
        this.mode = 'clone';

        this.advancedToggle = byId('advancedToggleBtn');
        this.advancedPanel = byId('advancedPanel');
        this.advancedChevron = byId('advancedChevron');
        this.advancedSummary = byId('advancedSummary');

        this.messageDrawer = byId('messageSettingsDrawer');
        this.mirrorOptions = byId('mirrorOptions');
        this.modeNote = byId('modeNote');

        this.saveBtn = byId('saveConfigBtn');
        this.resetBtn = byId('resetConfigBtn');
        this.savedBadge = byId('configSavedBadge');

        this.bindToggles();
        this.bindRanges();
        this.bindAdvanced();
        this.bindModeSwitch();
        this.bindPresets();
        this.bindPersistence();

        const saved = readJSON(KEYS.config, null);
        if (saved) {
            this.applyOptions(saved, { announce: false });
            this.showSavedBadge('Saved preferences restored');
        } else {
            this.syncInputs();
        }

        this.updateMessageDependency();
        this.updateSummaries();
    }

    /* ------------------------------------------------------------------ binds */

    bindToggles() {
        for (const field of TOGGLE_FIELDS) {
            const input = /** @type {HTMLInputElement|null} */ (byId(field));
            if (!input) continue;
            input.addEventListener('change', () => {
                this.options[field] = input.checked;
                if (field === 'cloneMessages') this.updateMessageDependency();
                this.afterChange();
            });
        }
    }

    bindRanges() {
        const limit = /** @type {HTMLInputElement|null} */ (byId('msgLimit'));
        const delay = /** @type {HTMLInputElement|null} */ (byId('msgDelay'));

        limit?.addEventListener('input', () => {
            this.options.msgLimit = Number(limit.value);
            setText(byId('limitBadge'), String(limit.value));
            this.afterChange({ light: true });
        });

        delay?.addEventListener('input', () => {
            this.options.msgDelay = Number(delay.value);
            setText(byId('delayBadge'), `${delay.value}ms`);
            this.afterChange({ light: true });
        });
    }

    bindAdvanced() {
        this.advancedToggle?.addEventListener('click', () => {
            const open = this.advancedPanel?.classList.contains('collapsed') ?? true;
            this.setAdvancedOpen(open);
        });

        // Esc closes the drawer when focus is inside it.
        this.advancedPanel?.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.setAdvancedOpen(false);
                this.advancedToggle?.focus();
            }
        });
    }

    bindModeSwitch() {
        for (const label of all('[data-mode-option]')) {
            const input = /** @type {HTMLInputElement|null} */ (label.querySelector('input'));
            input?.addEventListener('change', () => {
                if (!input.checked) return;
                this.setMode(/** @type {string} */ (label.getAttribute('data-mode-option')));
            });
        }
    }

    bindPresets() {
        for (const card of all('[data-preset]')) {
            card.addEventListener('click', () => {
                const preset = PRESETS[/** @type {keyof typeof PRESETS} */ (card.getAttribute('data-preset'))];
                if (!preset) return;
                this.applyOptions(preset.options, { announce: true });
                this.setAdvancedOpen(true);
                this.toast?.success(`Preset applied: ${preset.label}`);
            });
        }
    }

    bindPersistence() {
        this.saveBtn?.addEventListener('click', () => this.save());

        this.resetBtn?.addEventListener('click', () => {
            remove(KEYS.config);
            this.applyOptions({ ...DEFAULT_OPTIONS }, { announce: false });
            this.toast?.info(t('toast.configReset'));
            this.showSavedBadge('Defaults restored');
        });
    }

    /* ------------------------------------------------------------------ state */

    /** @param {string} mode */
    setMode(mode) {
        this.mode = mode === 'mirror' ? 'mirror' : 'clone';

        for (const label of all('[data-mode-option]')) {
            const isActive = label.getAttribute('data-mode-option') === this.mode;
            label.classList.toggle('is-active', isActive);
            const input = /** @type {HTMLInputElement|null} */ (label.querySelector('input'));
            if (input) input.checked = isActive;
        }

        setHidden(this.mirrorOptions, this.mode !== 'mirror');
        setText(this.modeNote, this.mode === 'mirror' ? t('mode.note.mirror') : t('mode.note.clone'));
        this.modeNote?.classList.toggle('is-mirror', this.mode === 'mirror');

        const startText = byId('startBtnText');
        if (startText) setText(startText, this.mode === 'mirror' ? t('action.start.mirror') : t('action.start.clone'));

        write(KEYS.jobMode, this.mode);
        this.onDirty({ mode: this.mode, options: this.getOptions() });
    }

    getMode() {
        return this.mode;
    }

    /**
     * @param {Record<string, any>} next
     * @param {{ announce?: boolean }} [options]
     */
    applyOptions(next, options = {}) {
        for (const field of TOGGLE_FIELDS) {
            if (Object.prototype.hasOwnProperty.call(next, field)) {
                this.options[field] = Boolean(next[field]);
            }
        }
        for (const field of RANGE_FIELDS) {
            if (Object.prototype.hasOwnProperty.call(next, field)) {
                const value = Number(next[field]);
                if (Number.isFinite(value)) {
                    this.options[field] = field === 'msgLimit'
                        ? Math.min(1000, Math.max(1, Math.round(value)))
                        : Math.min(5000, Math.max(0, Math.round(value)));
                }
            }
        }

        this.syncInputs();
        this.updateMessageDependency();
        this.updateSummaries();

        if (options.announce !== false) this.afterChange();
    }

    syncInputs() {
        for (const field of TOGGLE_FIELDS) {
            const input = /** @type {HTMLInputElement|null} */ (byId(field));
            if (input) input.checked = Boolean(this.options[field]);
        }

        const limit = /** @type {HTMLInputElement|null} */ (byId('msgLimit'));
        if (limit) {
            limit.value = String(this.options.msgLimit);
            setText(byId('limitBadge'), String(this.options.msgLimit));
        }

        const delay = /** @type {HTMLInputElement|null} */ (byId('msgDelay'));
        if (delay) {
            delay.value = String(this.options.msgDelay);
            setText(byId('delayBadge'), `${this.options.msgDelay}ms`);
        }
    }

    updateMessageDependency() {
        const enabled = Boolean(this.options.cloneMessages);
        const attachments = /** @type {HTMLInputElement|null} */ (byId('cloneAttachments'));
        const row = byId('attachmentsRow');
        const badge = byId('attachmentsBadge');
        const desc = byId('attachmentsDesc');
        const drawer = this.messageDrawer;

        if (attachments) {
            attachments.disabled = !enabled;
            if (!enabled) {
                attachments.checked = false;
                this.options.cloneAttachments = false;
            }
        }
        row?.classList.toggle('disabled-option', !enabled);
        if (badge) {
            setText(badge, enabled ? (this.options.cloneAttachments ? 'Enabled' : 'Off') : 'Disabled');
            badge.className = `badge-opt-status${enabled ? ' active' : ' disabled'}`;
        }
        if (desc) {
            setText(desc, enabled ? 'Include files and images in replayed messages.' : 'Available when message history is enabled.');
        }

        const msgBadge = byId('msgOptStatusBadge');
        if (msgBadge) {
            setText(msgBadge, enabled ? 'Enabled' : 'Optional');
            msgBadge.classList.toggle('active', enabled);
        }

        drawer?.classList.toggle('collapsed', !enabled);
        drawer?.setAttribute('aria-hidden', String(!enabled));

        const rangeInputs = all('input[type="range"]', drawer || document);
        for (const input of rangeInputs) {
            /** @type {HTMLInputElement} */ (input).disabled = !enabled;
        }
    }

    updateSummaries() {
        const changed = TOGGLE_FIELDS.filter((field) => this.options[field] !== DEFAULT_OPTIONS[field])
            .concat(RANGE_FIELDS.filter((field) => this.options[field] !== DEFAULT_OPTIONS[field]));

        if (this.advancedSummary) {
            setText(this.advancedSummary, changed.length === 0 ? 'Defaults' : `${changed.length} custom`);
            this.advancedSummary.classList.toggle('active', changed.length > 0);
        }
    }

    /**
     * @param {boolean} open
     */
    setAdvancedOpen(open) {
        this.advancedPanel?.classList.toggle('collapsed', !open);
        this.advancedToggle?.setAttribute('aria-expanded', String(open));
        this.advancedChevron?.classList.toggle('rotated', open);
        if (open && !prefersReducedMotion()) {
            this.advancedPanel?.classList.add('panel-open');
        }
    }

    isAdvancedOpen() {
        return !(this.advancedPanel?.classList.contains('collapsed') ?? true);
    }

    /** @param {{ light?: boolean }} [meta] */
    afterChange(meta = {}) {
        this.updateSummaries();
        hideSavedBadge();
        this.onDirty({ mode: this.mode, options: this.getOptions(), light: Boolean(meta.light) });
    }

    /**
     * Options shaped exactly like what the server expects.
     */
    getOptions() {
        return {
            cloneRoles: this.options.cloneRoles,
            cloneChannels: this.options.cloneChannels,
            clonePermissions: this.options.clonePermissions,
            cloneProfile: this.options.cloneProfile,
            cloneEmojis: this.options.cloneEmojis,
            cloneStickers: this.options.cloneStickers,
            cloneWebhooks: this.options.cloneWebhooks,
            cloneMessages: this.options.cloneMessages,
            cloneAttachments: this.options.cloneMessages && this.options.cloneAttachments,
            cleanTarget: this.options.cleanTarget,
            msgLimit: this.options.msgLimit,
            msgDelay: this.options.msgDelay,
            mirrorMessages: this.options.mirrorMessages,
            mirrorEdits: this.options.mirrorEdits,
            mirrorDeletes: this.options.mirrorDeletes,
            mirrorStructure: this.options.mirrorStructure
        };
    }

    save() {
        const persisted = writeJSON(KEYS.config, this.options);
        if (persisted) {
            this.showSavedBadge(t('toast.configSaved'));
            this.toast?.success(t('toast.configSaved'));
        } else {
            this.toast?.error('Browser storage is unavailable — preferences were not saved.');
        }
    }

    /** @param {string} message */
    showSavedBadge(message) {
        if (!this.savedBadge) return;
        setText(byId('configSavedText'), message);
        setHidden(this.savedBadge, false);
        window.clearTimeout(this._savedTimer);
        this._savedTimer = window.setTimeout(() => hideSavedBadge(), 2600);
    }

    setDisabled(disabled) {
        const form = byId('clonerForm');
        for (const input of all('input, button', form || document)) {
            const el = /** @type {HTMLInputElement} */ (input);
            // Never disable the stop/pause controls.
            if (['cancelBtn', 'pauseBtn'].includes(el.id)) continue;
            el.disabled = disabled;
        }
        if (!disabled) this.updateMessageDependency();
    }

    updateLimits(limits = {}) {
        const limit = /** @type {HTMLInputElement|null} */ (byId('msgLimit'));
        if (limit && Number.isFinite(limits.maxMsgLimit)) limit.max = String(limits.maxMsgLimit);
        const delay = /** @type {HTMLInputElement|null} */ (byId('msgDelay'));
        if (delay) {
            if (Number.isFinite(limits.maxMsgDelay)) delay.max = String(limits.maxMsgDelay);
            if (Number.isFinite(limits.minMsgDelay)) delay.min = String(limits.minMsgDelay);
        }
    }
}

function hideSavedBadge() {
    setHidden(byId('configSavedBadge'), true);
}
