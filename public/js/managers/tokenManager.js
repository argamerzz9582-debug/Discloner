import { byId, setHidden, setText } from '../core/dom.js';
import { read, write, remove, KEYS } from '../services/storage.js';

const TOKEN_PATTERN = /^[\w-]{20,}\.[\w-]{5,}\.[\w-]{20,}$/;

/**
 * TokenManager owns the credential field: visibility, opt-in persistence and
 * validation. The token lives in memory by default; it is only written to
 * localStorage when the user explicitly flips the "remember" switch, and the
 * opt-in flag is stored separately so clearing one cannot leave a stray token.
 */
export class TokenManager {
    /** @param {{ onChange?: (token: string) => void }} [options] */
    constructor(options = {}) {
        this.input = byId('userToken');
        this.toggleBtn = byId('toggleTokenVisibility');
        this.clearBtn = byId('clearTokenBtn');
        this.remember = byId('rememberToken');
        this.rememberBadge = byId('rememberTokenBadge');
        this.eyeIcon = byId('eyeIcon');

        this.onChange = options.onChange || (() => {});
        this.visible = false;
        /** @type {string} */
        this.token = '';

        this.restore();
        this.bind();
    }

    restore() {
        const optedIn = read(KEYS.tokenOptIn) === 'true';
        const stored = read(KEYS.token);

        if (this.remember) this.remember.checked = optedIn && Boolean(stored);
        this.updateBadge(optedIn && Boolean(stored));

        if (optedIn && stored) {
            this.setValue(stored, { silent: true });
        }
    }

    bind() {
        this.input?.addEventListener('input', () => {
            this.token = this.input.value.trim();
            if (this.remember?.checked && this.token) {
                write(KEYS.token, this.token);
                write(KEYS.tokenOptIn, 'true');
            }
            this.onChange(this.token);
        });

        this.toggleBtn?.addEventListener('click', () => this.toggleVisibility());
        this.clearBtn?.addEventListener('click', () => this.clear());

        this.remember?.addEventListener('change', () => {
            if (this.remember.checked) {
                write(KEYS.tokenOptIn, 'true');
                if (this.token) write(KEYS.token, this.token);
                this.updateBadge(true);
            } else {
                remove(KEYS.tokenOptIn);
                remove(KEYS.token);
                this.updateBadge(false);
            }
        });
    }

    toggleVisibility() {
        if (!this.input) return;
        this.visible = !this.visible;
        this.input.type = this.visible ? 'text' : 'password';
        this.toggleBtn?.setAttribute('aria-pressed', String(this.visible));
        this.toggleBtn?.setAttribute('aria-label', this.visible ? 'Hide token' : 'Show token');
        this.eyeIcon?.classList.toggle('eye-off', this.visible);
    }

    clear() {
        if (this.input) this.input.value = '';
        this.token = '';
        remove(KEYS.token);
        if (this.remember) this.remember.checked = false;
        remove(KEYS.tokenOptIn);
        this.updateBadge(false);
        this.onChange('');
        this.input?.focus();
    }

    /**
     * @param {string} value
     * @param {{ silent?: boolean }} [options]
     */
    setValue(value, options = {}) {
        this.token = String(value || '').trim();
        if (this.input) this.input.value = this.token;
        if (!options.silent) this.onChange(this.token);
    }

    getValue() {
        return (this.input?.value || this.token || '').trim();
    }

    /**
     * Cheap client-side sanity check. The server performs the authoritative
     * format and liveness check before any Discord call is made.
     * @param {string} [value]
     */
    isValid(value = this.getValue()) {
        if (!value) return false;
        if (/\s/.test(value)) return false;
        return TOKEN_PATTERN.test(value) || value.length >= 40;
    }

    /** @param {boolean} remembered */
    updateBadge(remembered) {
        if (!this.rememberBadge) return;
        setText(this.rememberBadge, remembered ? 'On' : 'Off');
        this.rememberBadge.classList.toggle('active', remembered);
        this.rememberBadge.setAttribute('data-state', remembered ? 'on' : 'off');
    }

    clearError() {
        if (!this.input) return;
        this.input.removeAttribute('aria-invalid');
        setHidden(byId('tokenFeedback'), true);
    }

    /** @param {string} message */
    showError(message) {
        if (!this.input) return;
        this.input.setAttribute('aria-invalid', 'true');
        const feedback = byId('tokenFeedback');
        if (feedback) {
            setText(feedback, message);
            feedback.classList.add('is-error');
            setHidden(feedback, false);
        }
    }
}
