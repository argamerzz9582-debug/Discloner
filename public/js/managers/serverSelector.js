import { byId, setHidden, setText } from '../core/dom.js';
import { t } from '../core/i18n.js';

const SNOWFLAKE = /^\d{17,20}$/;

/**
 * ServerSelector validates the source/target pair and renders inline feedback.
 * Both fields must be present, well-formed snowflakes and distinct.
 */
export class ServerSelector {
    /** @param {{ onChange?: () => void }} [options] */
    constructor(options = {}) {
        this.sourceInput = byId('sourceId');
        this.targetInput = byId('targetId');
        this.sourceFeedback = byId('sourceFeedback');
        this.targetFeedback = byId('targetFeedback');
        this.onChange = options.onChange || (() => {});
        /** @type {Map<string, boolean>} */
        this.touched = new Map();

        const bind = (input, feedback, field) => {
            if (!input) return;
            input.addEventListener('input', () => {
                // Strip anything that is not a digit as people paste IDs with junk.
                const cleaned = input.value.replace(/[^\d]/g, '');
                if (cleaned !== input.value) input.value = cleaned;
                const valid = SNOWFLAKE.test(cleaned);
                input.classList.toggle('is-valid', valid && cleaned.length > 0);
                input.classList.toggle('is-invalid', !valid && cleaned.length > 0);
                if (this.touched.get(field) && feedback) {
                    setHidden(feedback, valid || cleaned.length === 0);
                    feedback.classList.toggle('is-error', !valid && cleaned.length > 0);
                    setText(feedback, valid ? 'Looks good' : `Needs 17–20 digits (${cleaned.length})`);
                }
                this.onChange();
            });
            input.addEventListener('blur', () => {
                this.touched.set(field, true);
                this.validateField(field);
                this.onChange();
            });
        };

        bind(this.sourceInput, this.sourceFeedback, 'source');
        bind(this.targetInput, this.targetFeedback, 'target');
    }

    getSourceId() { return (this.sourceInput?.value || '').trim(); }
    getTargetId() { return (this.targetInput?.value || '').trim(); }

    /**
     * @param {string} source
     * @param {string} target
     */
    static sameId(source, target) {
        return Boolean(source) && source === target;
    }

    /** @param {'source'|'target'} field */
    validateField(field) {
        const input = field === 'source' ? this.sourceInput : this.targetInput;
        const feedback = field === 'source' ? this.sourceFeedback : this.targetFeedback;
        const value = (input?.value || '').trim();
        if (!input) return false;

        if (!value) {
            input.removeAttribute('aria-invalid');
            setHidden(feedback, true);
            return false;
        }

        if (!SNOWFLAKE.test(value)) {
            input.setAttribute('aria-invalid', 'true');
            input.classList.add('is-invalid');
            if (feedback) {
                setText(feedback, `Needs 17–20 digits (${value.length})`);
                feedback.classList.add('is-error');
                setHidden(feedback, false);
            }
            return false;
        }

        if (ServerSelector.sameId(this.getSourceId(), this.getTargetId())) {
            input.setAttribute('aria-invalid', 'true');
            if (feedback) {
                setText(feedback, t('error.sameServer'));
                feedback.classList.add('is-error');
                setHidden(feedback, false);
            }
            return false;
        }

        input.removeAttribute('aria-invalid');
        input.classList.remove('is-invalid');
        input.classList.add('is-valid');
        if (feedback) {
            setText(feedback, 'Looks good');
            feedback.classList.remove('is-error');
            setHidden(feedback, false);
        }
        return true;
    }

    /** Silent check used for render decisions (never touches the DOM). */
    isComplete() {
        const source = this.getSourceId();
        const target = this.getTargetId();
        return SNOWFLAKE.test(source) && SNOWFLAKE.test(target) && !ServerSelector.sameId(source, target);
    }

    /**
     * @returns {{ ok: boolean, errors: string[] }}
     */
    validate() {
        const source = this.getSourceId();
        const target = this.getTargetId();
        const errors = [];

        if (!SNOWFLAKE.test(source)) errors.push(t('error.sourceRequired'));
        if (!SNOWFLAKE.test(target)) errors.push(t('error.targetRequired'));
        if (!errors.length && ServerSelector.sameId(source, target)) errors.push(t('error.sameServer'));

        this.validateField('source');
        this.validateField('target');

        return { ok: errors.length === 0, errors };
    }

    /**
     * @param {string} stage
     * @param {{ source?: string, target?: string, message?: string }} [detail]
     */
    showPreflightStage(stage, detail = {}) {
        if (stage === 'source' && this.sourceFeedback) {
            setText(this.sourceFeedback, detail.message || 'Checking access…');
            setHidden(this.sourceFeedback, false);
            this.sourceFeedback.classList.toggle('is-error', Boolean(detail.error));
        }
        if (stage === 'target' && this.targetFeedback) {
            setText(this.targetFeedback, detail.message || 'Checking access…');
            setHidden(this.targetFeedback, false);
            this.targetFeedback.classList.toggle('is-error', Boolean(detail.error));
        }
    }

    reset() {
        this.touched.clear();
        for (const [input, feedback] of [
            [this.sourceInput, this.sourceFeedback],
            [this.targetInput, this.targetFeedback]
        ]) {
            if (input) {
                input.value = '';
                input.classList.remove('is-valid', 'is-invalid');
                input.removeAttribute('aria-invalid');
            }
            setHidden(feedback, true);
            feedback?.classList.remove('is-error');
            if (feedback) setText(feedback, '');
        }
    }
}
