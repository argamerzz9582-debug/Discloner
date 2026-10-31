import { byId, setHidden, setText, prefersReducedMotion } from '../core/dom.js';
import { read, write, KEYS } from '../services/storage.js';

const STEPS = [
    {
        title: 'Welcome to Discloner Studio',
        desc: 'Three steps: authorise, choose direction, then start. This tour takes about 20 seconds.',
        target: null
    },
    {
        title: '1 · Authorise',
        desc: 'Paste a Discord user token. It stays in memory unless you opt in to remembering it — and remembering stores it unencrypted in this browser.',
        target: 'userToken'
    },
    {
        title: '2 · Choose direction',
        desc: 'Paste the source and target server IDs. Source is copied from; target is written to and may be cleaned.',
        target: 'sourceId'
    },
    {
        title: '3 · Pick a mode',
        desc: 'One-shot clone copies once and stops. Continuous mirror keeps forwarding new messages and structure changes until you stop it.',
        target: 'modeSwitch'
    },
    {
        title: '4 · Watch it happen',
        desc: 'Live progress, per-stage counts and an activity console live on the right — the same panel works as a drawer on mobile.',
        target: 'progressCard'
    }
];

/**
 * Guided tour with a spotlight. Skipped entirely for returning visitors and
 * when the user prefers reduced motion (the spotlight animation is decorative,
 * but we also avoid moving focus around unexpectedly).
 */
export class Tour {
    /** @param {{ force?: boolean }} [options] */
    constructor(options = {}) {
        this.overlay = byId('tourOverlay');
        this.spotlight = byId('tourSpotlight');
        this.backdrop = byId('tourBackdrop');
        this.card = byId('tourCard');
        this.title = byId('tourTitle');
        this.desc = byId('tourDesc');
        this.counter = byId('tourStepCounter');
        this.dots = byId('tourDots');
        this.nextBtn = byId('tourNextBtn');
        this.nextText = byId('tourNextBtnText');
        this.backBtn = byId('tourBackBtn');
        this.skipBtn = byId('tourSkipBtn');

        this.index = 0;
        this.open = false;
        this.lastFocused = null;

        this.buildDots();
        this.bind();

        if (options.force) this.start();
    }

    bind() {
        this.nextBtn?.addEventListener('click', () => this.next());
        this.backBtn?.addEventListener('click', () => this.prev());
        this.skipBtn?.addEventListener('click', () => this.finish());
        byId('tourCloseBtn')?.addEventListener('click', () => this.finish());
        this.backdrop?.addEventListener('click', (event) => {
            if (event.target === this.backdrop) this.finish();
        });

        document.addEventListener('keydown', (event) => {
            if (!this.open) return;
            if (event.key === 'Escape') this.finish();
            if (event.key === 'ArrowRight') this.next();
            if (event.key === 'ArrowLeft') this.prev();
        });

        window.addEventListener('resize', () => {
            if (this.open) this.positionSpotlight();
        });
    }

    buildDots() {
        if (!this.dots) return;
        this.dots.innerHTML = '';
        STEPS.forEach(() => {
            const dot = document.createElement('span');
            dot.className = 'tour-dot';
            this.dots.append(dot);
        });
    }

    start() {
        this.open = true;
        this.index = 0;
        this.lastFocused = document.activeElement;
        setHidden(this.overlay, false);
        setHidden(this.backdrop, false);
        setHidden(this.card, false);
        this.render();
        this.nextBtn?.focus();
    }

    next() {
        if (this.index >= STEPS.length - 1) {
            this.finish();
            return;
        }
        this.index += 1;
        this.render();
    }

    prev() {
        if (this.index === 0) return;
        this.index -= 1;
        this.render();
    }

    render() {
        const step = STEPS[this.index];
        setText(this.title, step.title);
        setText(this.desc, step.desc);
        setText(this.counter, `${this.index + 1} / ${STEPS.length}`);
        setText(this.nextText, this.index === STEPS.length - 1 ? 'Done' : 'Next');
        setHidden(this.backBtn, this.index === 0);

        if (this.dots) {
            Array.from(this.dots.children).forEach((dot, i) => {
                dot.classList.toggle('active', i === this.index);
                dot.classList.toggle('done', i < this.index);
            });
        }

        this.positionSpotlight();

        // Mobile: the card docks to the bottom instead of floating beside the target.
        this.card?.classList.toggle('is-mobile', window.innerWidth < 720);
    }

    positionSpotlight() {
        const step = STEPS[this.index];
        const target = step.target ? byId(step.target) : null;

        if (!target) {
            setHidden(this.spotlight, true);
            this.card?.classList.remove('is-anchored');
            if (this.card) {
                this.card.style.top = '';
                this.card.style.left = '';
                this.card.style.bottom = '';
            }
            return;
        }

        const rect = target.getBoundingClientRect();
        const padding = 8;
        setHidden(this.spotlight, false);

        if (this.spotlight) {
            this.spotlight.style.top = `${Math.max(0, rect.top - padding)}px`;
            this.spotlight.style.left = `${Math.max(0, rect.left - padding)}px`;
            this.spotlight.style.width = `${rect.width + padding * 2}px`;
            this.spotlight.style.height = `${rect.height + padding * 2}px`;
        }

        if (!this.card) return;
        this.card.classList.add('is-anchored');

        if (window.innerWidth < 720) {
            this.card.style.top = '';
            this.card.style.left = '';
            this.card.style.bottom = '';
            return;
        }

        const cardWidth = 340;
        const cardHeight = this.card.offsetHeight || 220;
        let left = rect.left + rect.width / 2 - cardWidth / 2;
        left = Math.max(16, Math.min(window.innerWidth - cardWidth - 16, left));

        let top = rect.bottom + 16;
        if (top + cardHeight > window.innerHeight - 16) {
            top = Math.max(16, rect.top - cardHeight - 16);
        }

        this.card.style.left = `${left}px`;
        this.card.style.top = `${top}px`;
        this.card.style.bottom = 'auto';

        if (!prefersReducedMotion()) {
            this.card.classList.add('tour-card-enter');
            window.setTimeout(() => this.card?.classList.remove('tour-card-enter'), 240);
        }
    }

    finish() {
        this.open = false;
        setHidden(this.overlay, true);
        setHidden(this.spotlight, true);
        setHidden(this.backdrop, true);
        setHidden(this.card, true);
        write(KEYS.tourDone, 'true');
        if (this.lastFocused instanceof HTMLElement) this.lastFocused.focus();
    }

    /** Auto-start for first-time visitors. */
    maybeAutoStart() {
        if (read(KEYS.tourDone) === 'true') return;
        window.setTimeout(() => this.start(), 700);
    }
}
