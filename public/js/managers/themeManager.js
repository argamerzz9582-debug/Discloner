import { byId } from '../core/dom.js';
import { read, write, KEYS } from '../services/storage.js';

/**
 * ThemeManager — single owner of the light/dark decision.
 *
 * The initial attribute is set by `theme-bootstrap.js` before first paint to
 * avoid a flash. This class only handles toggling, persistence and the ARIA
 * state of the switch.
 */
export class ThemeManager {
    constructor() {
        this.root = document.documentElement;
        this.toggle = byId('themeToggleBtn');
        this.theme = this.root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';

        if (this.toggle) {
            this.toggle.addEventListener('click', () => this.toggleTheme());
            this.toggle.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    this.toggleTheme();
                }
            });
        }

        // Follow the OS only while the user has not made an explicit choice.
        const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
        media?.addEventListener?.('change', (event) => {
            if (read(KEYS.theme)) return;
            this.apply(event.matches ? 'dark' : 'light', { persist: false });
        });

        this.apply(this.theme, { persist: false });
        this.syncThemeColor();
    }

    /**
     * @param {'light'|'dark'} theme
     * @param {{ persist?: boolean }} [options]
     */
    apply(theme, options = {}) {
        this.theme = theme === 'dark' ? 'dark' : 'light';
        this.root.setAttribute('data-theme', this.theme);
        this.root.style.colorScheme = this.theme;

        if (options.persist !== false) write(KEYS.theme, this.theme);

        const isDark = this.theme === 'dark';
        if (this.toggle) {
            this.toggle.setAttribute('aria-checked', String(isDark));
            this.toggle.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
            this.toggle.classList.toggle('is-dark', isDark);
        }

        this.syncThemeColor();
        document.dispatchEvent(new CustomEvent('discloner:theme-change', { detail: { theme: this.theme } }));
    }

    toggleTheme() {
        this.apply(this.theme === 'dark' ? 'light' : 'dark');
    }

    syncThemeColor() {
        const meta = document.querySelector('meta[name="theme-color"]');
        const color = this.theme === 'dark' ? '#0f1420' : '#eef1f6';
        if (meta) {
            meta.setAttribute('content', color);
        } else {
            const tag = document.createElement('meta');
            tag.name = 'theme-color';
            tag.content = color;
            document.head.append(tag);
        }
    }
}
