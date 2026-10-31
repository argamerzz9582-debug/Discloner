import { byId, prefersReducedMotion } from '../core/dom.js';

/**
 * Non-blocking notifications. Announced through an aria-live region so screen
 * readers get the same feedback as sighted users.
 */
export class ToastManager {
    /** @param {{ containerId?: string }} [options] */
    constructor(options = {}) {
        this.container = byId(options.containerId || 'toastContainer');
        /** @type {Set<HTMLElement>} */
        this.active = new Set();
    }

    /**
     * @param {string} message
     * @param {'info'|'success'|'warning'|'error'} [variant]
     * @param {{ timeout?: number, action?: { label: string, onClick: () => void } }} [options]
     */
    show(message, variant = 'info', options = {}) {
        if (!this.container) return null;

        // Collapse duplicate messages instead of stacking identical toasts.
        for (const existing of this.active) {
            if (existing.dataset.message === message) {
                existing.classList.remove('toast-pop');
                void existing.offsetWidth;
                existing.classList.add('toast-pop');
                return existing;
            }
        }

        const toast = document.createElement('div');
        toast.className = `toast toast--${variant}`;
        toast.dataset.message = message;
        toast.setAttribute('role', variant === 'error' ? 'alert' : 'status');

        const icon = document.createElement('span');
        icon.className = 'toast-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = { info: 'i', success: '✓', warning: '!', error: '×' }[variant] || 'i';

        const text = document.createElement('span');
        text.className = 'toast-message';
        text.textContent = message;

        toast.append(icon, text);

        if (options.action) {
            const action = document.createElement('button');
            action.type = 'button';
            action.className = 'toast-action';
            action.textContent = options.action.label;
            action.addEventListener('click', () => {
                options.action?.onClick();
                this.dismiss(toast);
            });
            toast.append(action);
        }

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'toast-close';
        close.setAttribute('aria-label', 'Dismiss notification');
        close.textContent = '✕';
        close.addEventListener('click', () => this.dismiss(toast));
        toast.append(close);

        this.container.append(toast);
        this.active.add(toast);

        if (!prefersReducedMotion()) {
            toast.classList.add('toast-enter');
        }

        const timeout = options.timeout ?? (variant === 'error' ? 8000 : 4200);
        if (timeout > 0) {
            toast.dataset.timer = String(window.setTimeout(() => this.dismiss(toast), timeout));
        }

        return toast;
    }

    success(message, options) { return this.show(message, 'success', options); }
    error(message, options) { return this.show(message, 'error', options); }
    warning(message, options) { return this.show(message, 'warning', options); }
    info(message, options) { return this.show(message, 'info', options); }

    /** @param {HTMLElement} toast */
    dismiss(toast) {
        if (!toast || !toast.isConnected) {
            this.active.delete(toast);
            return;
        }
        const timer = Number(toast.dataset.timer || 0);
        if (timer) window.clearTimeout(timer);

        const finish = () => {
            toast.remove();
            this.active.delete(toast);
        };

        if (prefersReducedMotion()) {
            finish();
            return;
        }

        toast.classList.add('toast-exit');
        toast.addEventListener('animationend', finish, { once: true });
        // Fallback in case the animationend never fires (e.g. display:none tab).
        window.setTimeout(finish, 320);
    }

    clear() {
        for (const toast of [...this.active]) this.dismiss(toast);
    }
}
