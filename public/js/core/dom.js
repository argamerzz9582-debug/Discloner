/**
 * Tiny DOM helpers. Deliberately framework-free: the dashboard is small enough
 * that direct element references are clearer (and faster) than a virtual DOM.
 */

/**
 * @template {HTMLElement} T
 * @param {string} id
 * @returns {T | null}
 */
export function byId(id) {
    return /** @type {any} */ (document.getElementById(id));
}

/**
 * @param {string} selector
 * @param {ParentNode} [root]
 */
export function one(selector, root = document) {
    return root.querySelector(selector);
}

/**
 * @param {string} selector
 * @param {ParentNode} [root]
 */
export function all(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
}

/**
 * @param {Element | null} element
 * @param {string} className
 * @param {boolean} [force]
 */
export function toggleClass(element, className, force) {
    if (!element) return;
    element.classList.toggle(className, force);
}

/**
 * @param {Element | null} element
 * @param {boolean} hidden
 */
export function setHidden(element, hidden) {
    if (!element) return;
    element.classList.toggle('hidden', hidden);
}

/**
 * @param {Element | null} element
 * @param {string} text
 */
export function setText(element, text) {
    if (!element) return;
    const next = String(text);
    if (element.textContent !== next) element.textContent = next;
}

/**
 * Adds a listener and returns an unsubscribe function.
 * @param {EventTarget | null} target
 * @param {string} event
 * @param {(event: any) => void} handler
 * @param {AddEventListenerOptions} [options]
 */
export function on(target, event, handler, options) {
    if (!target) return () => {};
    target.addEventListener(event, handler, options);
    return () => target.removeEventListener(event, handler, options);
}

/**
 * Restarts a CSS animation class.
 * @param {Element | null} element
 * @param {string} className
 */
export function restartAnimation(element, className) {
    if (!element) return;
    element.classList.remove(className);
    // Force a reflow so the animation can run again.
    void /** @type {HTMLElement} */ (element).offsetWidth;
    element.classList.add(className);
}

export const prefersReducedMotion = () =>
    typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
