/**
 * DISCLONER - Ultra-Clean Neumorphic Client Controller
 */

(function () {
    'use strict';

    // Socket Connection
    const socket = io();

    // DOM Elements - Theme & Navigation
    const htmlElement = document.documentElement;
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const navTourBtn = document.getElementById('navTourBtn');
    const navTemplatesBtn = document.getElementById('navTemplatesBtn');
    const navGuidesBtn = document.getElementById('navGuidesBtn');
    const navSupportBtn = document.getElementById('navSupportBtn');

    // DOM Elements - Form & Inputs
    const form = document.getElementById('clonerForm');
    const userTokenInput = document.getElementById('userToken');
    const toggleTokenBtn = document.getElementById('toggleTokenVisibility');
    const clearTokenBtn = document.getElementById('clearTokenBtn');
    const eyeIcon = document.getElementById('eyeIcon');
    const sourceIdInput = document.getElementById('sourceId');
    const targetIdInput = document.getElementById('targetId');
    const sourceFeedback = document.getElementById('sourceFeedback');
    const targetFeedback = document.getElementById('targetFeedback');

    // Options Checkboxes & Controls (Inside Advanced Panel)
    const cleanTargetCheckbox = document.getElementById('cleanTarget');
    const cloneRolesCheckbox = document.getElementById('cloneRoles');
    const cloneChannelsCheckbox = document.getElementById('cloneChannels');
    const clonePermissionsCheckbox = document.getElementById('clonePermissions');
    const cloneProfileCheckbox = document.getElementById('cloneProfile');
    const cloneMessagesCheckbox = document.getElementById('cloneMessages');
    const cloneAttachmentsCheckbox = document.getElementById('cloneAttachments');
    const attachmentsRow = document.getElementById('attachmentsRow');
    const attachmentsBadge = document.getElementById('attachmentsBadge');
    const attachmentsDesc = document.getElementById('attachmentsDesc');
    const msgOptStatusBadge = document.getElementById('msgOptStatusBadge');
    const messageSettingsDrawer = document.getElementById('messageSettingsDrawer');
    const msgLimitInput = document.getElementById('msgLimit');
    const msgDelayInput = document.getElementById('msgDelay');
    const limitBadge = document.getElementById('limitBadge');
    const delayBadge = document.getElementById('delayBadge');

    // Configuration Toolbar
    const saveConfigBtn = document.getElementById('saveConfigBtn');
    const saveConfigBtnText = document.getElementById('saveConfigBtnText');
    const saveConfigIcon = document.getElementById('saveConfigIcon');
    const resetConfigBtn = document.getElementById('resetConfigBtn');
    const configSavedBadge = document.getElementById('configSavedBadge');
    const configSavedText = document.getElementById('configSavedText');

    // Accordion
    const advancedToggleBtn = document.getElementById('advancedToggleBtn');
    const advancedPanel = document.getElementById('advancedPanel');
    const advancedChevron = document.getElementById('advancedChevron');

    // Buttons
    const startBtn = document.getElementById('startBtn');
    const startBtnText = document.getElementById('startBtnText');
    const cancelBtn = document.getElementById('cancelBtn');

    // Telemetry & Progress
    const connStatusPill = document.getElementById('connStatus');
    const connStatusText = document.getElementById('connStatusText');
    const telemetryEmptyState = document.getElementById('telemetryEmptyState');
    const telemetryActiveView = document.getElementById('telemetryActiveView');
    const stagePill = document.getElementById('stagePill');
    const stageDot = document.getElementById('stageDot');
    const stageLabel = document.getElementById('stageLabel');
    const elapsedTimer = document.getElementById('elapsedTimer');
    const etaPill = document.getElementById('etaPill');
    const etaTimer = document.getElementById('etaTimer');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const progressTrack = document.getElementById('progressTrack');
    const progressItemDetail = document.getElementById('progressItemDetail');
    const progressCounts = document.getElementById('progressCounts');

    // Onboarding Tour Elements
    const tourOverlay = document.getElementById('tourOverlay');
    const tourBackdrop = document.getElementById('tourBackdrop');
    const tourSpotlight = document.getElementById('tourSpotlight');
    const tourCard = document.getElementById('tourCard');
    const tourTitle = document.getElementById('tourTitle');
    const tourDesc = document.getElementById('tourDesc');
    const tourStepCounter = document.getElementById('tourStepCounter');
    const tourDots = document.getElementById('tourDots');
    const tourCloseBtn = document.getElementById('tourCloseBtn');
    const tourSkipBtn = document.getElementById('tourSkipBtn');
    const tourBackBtn = document.getElementById('tourBackBtn');
    const tourNextBtn = document.getElementById('tourNextBtn');
    const tourNextBtnText = document.getElementById('tourNextBtnText');

    // Live Stats
    // UI/UX refinement refs
    const mainHeader = document.getElementById('mainHeader');
    const mainDashboard = document.getElementById('mainDashboard');
    const progressCard = document.getElementById('progressCard');
    const stepToken = document.getElementById('stepToken');
    const stepRoute = document.getElementById('stepRoute');
    const stepClone = document.getElementById('stepClone');
    const logEmptyState = document.getElementById('logEmptyState');
    const logEmptyTitle = document.getElementById('logEmptyTitle');
    const logEmptyDesc = document.getElementById('logEmptyDesc');
    const logAnnouncer = document.getElementById('logAnnouncer');

    const liveStatRoles = document.getElementById('liveStatRoles');
    const liveStatChannels = document.getElementById('liveStatChannels');
    const liveStatMessages = document.getElementById('liveStatMessages');
    const liveStatWarnings = document.getElementById('liveStatWarnings');

    // Activity Console
    const terminal = document.getElementById('terminal');
    const logStream = document.getElementById('logStream');
    const logCountPill = document.getElementById('logCountPill');
    const logSearchInput = document.getElementById('logSearchInput');
    const copyLogsBtn = document.getElementById('copyLogsBtn');
    const clearLogsBtn = document.getElementById('clearLogsBtn');
    const jumpLatestBtn = document.getElementById('jumpLatestBtn');
    const filterPills = document.querySelectorAll('.filter-pill');

    // DOM Elements - Preflight in Confirm Modal
    const preflightBox = document.getElementById('preflightBox');
    const preflightStatusBadge = document.getElementById('preflightStatusBadge');
    const preflightSubText = document.getElementById('preflightSubText');
    const preflightChecksList = document.getElementById('preflightChecksList');
    const confirmCleanupAlert = document.getElementById('confirmCleanupAlert');
    const statVerifyStatus = document.getElementById('statVerifyStatus');
    const statPermissions = document.getElementById('statPermissions');
    const statCleanup = document.getElementById('statCleanup');
    const confirmSourceId = document.getElementById('confirmSourceId');
    const confirmTargetId = document.getElementById('confirmTargetId');
    const proceedConfirmBtn = document.getElementById('proceedConfirmBtn');
    const cancelConfirmBtn = document.getElementById('cancelConfirmBtn');

    const confirmModal = document.getElementById('confirmModal');
    const summaryModal = document.getElementById('summaryModal');
    const statDuration = document.getElementById('statDuration');
    const statRoles = document.getElementById('statRoles');
    const statCategories = document.getElementById('statCategories');
    const statChannels = document.getElementById('statChannels');
    const statMessages = document.getElementById('statMessages');
    const statWarnings = document.getElementById('statWarnings');
    const closeSummaryBtn = document.getElementById('closeSummaryBtn');
    const viewLogsSummaryBtn = document.getElementById('viewLogsSummaryBtn');

    const helpModal = document.getElementById('helpModal');
    const closeHelpBtn = document.getElementById('closeHelpBtn');
    const dismissHelpBtn = document.getElementById('dismissHelpBtn');

    const templatesModal = document.getElementById('templatesModal');
    const closeTemplatesBtn = document.getElementById('closeTemplatesBtn');
    const dismissTemplatesBtn = document.getElementById('dismissTemplatesBtn');

    const supportModal = document.getElementById('supportModal');
    const closeSupportBtn = document.getElementById('closeSupportBtn');
    const dismissSupportBtn = document.getElementById('dismissSupportBtn');

    const toastContainer = document.getElementById('toastContainer');

    // Application State
    let isRunning = false;
    let operationStartTime = null;
    let timerInterval = null;
    let allLogs = [];
    let currentFilter = 'all';
    let searchQuery = '';
    let isAutoScrollLocked = true;
    let unreadLogsCount = 0;
    let currentJobId = null;
    // Capability issued by the server at job start; required to cancel.
    let currentJobToken = null;
    // True while a preflight request is in flight (guards dialog dismissal).
    let isPreflightRunning = false;
    const MAX_DOM_LOGS = 600;

    let statCounters = {
        roles: 0,
        channels: 0,
        categories: 0,
        messages: 0,
        warnings: 0
    };

    // Load active job ID + cancel capability from localStorage if exists
    try {
        currentJobId = localStorage.getItem('discloner_active_job_id');
        currentJobToken = localStorage.getItem('discloner_active_job_token');
    } catch (e) {}

    // ==========================================================================
    // 1. Theme Engine & Persistence
    // ==========================================================================

    function getPreferredTheme() {
        // 1. Honour an explicit choice. 2. Otherwise follow the OS preference.
        try {
            const saved = localStorage.getItem('discloner-theme');
            if (saved === 'dark' || saved === 'light') return saved;
        } catch (e) {}

        try {
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                return 'dark';
            }
        } catch (e) {}

        return 'light';
    }

    function initTheme() {
        applyTheme(getPreferredTheme());
    }

    function applyTheme(theme) {
        if (theme === 'dark') {
            htmlElement.setAttribute('data-theme', 'dark');
            if (themeToggleBtn) themeToggleBtn.setAttribute('aria-checked', 'true');
        } else {
            htmlElement.setAttribute('data-theme', 'light');
            if (themeToggleBtn) themeToggleBtn.setAttribute('aria-checked', 'false');
        }
        try {
            localStorage.setItem('discloner-theme', theme);
        } catch (e) {
            // Sandboxed environment
        }
    }

    function toggleTheme() {
        const currentTheme = htmlElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(newTheme);
    }

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', toggleTheme);
    }

    initTheme();

    // ==========================================================================
    // 2. Modals & Preset Handlers
    // ==========================================================================

    // ==========================================================================
    // Modal controller: focus trap, Esc to dismiss, focus restoration.
    // ==========================================================================
    const FOCUSABLE_SELECTOR = [
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled]):not([type="hidden"])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])'
    ].join(', ');

    const modalStack = [];

    function getFocusable(modal) {
        return Array.from(modal.querySelectorAll(FOCUSABLE_SELECTOR))
            .filter(el => !el.hasAttribute('disabled')
                && el.getAttribute('aria-hidden') !== 'true'
                && !el.closest('.hidden, [hidden]'));
    }

    function syncModalScrollLock() {
        document.body.style.overflow = modalStack.length > 0 ? 'hidden' : '';
    }

    function openModal(modal) {
        if (!modal || modalStack.includes(modal)) return;

        modalStack.push(modal);
        modal.__returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

        modal.classList.remove('hidden');
        syncModalScrollLock();

        // Move focus into the dialog so screen readers and keyboards land inside.
        // Done synchronously: the element is already painted once `hidden` is
        // removed, and a deferred focus can race with an immediate Esc.
        const target = getFocusable(modal)[0] || modal.querySelector('.neu-modal-card') || modal;
        if (target === modal) modal.setAttribute('tabindex', '-1');
        try {
            target.focus({ preventScroll: true });
        } catch (e) {}
    }

    function closeModal(modal) {
        if (!modal) return;

        const index = modalStack.indexOf(modal);
        if (index !== -1) modalStack.splice(index, 1);

        modal.classList.add('hidden');
        syncModalScrollLock();

        // Return focus to whatever opened the dialog.
        const returnTo = modal.__returnFocus;
        modal.__returnFocus = null;
        if (returnTo && document.body.contains(returnTo)) {
            try {
                returnTo.focus({ preventScroll: true });
            } catch (e) {}
        }
    }

    function closeTopModal() {
        if (modalStack.length === 0) return false;
        closeModal(modalStack[modalStack.length - 1]);
        return true;
    }

    // Esc dismisses the top-most dialog; Tab is trapped inside it.
    document.addEventListener('keydown', (event) => {
        if (modalStack.length === 0) return;
        const topModal = modalStack[modalStack.length - 1];

        if (event.key === 'Escape') {
            // Never dismiss the confirmation dialog mid-preflight; the request
            // is still in flight and the buttons would disappear under the user.
            if (topModal === confirmModal && isPreflightRunning) return;
            event.preventDefault();
            closeModal(topModal);
            return;
        }

        if (event.key !== 'Tab') return;

        const focusable = getFocusable(topModal);
        if (focusable.length === 0) {
            event.preventDefault();
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;

        if (!topModal.contains(active)) {
            event.preventDefault();
            first.focus();
            return;
        }
        if (event.shiftKey && active === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
        }
    });

    // Clicking the dimmed backdrop dismisses dismissible dialogs.
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        backdrop.addEventListener('click', (event) => {
            if (event.target !== backdrop) return;
            if (backdrop === confirmModal && isPreflightRunning) return;
            closeModal(backdrop);
        });
    });

    if (navGuidesBtn) navGuidesBtn.addEventListener('click', () => openModal(helpModal));
    if (closeHelpBtn) closeHelpBtn.addEventListener('click', () => closeModal(helpModal));
    if (dismissHelpBtn) dismissHelpBtn.addEventListener('click', () => closeModal(helpModal));

    if (navTemplatesBtn) navTemplatesBtn.addEventListener('click', () => openModal(templatesModal));
    if (closeTemplatesBtn) closeTemplatesBtn.addEventListener('click', () => closeModal(templatesModal));
    if (dismissTemplatesBtn) dismissTemplatesBtn.addEventListener('click', () => closeModal(templatesModal));

    if (navSupportBtn) navSupportBtn.addEventListener('click', () => openModal(supportModal));
    if (closeSupportBtn) closeSupportBtn.addEventListener('click', () => closeModal(supportModal));
    if (dismissSupportBtn) dismissSupportBtn.addEventListener('click', () => closeModal(supportModal));

    // Preset selection in Templates Modal
    const templateCards = document.querySelectorAll('.template-item-card');
    templateCards.forEach(card => {
        card.addEventListener('click', () => {
            const preset = card.dataset.preset;
            applyPreset(preset);
            closeModal(templatesModal);
        });
    });

    function applyPreset(preset) {
        if (preset === 'standard') {
            if (cleanTargetCheckbox) cleanTargetCheckbox.checked = true;
            if (cloneRolesCheckbox) cloneRolesCheckbox.checked = true;
            if (cloneChannelsCheckbox) cloneChannelsCheckbox.checked = true;
            if (clonePermissionsCheckbox) clonePermissionsCheckbox.checked = true;
            if (cloneProfileCheckbox) cloneProfileCheckbox.checked = true;
            if (cloneMessagesCheckbox) cloneMessagesCheckbox.checked = false;
            syncMessageOptionUI();
            showToast('Applied preset: Full Server Architecture', 'info');
        } else if (preset === 'complete-archive') {
            if (cleanTargetCheckbox) cleanTargetCheckbox.checked = true;
            if (cloneRolesCheckbox) cloneRolesCheckbox.checked = true;
            if (cloneChannelsCheckbox) cloneChannelsCheckbox.checked = true;
            if (clonePermissionsCheckbox) clonePermissionsCheckbox.checked = true;
            if (cloneProfileCheckbox) cloneProfileCheckbox.checked = true;
            if (cloneMessagesCheckbox) cloneMessagesCheckbox.checked = true;
            syncMessageOptionUI();
            if (cloneAttachmentsCheckbox) cloneAttachmentsCheckbox.checked = true;
            if (msgLimitInput) msgLimitInput.value = 25;
            if (limitBadge) limitBadge.textContent = '25';
            if (msgDelayInput) msgDelayInput.value = 1000;
            if (delayBadge) delayBadge.textContent = '1000ms';
            showToast('Applied preset: Complete Server Archive', 'warning');
        } else if (preset === 'roles-only') {
            if (cleanTargetCheckbox) cleanTargetCheckbox.checked = true;
            if (cloneRolesCheckbox) cloneRolesCheckbox.checked = true;
            if (cloneChannelsCheckbox) cloneChannelsCheckbox.checked = false;
            if (clonePermissionsCheckbox) clonePermissionsCheckbox.checked = true;
            if (cloneProfileCheckbox) cloneProfileCheckbox.checked = false;
            if (cloneMessagesCheckbox) cloneMessagesCheckbox.checked = false;
            syncMessageOptionUI();
            showToast('Applied preset: Roles & Permissions Only', 'info');
        }
    }

    // ==========================================================================
    // 3. Form Interactions, Snowflake Validation & Dependency Sync
    // ==========================================================================

    // Token Visibility Toggle
    if (toggleTokenBtn && userTokenInput) {
        toggleTokenBtn.addEventListener('click', () => {
            const isPassword = userTokenInput.type === 'password';
            userTokenInput.type = isPassword ? 'text' : 'password';
            if (eyeIcon) {
                if (isPassword) {
                    eyeIcon.innerHTML = `
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                    `;
                } else {
                    eyeIcon.innerHTML = `
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                    `;
                }
            }
        });
    }

    // Clear Token Button
    if (clearTokenBtn && userTokenInput) {
        clearTokenBtn.addEventListener('click', () => {
            userTokenInput.value = '';
            if (typeof purgeStoredToken === 'function') purgeStoredToken();
            userTokenInput.focus();
        });
    }

    // Snowflake Validation Helpers
    function validateSnowflakeInput(inputEl, feedbackEl, fieldName) {
        if (!inputEl || !feedbackEl) return true;
        const val = inputEl.value.trim();
        if (!val) {
            feedbackEl.textContent = '';
            feedbackEl.className = 'validation-feedback';
            inputEl.classList.remove('input-invalid', 'input-valid');
            return false;
        }

        if (!/^[0-9]+$/.test(val)) {
            feedbackEl.textContent = '✕ Only numeric digits allowed';
            feedbackEl.className = 'validation-feedback invalid';
            inputEl.classList.add('input-invalid');
            inputEl.classList.remove('input-valid');
            return false;
        }

        if (val.length < 17 || val.length > 20) {
            feedbackEl.textContent = `✕ Must be 17–20 digits (${val.length} digits)`;
            feedbackEl.className = 'validation-feedback invalid';
            inputEl.classList.add('input-invalid');
            inputEl.classList.remove('input-valid');
            return false;
        }

        feedbackEl.textContent = '✓ Valid Discord ID';
        feedbackEl.className = 'validation-feedback valid';
        inputEl.classList.remove('input-invalid');
        inputEl.classList.add('input-valid');
        return true;
    }

    if (sourceIdInput) {
        sourceIdInput.addEventListener('input', () => {
            validateSnowflakeInput(sourceIdInput, sourceFeedback, 'Source');
            checkIdenticalIds();
        });
    }

    if (targetIdInput) {
        targetIdInput.addEventListener('input', () => {
            validateSnowflakeInput(targetIdInput, targetFeedback, 'Target');
            checkIdenticalIds();
        });
    }

    function checkIdenticalIds() {
        const sVal = sourceIdInput.value.trim();
        const tVal = targetIdInput.value.trim();
        if (sVal && tVal && sVal === tVal) {
            targetFeedback.textContent = '✕ Source and Target IDs cannot be identical';
            targetFeedback.className = 'validation-feedback invalid';
            targetIdInput.classList.add('input-invalid');
            return false;
        }
        return true;
    }

    // Range Slider live badge updates
    if (msgLimitInput && limitBadge) {
        msgLimitInput.addEventListener('input', (e) => {
            limitBadge.textContent = e.target.value;
        });
    }

    if (msgDelayInput && delayBadge) {
        msgDelayInput.addEventListener('input', (e) => {
            delayBadge.textContent = `${e.target.value}ms`;
        });
    }

    // Message Cloning Dependency UX (OFF by default)
    function syncMessageOptionUI() {
        if (!cloneMessagesCheckbox) return;
        const isMessagesEnabled = cloneMessagesCheckbox.checked;

        if (isMessagesEnabled) {
            if (messageSettingsDrawer) messageSettingsDrawer.classList.remove('collapsed');
            if (msgOptStatusBadge) {
                msgOptStatusBadge.textContent = 'Active';
                msgOptStatusBadge.classList.add('active');
            }

            if (cloneAttachmentsCheckbox) {
                cloneAttachmentsCheckbox.disabled = false;
            }
            if (attachmentsRow) {
                attachmentsRow.classList.remove('disabled-option');
            }
            if (attachmentsBadge) {
                attachmentsBadge.textContent = 'Optional';
                attachmentsBadge.classList.remove('disabled');
            }
            if (attachmentsDesc) {
                attachmentsDesc.textContent = 'Synchronize message files, images, and embeds';
            }
        } else {
            if (messageSettingsDrawer) messageSettingsDrawer.classList.add('collapsed');
            if (msgOptStatusBadge) {
                msgOptStatusBadge.textContent = 'Optional';
                msgOptStatusBadge.classList.remove('active');
            }

            if (cloneAttachmentsCheckbox) {
                cloneAttachmentsCheckbox.disabled = true;
                cloneAttachmentsCheckbox.checked = false;
            }
            if (attachmentsRow) {
                attachmentsRow.classList.add('disabled-option');
            }
            if (attachmentsBadge) {
                attachmentsBadge.textContent = 'Disabled';
                attachmentsBadge.classList.add('disabled');
            }
            if (attachmentsDesc) {
                attachmentsDesc.textContent = 'Available when Message History is enabled';
            }
        }
    }

    if (cloneMessagesCheckbox) {
        cloneMessagesCheckbox.addEventListener('change', syncMessageOptionUI);
        syncMessageOptionUI();
    }

    // Advanced Accordion Toggle
    if (advancedToggleBtn && advancedPanel) {
        advancedToggleBtn.addEventListener('click', () => {
            const isCollapsed = advancedPanel.classList.contains('collapsed');
            if (isCollapsed) {
                advancedPanel.classList.remove('collapsed');
                advancedToggleBtn.setAttribute('aria-expanded', 'true');
                if (advancedChevron) advancedChevron.style.transform = 'rotate(90deg)';
            } else {
                advancedPanel.classList.add('collapsed');
                advancedToggleBtn.setAttribute('aria-expanded', 'false');
                if (advancedChevron) advancedChevron.style.transform = 'rotate(0deg)';
            }
        });
    }

    // ==========================================================================
    // 4. Configuration & Token Persistence Engine (localStorage)
    //
    // The Discord token is a full account credential. It is therefore held in
    // memory by default and only persisted when the operator explicitly opts in
    // via the "Remember token on this device" switch.
    // ==========================================================================
    const CONFIG_STORAGE_KEY = 'discloner_user_config';
    const TOKEN_STORAGE_KEY = 'discloner_saved_user_token';
    const TOKEN_REMEMBER_KEY = 'discloner_token_remember_opt_in';

    const rememberTokenCheckbox = document.getElementById('rememberToken');
    const rememberTokenBadge = document.getElementById('rememberTokenBadge');

    function isTokenPersistenceEnabled() {
        return rememberTokenCheckbox ? rememberTokenCheckbox.checked === true : false;
    }

    function clearActiveJobStorage() {
        try {
            localStorage.removeItem('discloner_active_job_id');
        } catch (e) {}
        try {
            localStorage.removeItem('discloner_active_job_token');
        } catch (e) {}
        currentJobToken = null;
    }

    function purgeStoredToken() {
        try {
            localStorage.removeItem(TOKEN_STORAGE_KEY);
        } catch (e) {}
    }

    function syncRememberTokenUi() {
        if (!rememberTokenBadge) return;
        const enabled = isTokenPersistenceEnabled();
        rememberTokenBadge.textContent = enabled ? 'On' : 'Off';
        rememberTokenBadge.classList.toggle('active', enabled);
    }

    function saveUserToken(token) {
        if (typeof token !== 'string' || !token.trim()) return;
        const normalized = token.trim();

        if (!isTokenPersistenceEnabled()) {
            // Opt-out must actively scrub anything a previous session stored.
            try {
                localStorage.removeItem(TOKEN_STORAGE_KEY);
            } catch (e) {}
            return;
        }

        try {
            localStorage.setItem(TOKEN_STORAGE_KEY, normalized);
        } catch (e) {}
    }

    function loadUserToken() {
        let persisted = null;
        try {
            persisted = localStorage.getItem(TOKEN_STORAGE_KEY);
        } catch (e) {}

        const optedIn = (() => {
            try {
                return localStorage.getItem(TOKEN_REMEMBER_KEY) === 'true';
            } catch (e) {
                return false;
            }
        })();

        if (rememberTokenCheckbox) {
            rememberTokenCheckbox.checked = optedIn;
        }
        syncRememberTokenUi();

        // One-time migration: earlier builds always stored the token. If the
        // operator has not opted in, remove that stale credential immediately.
        if (!optedIn && persisted) {
            try {
                localStorage.removeItem(TOKEN_STORAGE_KEY);
            } catch (e) {}
            persisted = null;
        }

        if (persisted && userTokenInput && !userTokenInput.value) {
            userTokenInput.value = persisted;
            return persisted;
        }
        return null;
    }

    if (rememberTokenCheckbox) {
        rememberTokenCheckbox.addEventListener('change', () => {
            try {
                localStorage.setItem(TOKEN_REMEMBER_KEY, String(isTokenPersistenceEnabled()));
            } catch (e) {}

            syncRememberTokenUi();

            const currentValue = userTokenInput ? userTokenInput.value.trim() : '';
            if (isTokenPersistenceEnabled()) {
                if (currentValue) saveUserToken(currentValue);
                showToast('Token will be remembered on this device.', 'warning');
            } else {
                purgeStoredToken();
                showToast('Stored token removed from this browser.', 'info');
            }
        });
    }

    if (userTokenInput) {
        userTokenInput.addEventListener('input', () => {
            const val = userTokenInput.value.trim();
            if (val) {
                saveUserToken(val);
            }
        });
        userTokenInput.addEventListener('change', () => {
            const val = userTokenInput.value.trim();
            if (val) {
                saveUserToken(val);
            }
        });
    }

    function saveUserConfiguration() {
        const token = userTokenInput ? userTokenInput.value.trim() : '';
        if (token) {
            saveUserToken(token);
        }

        const config = {
            cleanTarget: cleanTargetCheckbox ? cleanTargetCheckbox.checked : true,
            cloneRoles: cloneRolesCheckbox ? cloneRolesCheckbox.checked : true,
            cloneChannels: cloneChannelsCheckbox ? cloneChannelsCheckbox.checked : true,
            clonePermissions: clonePermissionsCheckbox ? clonePermissionsCheckbox.checked : true,
            cloneProfile: cloneProfileCheckbox ? cloneProfileCheckbox.checked : true,
                cloneEmojis: document.getElementById("cloneEmojis") ? document.getElementById("cloneEmojis").checked : true,
                cloneStickers: document.getElementById("cloneStickers") ? document.getElementById("cloneStickers").checked : true,
                cloneWebhooks: document.getElementById("cloneWebhooks") ? document.getElementById("cloneWebhooks").checked : true,
            cloneMessages: cloneMessagesCheckbox ? cloneMessagesCheckbox.checked : false,
            cloneAttachments: cloneAttachmentsCheckbox ? cloneAttachmentsCheckbox.checked : false,
            msgLimit: msgLimitInput ? (parseInt(msgLimitInput.value, 10) || 15) : 15,
            msgDelay: msgDelayInput ? (parseInt(msgDelayInput.value, 10) || 1000) : 1000,
            savedAt: Date.now()
        };

        try {
            localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));

            if (saveConfigBtn) saveConfigBtn.classList.add('saved-state');
            if (saveConfigBtnText) saveConfigBtnText.textContent = 'Saved!';
            if (configSavedBadge) configSavedBadge.classList.remove('hidden');
            if (configSavedText) configSavedText.textContent = 'Saved Preferences Active';

            showToast(
                isTokenPersistenceEnabled()
                    ? 'Preferences saved. Token remembered on this device.'
                    : 'Preferences saved. Token kept in memory for this session only.',
                'success'
            );

            setTimeout(() => {
                if (saveConfigBtn) saveConfigBtn.classList.remove('saved-state');
                if (saveConfigBtnText) saveConfigBtnText.textContent = 'Save Configuration';
            }, 2200);
        } catch (err) {
            showToast('Unable to persist configuration preferences.', 'error');
        }
    }

    function loadUserConfiguration() {
        try {
            const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
            if (!raw) return false;

            const config = JSON.parse(raw);
            if (!config || typeof config !== 'object') return false;

            if (cleanTargetCheckbox && typeof config.cleanTarget === 'boolean') {
                cleanTargetCheckbox.checked = config.cleanTarget;
            }
            if (cloneRolesCheckbox && typeof config.cloneRoles === 'boolean') {
                cloneRolesCheckbox.checked = config.cloneRoles;
            }
            if (cloneChannelsCheckbox && typeof config.cloneChannels === 'boolean') {
                cloneChannelsCheckbox.checked = config.cloneChannels;
            }
            if (clonePermissionsCheckbox && typeof config.clonePermissions === 'boolean') {
                clonePermissionsCheckbox.checked = config.clonePermissions;
            }
            if (cloneProfileCheckbox && typeof config.cloneProfile === 'boolean') {
                cloneProfileCheckbox.checked = config.cloneProfile;
            }
            if (cloneMessagesCheckbox && typeof config.cloneMessages === 'boolean') {
                cloneMessagesCheckbox.checked = config.cloneMessages;
            }
            if (cloneAttachmentsCheckbox && typeof config.cloneAttachments === 'boolean') {
                cloneAttachmentsCheckbox.checked = config.cloneAttachments;
            }
            if (msgLimitInput && config.msgLimit) {
                msgLimitInput.value = config.msgLimit;
                if (limitBadge) limitBadge.textContent = config.msgLimit;
            }
            if (msgDelayInput && config.msgDelay) {
                msgDelayInput.value = config.msgDelay;
                if (delayBadge) delayBadge.textContent = `${config.msgDelay}ms`;
            }

            syncMessageOptionUI();

            if (configSavedBadge) {
                configSavedBadge.classList.remove('hidden');
                if (configSavedText) configSavedText.textContent = 'Saved Preferences Active';
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    function resetUserConfiguration() {
        if (cleanTargetCheckbox) cleanTargetCheckbox.checked = true;
        if (cloneRolesCheckbox) cloneRolesCheckbox.checked = true;
        if (cloneChannelsCheckbox) cloneChannelsCheckbox.checked = true;
        if (clonePermissionsCheckbox) clonePermissionsCheckbox.checked = true;
        if (cloneProfileCheckbox) cloneProfileCheckbox.checked = true;
        if (cloneMessagesCheckbox) cloneMessagesCheckbox.checked = false;
        if (cloneAttachmentsCheckbox) cloneAttachmentsCheckbox.checked = false;
        if (msgLimitInput) {
            msgLimitInput.value = 15;
            if (limitBadge) limitBadge.textContent = '15';
        }
        if (msgDelayInput) {
            msgDelayInput.value = 1000;
            if (delayBadge) delayBadge.textContent = '1000ms';
        }

        syncMessageOptionUI();

        try {
            localStorage.removeItem(CONFIG_STORAGE_KEY);
        } catch (e) {}

        if (configSavedBadge) configSavedBadge.classList.add('hidden');
        showToast('Restored default configuration settings.', 'info');
    }

    if (saveConfigBtn) {
        saveConfigBtn.addEventListener('click', saveUserConfiguration);
    }
    if (resetConfigBtn) {
        resetConfigBtn.addEventListener('click', resetUserConfiguration);
    }

    // Load persisted settings and saved token on startup
    loadUserConfiguration();
    loadUserToken();

    // ==========================================================================
    // 5. Guided Onboarding Tour Engine
    // ==========================================================================
    const TOUR_STORAGE_KEY = 'discloner_tour_completed';

    const TOUR_STEPS = [
        {
            targetSelector: '#userToken',
            fallbackSelector: '.form-group:first-of-type',
            title: '1. Discord User Token',
            desc: 'Provide your personal Discord authorization token. Tokens are processed ephemerally in-memory and are never stored or logged.',
            preferredPos: 'bottom'
        },
        {
            targetSelector: '.routing-layout',
            fallbackSelector: '#sourceId',
            title: '2. Source & Target Routing',
            desc: 'Specify the Source Guild ID to replicate, and your fresh Target Guild ID where structure and assets will be created.',
            preferredPos: 'bottom'
        },
        {
            targetSelector: '#advancedToggleBtn',
            fallbackSelector: '.advanced-accordion-section',
            title: '3. Advanced Configuration',
            desc: 'Toggle options to clean the target server, replicate custom roles, channels & categories, role permissions, server icons, and recent message history.',
            preferredPos: 'bottom',
            onEnter: () => {
                if (advancedPanel && advancedPanel.classList.contains('collapsed')) {
                    advancedPanel.classList.remove('collapsed');
                    if (advancedToggleBtn) advancedToggleBtn.setAttribute('aria-expanded', 'true');
                    if (advancedChevron) advancedChevron.style.transform = 'rotate(90deg)';
                }
            }
        },
        {
            targetSelector: '#configActionsBar',
            fallbackSelector: '#saveConfigBtn',
            title: '4. Save Configuration',
            desc: 'Click "Save Configuration" to persist your customized options (excluding tokens) to local storage so you don\'t have to re-select preferences every visit.',
            preferredPos: 'top',
            onEnter: () => {
                if (advancedPanel && advancedPanel.classList.contains('collapsed')) {
                    advancedPanel.classList.remove('collapsed');
                }
            }
        },
        {
            targetSelector: '#startBtn',
            fallbackSelector: '.cta-actions-group',
            title: '5. Detached Background Engine',
            desc: 'Click "START CLONING" to begin! Migrations run detached in the background on the server — feel free to close the tab or browser anytime.',
            preferredPos: 'top'
        },
        {
            targetSelector: '#progressCard',
            fallbackSelector: '#consoleCard',
            title: '6. Telemetry & Real-Time Console',
            desc: 'Monitor dynamic Estimated Time Remaining (ETA), progress percentages, real-time entity counters, and search-filterable streaming logs.',
            preferredPos: 'left'
        }
    ];

    let currentTourStep = 0;
    let isTourActive = false;

    function renderTourDots() {
        if (!tourDots) return;
        tourDots.innerHTML = '';
        TOUR_STEPS.forEach((_, idx) => {
            const dot = document.createElement('span');
            dot.className = `tour-step-dot ${idx === currentTourStep ? 'active' : (idx < currentTourStep ? 'completed' : '')}`;
            tourDots.appendChild(dot);
        });
    }

    function startTour() {
        currentTourStep = 0;
        isTourActive = true;
        if (tourOverlay) tourOverlay.classList.remove('hidden');
        showTourStep(0);
    }

    function showTourStep(index) {
        if (index < 0 || index >= TOUR_STEPS.length) return;
        currentTourStep = index;

        const step = TOUR_STEPS[index];
        if (typeof step.onEnter === 'function') {
            step.onEnter();
        }

        if (tourTitle) tourTitle.textContent = step.title;
        if (tourDesc) tourDesc.textContent = step.desc;
        if (tourStepCounter) tourStepCounter.textContent = `Step ${index + 1} of ${TOUR_STEPS.length}`;

        if (tourBackBtn) {
            if (index === 0) {
                tourBackBtn.classList.add('hidden');
            } else {
                tourBackBtn.classList.remove('hidden');
            }
        }

        if (tourNextBtnText) {
            tourNextBtnText.textContent = (index === TOUR_STEPS.length - 1) ? 'Finish Tour' : 'Next';
        }

        renderTourDots();

        setTimeout(() => {
            positionTourElements(step);
        }, 50);
    }

    function positionTourElements(step) {
        if (!isTourActive) return;

        let target = document.querySelector(step.targetSelector);
        if (!target && step.fallbackSelector) {
            target = document.querySelector(step.fallbackSelector);
        }
        if (!target) target = document.getElementById('migrationSetupCard') || document.body;

        const isMobile = window.innerWidth <= 768;

        // On mobile, scroll so target is positioned in the upper portion of screen above the bottom card
        if (isMobile) {
            const elemRect = target.getBoundingClientRect();
            const absTop = elemRect.top + window.scrollY;
            const mobileOffset = Math.max(0, absTop - Math.max(80, window.innerHeight * 0.22));
            try {
                window.scrollTo({ top: mobileOffset, behavior: 'smooth' });
            } catch (e) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } else {
            try {
                target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            } catch (e) {}
        }

        const rect = target.getBoundingClientRect();
        const pad = isMobile ? 4 : 6;

        if (tourSpotlight) {
            const spotlightLeft = Math.max(4, rect.left - pad + window.scrollX);
            const spotlightWidth = Math.min(window.innerWidth - 8, rect.width + (pad * 2));
            tourSpotlight.style.top = `${Math.max(0, rect.top - pad + window.scrollY)}px`;
            tourSpotlight.style.left = `${spotlightLeft}px`;
            tourSpotlight.style.width = `${spotlightWidth}px`;
            tourSpotlight.style.height = `${rect.height + (pad * 2)}px`;
        }

        if (!tourCard) return;

        if (isMobile) {
            // Mobile layout is controlled cleanly by CSS fixed bottom sheet
            tourCard.style.top = '';
            tourCard.style.left = '';
            return;
        }

        const cardWidth = 360;
        const cardHeight = tourCard.offsetHeight || 220;
        const margin = 14;

        let top = 0;
        let left = 0;

        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const pref = step.preferredPos || 'bottom';

        if (pref === 'left' && rect.left > cardWidth + 24) {
            top = rect.top + window.scrollY;
            left = rect.left - cardWidth - margin + window.scrollX;
        } else if (pref === 'top' && spaceAbove > cardHeight + 20) {
            top = rect.top - cardHeight - margin + window.scrollY;
            left = Math.min(window.innerWidth - cardWidth - 20, Math.max(16, rect.left + window.scrollX));
        } else if (spaceBelow > cardHeight + 20 || pref === 'bottom') {
            top = rect.bottom + margin + window.scrollY;
            left = Math.min(window.innerWidth - cardWidth - 20, Math.max(16, rect.left + window.scrollX));
        } else {
            top = Math.max(20, rect.top - cardHeight - margin + window.scrollY);
            left = Math.min(window.innerWidth - cardWidth - 20, Math.max(16, rect.left + window.scrollX));
        }

        tourCard.style.top = `${Math.max(10, top)}px`;
        tourCard.style.left = `${Math.max(10, left)}px`;
    }

    function handleTourReposition() {
        if (!isTourActive) return;
        const step = TOUR_STEPS[currentTourStep];
        if (step) positionTourElements(step);
    }

    function nextTourStep() {
        if (currentTourStep < TOUR_STEPS.length - 1) {
            showTourStep(currentTourStep + 1);
        } else {
            endTour(true);
        }
    }

    function prevTourStep() {
        if (currentTourStep > 0) {
            showTourStep(currentTourStep - 1);
        }
    }

    function endTour(completed = false) {
        isTourActive = false;
        if (tourOverlay) tourOverlay.classList.add('hidden');
        if (completed) {
            try {
                localStorage.setItem(TOUR_STORAGE_KEY, 'true');
            } catch (e) {}
            showToast('Onboarding tour finished! You\'re ready to clone.', 'success');
        }
    }

    // Touch Swipe Gesture Support for Mobile
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;

    if (tourCard) {
        tourCard.addEventListener('touchstart', (e) => {
            if (!isTourActive || !e.changedTouches || !e.changedTouches[0]) return;
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
        }, { passive: true });

        tourCard.addEventListener('touchend', (e) => {
            if (!isTourActive || !e.changedTouches || !e.changedTouches[0]) return;
            touchEndX = e.changedTouches[0].screenX;
            touchEndY = e.changedTouches[0].screenY;
            handleTourSwipeGesture();
        }, { passive: true });
    }

    function handleTourSwipeGesture() {
        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;
        // Check for predominately horizontal swipe > 45px
        if (Math.abs(diffX) > 45 && Math.abs(diffX) > Math.abs(diffY) * 1.4) {
            if (diffX < 0) {
                // Swipe Left -> Next
                nextTourStep();
            } else {
                // Swipe Right -> Prev
                prevTourStep();
            }
        }
    }

    if (navTourBtn) {
        navTourBtn.addEventListener('click', () => startTour());
    }
    if (tourCloseBtn) tourCloseBtn.addEventListener('click', () => endTour(false));
    if (tourSkipBtn) tourSkipBtn.addEventListener('click', () => endTour(true));
    if (tourBackBtn) tourBackBtn.addEventListener('click', () => prevTourStep());
    if (tourNextBtn) tourNextBtn.addEventListener('click', () => nextTourStep());
    if (tourBackdrop) tourBackdrop.addEventListener('click', () => endTour(false));

    window.addEventListener('resize', handleTourReposition);
    window.addEventListener('scroll', handleTourReposition, { passive: true });

    document.addEventListener('keydown', (e) => {
        if (!isTourActive) return;
        if (e.key === 'Escape') {
            endTour(false);
        } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
            nextTourStep();
        } else if (e.key === 'ArrowLeft') {
            prevTourStep();
        }
    });

    // First time visitor detection: launch onboarding tour
    try {
        const tourDone = localStorage.getItem(TOUR_STORAGE_KEY);
        if (tourDone !== 'true' && !currentJobId) {
            setTimeout(() => {
                if (!isRunning && !currentJobId) {
                    startTour();
                }
            }, 900);
        }
    } catch (e) {}

    // ==========================================================================
    // 6. Socket Connection & Status
    // ==========================================================================

    socket.on('connect', () => {
        connStatusPill.classList.remove('disconnected');
        connStatusText.textContent = 'Connected';
    });

    socket.on('disconnect', () => {
        connStatusPill.classList.add('disconnected');
        connStatusText.textContent = 'Offline';
        if (isRunning) {
            appendLog('error', 'Disconnected from server gateway. Check connection.', 'DISCONNECTED');
        }
    });

    // ==========================================================================
    // 5. Migration Execution Flow & Preflight Plan Engine
    // ==========================================================================

    function getPayload() {
        return {
            userToken: userTokenInput.value.trim(),
            sourceId: sourceIdInput.value.trim(),
            targetId: targetIdInput.value.trim(),
            options: {
                cleanTarget: cleanTargetCheckbox ? cleanTargetCheckbox.checked : true,
                cloneRoles: cloneRolesCheckbox ? cloneRolesCheckbox.checked : true,
                cloneChannels: cloneChannelsCheckbox ? cloneChannelsCheckbox.checked : true,
                clonePermissions: clonePermissionsCheckbox ? clonePermissionsCheckbox.checked : true,
                cloneProfile: cloneProfileCheckbox ? cloneProfileCheckbox.checked : true,
                cloneEmojis: document.getElementById("cloneEmojis") ? document.getElementById("cloneEmojis").checked : true,
                cloneStickers: document.getElementById("cloneStickers") ? document.getElementById("cloneStickers").checked : true,
                cloneWebhooks: document.getElementById("cloneWebhooks") ? document.getElementById("cloneWebhooks").checked : true,
                cloneMessages: cloneMessagesCheckbox ? cloneMessagesCheckbox.checked : false,
                cloneAttachments: cloneMessagesCheckbox && cloneAttachmentsCheckbox ? (cloneMessagesCheckbox.checked && cloneAttachmentsCheckbox.checked) : false,
                msgLimit: msgLimitInput ? (parseInt(msgLimitInput.value, 10) || 15) : 15,
                msgDelay: msgDelayInput ? (parseInt(msgDelayInput.value, 10) || 1000) : 1000
            }
        };
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (isRunning) return;

        const token = userTokenInput.value.trim();
        const sourceId = sourceIdInput.value.trim();
        const targetId = targetIdInput.value.trim();

        if (!token) {
            showToast('Please enter your Discord authorization token.', 'error');
            userTokenInput.focus();
            return;
        }

        if (!validateSnowflakeInput(sourceIdInput, sourceFeedback, 'Source') || !sourceId) {
            showToast('Please provide a valid 17–20 digit Source Server ID.', 'error');
            sourceIdInput.focus();
            return;
        }

        if (!validateSnowflakeInput(targetIdInput, targetFeedback, 'Target') || !targetId) {
            showToast('Please provide a valid 17–20 digit Target Server ID.', 'error');
            targetIdInput.focus();
            return;
        }

        if (sourceId === targetId) {
            showToast('Source and Target server IDs cannot be identical.', 'error');
            targetIdInput.focus();
            return;
        }

        // Populate Confirmation Modal Initial State
        confirmSourceId.textContent = sourceId;
        confirmTargetId.textContent = targetId;

        if (preflightStatusBadge) {
            preflightStatusBadge.className = 'preflight-status-badge';
            preflightStatusBadge.textContent = 'CHECKING...';
        }
        if (preflightSubText) {
            preflightSubText.textContent = 'Querying guild accessibility & permissions...';
        }
        if (preflightChecksList) {
            preflightChecksList.innerHTML = '<div class="preflight-check-item"><span class="preflight-check-icon info">⏳</span><span>Running preflight validation checks...</span></div>';
        }

        if (confirmCleanupAlert) {
            if (cleanTargetCheckbox && cleanTargetCheckbox.checked) {
                confirmCleanupAlert.classList.remove('hidden');
            } else {
                confirmCleanupAlert.classList.add('hidden');
            }
        }

        if (proceedConfirmBtn) {
            proceedConfirmBtn.disabled = true;
            proceedConfirmBtn.textContent = 'Verifying...';
        }

        isPreflightRunning = true;
        openModal(confirmModal);

        // Run Preflight Check
        const payload = getPayload();
        socket.emit('clone:preflight', payload);
    });

    socket.on('clone:preflight_result', (report) => {
        isPreflightRunning = false;
        if (!preflightChecksList || !preflightStatusBadge || !proceedConfirmBtn) return;

        if (report.sourceGuildName) {
            confirmSourceId.textContent = `${report.sourceGuildName} (${sourceIdInput.value.trim()})`;
        }
        if (report.targetGuildName) {
            confirmTargetId.textContent = `${report.targetGuildName} (${targetIdInput.value.trim()})`;
        }

        if (report.status === 'BLOCKED' || !report.ready) {
            preflightStatusBadge.className = 'preflight-status-badge blocked';
            preflightStatusBadge.textContent = 'BLOCKED';
            if (preflightSubText) preflightSubText.textContent = report.reason || report.error || 'Preflight checks failed';
            proceedConfirmBtn.disabled = true;
            proceedConfirmBtn.textContent = 'Cannot Proceed';
        } else if (report.status === 'WARNING') {
            preflightStatusBadge.className = 'preflight-status-badge warning';
            preflightStatusBadge.textContent = 'READY WITH WARNINGS';
            if (preflightSubText) preflightSubText.textContent = 'Review warnings before proceeding';
            proceedConfirmBtn.disabled = false;
            proceedConfirmBtn.textContent = 'I Understand, Start Migration';
        } else {
            preflightStatusBadge.className = 'preflight-status-badge';
            preflightStatusBadge.textContent = 'READY';
            if (preflightSubText) preflightSubText.textContent = 'All preflight checks passed';
            proceedConfirmBtn.disabled = false;
            proceedConfirmBtn.textContent = 'Start Migration';
        }

        if (Array.isArray(report.checks) && report.checks.length > 0) {
            preflightChecksList.innerHTML = '';
            report.checks.forEach(c => {
                const item = document.createElement('div');
                item.className = 'preflight-check-item';

                const icon = document.createElement('span');
                const st = (c.status || 'info').toLowerCase();
                icon.className = `preflight-check-icon ${st}`;
                icon.textContent = st === 'passed' ? '✓' : st === 'warning' ? '⚠' : st === 'blocked' ? '✕' : 'ℹ';

                const text = document.createElement('span');
                text.textContent = `${c.name}: ${c.detail}`;

                item.appendChild(icon);
                item.appendChild(text);
                preflightChecksList.appendChild(item);
            });
        }
    });

    cancelConfirmBtn.addEventListener('click', () => {
        closeModal(confirmModal);
    });

    proceedConfirmBtn.addEventListener('click', () => {
        closeModal(confirmModal);
        startCloningProcess();
    });

    function startCloningProcess() {
        const payload = getPayload();
        if (payload.userToken) {
            saveUserToken(payload.userToken);
        }

        // Reset Counters
        statCounters = { roles: 0, channels: 0, categories: 0, messages: 0, warnings: 0 };
        updateLiveStatCounts();

        // Switch to Running State
        setRunningState(true);
        clearLogs();
        appendLog('info', `Initiating background migration sequence [Source: ${payload.sourceId} → Target: ${payload.targetId}]`, 'START');

        socket.emit('clone:start', payload);
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            if (!isRunning) return;
            appendLog('warning', 'Sending cancellation signal to background cloner engine...', 'CANCEL_REQ');
            socket.emit('clone:cancel', { jobId: currentJobId, jobToken: currentJobToken });
        });
    }

    function setRunningState(running) {
        isRunning = running;

        if (running) {
            startBtn.classList.add('hidden');
            cancelBtn.classList.remove('hidden');
            
            telemetryEmptyState.classList.add('hidden');
            telemetryActiveView.classList.remove('hidden');

            if (progressCard) progressCard.classList.add('is-running');
            if (form) form.setAttribute('aria-busy', 'true');
            
            setFormDisabled(true);

            if (!operationStartTime) {
                operationStartTime = Date.now();
            }
            if (timerInterval) clearInterval(timerInterval);
            timerInterval = setInterval(updateElapsedTimer, 1000);
            updateElapsedTimer();

            if (stageDot) stageDot.classList.add('pulsing');
            updateWorkflowStepper();
        } else {
            startBtn.classList.remove('hidden');
            cancelBtn.classList.add('hidden');
            setFormDisabled(false);

            if (progressCard) progressCard.classList.remove('is-running');
            if (form) form.removeAttribute('aria-busy');
            updateWorkflowStepper();

            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
            if (stageDot) stageDot.classList.remove('pulsing');
        }
    }

    // ==========================================================================
    // Workflow stepper: mirrors real form state instead of being decorative.
    // ==========================================================================
    const SNOWFLAKE_PATTERN = /^[0-9]{17,20}$/;

    function updateWorkflowStepper() {
        if (!stepToken && !stepRoute && !stepClone) return;

        const tokenReady = Boolean(userTokenInput && userTokenInput.value.trim().length >= 20);
        const sourceValue = sourceIdInput ? sourceIdInput.value.trim() : '';
        const targetValue = targetIdInput ? targetIdInput.value.trim() : '';
        const routeReady = SNOWFLAKE_PATTERN.test(sourceValue)
            && SNOWFLAKE_PATTERN.test(targetValue)
            && sourceValue !== targetValue;

        let currentIndex = 0;              // 0 = token, 1 = route, 2 = clone
        if (tokenReady) currentIndex = 1;
        if (tokenReady && routeReady) currentIndex = 2;
        if (isRunning) currentIndex = 2;

        const steps = [stepToken, stepRoute, stepClone];
        const completed = [
            tokenReady || isRunning,
            (tokenReady && routeReady) || isRunning,
            false // step 3 completes only when the job itself finishes
        ];

        steps.forEach((step, index) => {
            if (!step) return;
            const isCurrent = index === currentIndex;
            const isDone = completed[index] && !isCurrent;

            step.classList.toggle('done', isDone);
            step.classList.toggle('active', isCurrent);
            if (isCurrent) {
                step.setAttribute('aria-current', 'step');
            } else {
                step.removeAttribute('aria-current');
            }
        });
    }

    [userTokenInput, sourceIdInput, targetIdInput].forEach(input => {
        if (!input) return;
        input.addEventListener('input', updateWorkflowStepper);
        input.addEventListener('change', updateWorkflowStepper);
    });

    updateWorkflowStepper();

    function setFormDisabled(disabled) {
        userTokenInput.disabled = disabled;
        sourceIdInput.disabled = disabled;
        targetIdInput.disabled = disabled;
        if (cleanTargetCheckbox) cleanTargetCheckbox.disabled = disabled;
        if (cloneRolesCheckbox) cloneRolesCheckbox.disabled = disabled;
        if (cloneChannelsCheckbox) cloneChannelsCheckbox.disabled = disabled;
        if (clonePermissionsCheckbox) clonePermissionsCheckbox.disabled = disabled;
        if (cloneProfileCheckbox) cloneProfileCheckbox.disabled = disabled;
        if (cloneMessagesCheckbox) cloneMessagesCheckbox.disabled = disabled;
        if (!disabled) {
            syncMessageOptionUI();
        } else {
            if (cloneAttachmentsCheckbox) cloneAttachmentsCheckbox.disabled = true;
        }
        if (msgLimitInput) msgLimitInput.disabled = disabled;
        if (msgDelayInput) msgDelayInput.disabled = disabled;
    }

    // ==========================================================================
    // Estimated Time Remaining (ETA) Calculator & Benchmark Engine
    // ==========================================================================
    let etaSmoothedSeconds = null;
    let lastEtaSampleTs = null;

    function loadHistoricalSpeed() {
        try {
            const stored = localStorage.getItem('discloner_historical_speed');
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed && typeof parsed.avgSecPerChannel === 'number') {
                    return parsed;
                }
            }
        } catch (e) {}
        return {
            avgSecPerChannel: 1.15,
            avgSecPerRole: 0.9,
            cleanSecTarget: 8,
            runsCount: 1
        };
    }

    function saveHistoricalSpeed(durationMs, totalItems = 25) {
        if (!durationMs || durationMs < 2000) return;
        try {
            const totalSecs = durationMs / 1000;
            const currentBench = loadHistoricalSpeed();
            const runs = Math.min(10, (currentBench.runsCount || 1) + 1);
            const weight = 1 / runs;
            
            const estSecPerItem = Math.max(0.35, Math.min(3.5, totalSecs / Math.max(8, totalItems)));
            const newAvg = (currentBench.avgSecPerChannel * (1 - weight)) + (estSecPerItem * weight);

            const updated = {
                avgSecPerChannel: parseFloat(newAvg.toFixed(2)),
                avgSecPerRole: parseFloat((newAvg * 0.8).toFixed(2)),
                cleanSecTarget: parseFloat((newAvg * 6).toFixed(1)),
                runsCount: runs
            };
            localStorage.setItem('discloner_historical_speed', JSON.stringify(updated));
        } catch (e) {}
    }

    function computeBaselineTotalSeconds() {
        const bench = loadHistoricalSpeed();
        const isClean = cleanTargetCheckbox ? cleanTargetCheckbox.checked : true;
        const isRoles = cloneRolesCheckbox ? cloneRolesCheckbox.checked : true;
        const isChannels = cloneChannelsCheckbox ? cloneChannelsCheckbox.checked : true;
        const isMessages = cloneMessagesCheckbox ? cloneMessagesCheckbox.checked : false;
        const isPermissions = clonePermissionsCheckbox ? clonePermissionsCheckbox.checked : true;
        const msgLimit = msgLimitInput ? (parseInt(msgLimitInput.value, 10) || 15) : 15;
        const msgDelay = msgDelayInput ? (parseInt(msgDelayInput.value, 10) || 1000) : 1000;

        let baseSec = 3.5;
        if (isClean) baseSec += bench.cleanSecTarget;
        if (isRoles) baseSec += (10 * bench.avgSecPerRole);
        if (isChannels) baseSec += (16 * bench.avgSecPerChannel);
        if (isPermissions) baseSec += 3;
        if (isMessages) {
            const channelSample = 6;
            const msgTime = channelSample * msgLimit * (msgDelay / 1000);
            baseSec += msgTime;
        }
        return Math.max(8, Math.round(baseSec));
    }

    function resetEtaCalculation() {
        const baseline = computeBaselineTotalSeconds();
        etaSmoothedSeconds = baseline;
        lastEtaSampleTs = Date.now();
        renderEtaDisplay(etaSmoothedSeconds);
    }

    function updateEtaProgress(percent, current, total, stageName) {
        if (!isRunning || !operationStartTime) return;

        const elapsedSec = (Date.now() - operationStartTime) / 1000;
        
        if (percent >= 100) {
            etaSmoothedSeconds = 0;
            renderEtaDisplay(0);
            return;
        }

        let calculatedRemainingSec = null;

        if (percent >= 3 && elapsedSec >= 1.5) {
            const projectedTotalSec = elapsedSec / (percent / 100);
            const empiricalRem = Math.max(1, projectedTotalSec - elapsedSec);

            let itemBasedRem = empiricalRem;
            if (current !== undefined && total !== undefined && total > 0 && current > 0) {
                const secPerItem = Math.max(0.2, elapsedSec / current);
                const remainingInStage = (total - current) * secPerItem;
                itemBasedRem = remainingInStage + (empiricalRem * 0.4);
            }

            calculatedRemainingSec = (empiricalRem * 0.7) + (itemBasedRem * 0.3);
        } else {
            const baselineTotal = computeBaselineTotalSeconds();
            calculatedRemainingSec = Math.max(4, baselineTotal * ((100 - percent) / 100));
        }

        if (etaSmoothedSeconds === null) {
            etaSmoothedSeconds = calculatedRemainingSec;
        } else {
            etaSmoothedSeconds = (etaSmoothedSeconds * 0.65) + (calculatedRemainingSec * 0.35);
        }

        lastEtaSampleTs = Date.now();
        renderEtaDisplay(etaSmoothedSeconds);
    }

    function tickEtaTimer() {
        if (!isRunning || etaSmoothedSeconds === null) return;
        
        if (etaSmoothedSeconds > 1) {
            etaSmoothedSeconds = Math.max(1, etaSmoothedSeconds - 1);
        }
        renderEtaDisplay(etaSmoothedSeconds);
    }

    function renderEtaDisplay(seconds) {
        if (!etaTimer) return;
        if (!isRunning && seconds === 0) {
            etaTimer.textContent = '00:00';
            return;
        }
        if (seconds === null || seconds === undefined) {
            etaTimer.textContent = 'Calculating...';
            return;
        }

        const rounded = Math.round(seconds);
        if (rounded <= 0) {
            etaTimer.textContent = 'Done';
        } else if (rounded < 5) {
            etaTimer.textContent = '< 5s';
        } else if (rounded < 60) {
            etaTimer.textContent = `~${rounded}s`;
        } else {
            const mins = String(Math.floor(rounded / 60)).padStart(2, '0');
            const secs = String(rounded % 60).padStart(2, '0');
            etaTimer.textContent = `${mins}:${secs}`;
        }
    }

    function updateElapsedTimer() {
        if (!operationStartTime) return;
        const totalSeconds = Math.floor((Date.now() - operationStartTime) / 1000);
        const mins = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
        const secs = String(totalSeconds % 60).padStart(2, '0');
        if (elapsedTimer) elapsedTimer.textContent = `${mins}:${secs}`;
        tickEtaTimer();
    }

    function setStatValue(el, value) {
        if (!el) return;
        const next = String(value);
        if (el.textContent === next) return;

        el.textContent = next;
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        // Restart the bump animation on every change.
        el.classList.remove('bumped');
        void el.offsetWidth;
        el.classList.add('bumped');
    }

    function updateLiveStatCounts() {
        setStatValue(liveStatRoles, statCounters.roles);
        setStatValue(liveStatChannels, statCounters.channels);
        setStatValue(liveStatMessages, (cloneMessagesCheckbox && cloneMessagesCheckbox.checked) ? statCounters.messages : 0);
        setStatValue(liveStatWarnings, statCounters.warnings);
    }

    // ==========================================================================
    // 6. Background Job Reconnection & State Hydration Engine
    // ==========================================================================

    function hydrateJobState(job) {
        if (!job) return;

        if (job.sourceId && !sourceIdInput.value) sourceIdInput.value = job.sourceId;
        if (job.targetId && !targetIdInput.value) targetIdInput.value = job.targetId;

        // Populate logs history
        if (Array.isArray(job.logs) && job.logs.length > 0) {
            allLogs = [];
            job.logs.forEach(l => {
                const level = l.level || l.type || 'info';
                const timeStr = l.timestamp ? formatLogTimestamp(l.timestamp) : (l.timeStr || formatCurrentTime());
                allLogs.push({
                    id: l.id || (Date.now() + Math.random()),
                    level,
                    message: l.message,
                    detail: l.detail,
                    timeStr
                });
            });
            rebuildVisibleLogs();
            updateLogCountBadge();
        }

        // Populate stat counters
        if (job.statCounters) {
            statCounters = { ...job.statCounters };
            updateLiveStatCounts();
        }

        if (job.status === 'running') {
            currentJobId = job.id;
            try {
                localStorage.setItem('discloner_active_job_id', job.id);
            } catch (e) {}

            operationStartTime = job.startedAt || Date.now();
            setRunningState(true);

            if (job.stage && stageLabel) {
                stageLabel.textContent = job.stage.label || job.stage.stage || 'Processing in background...';
            }

            if (job.progress) {
                const percent = Math.min(100, Math.max(0, Math.round(job.progress.progress || 0)));
                if (progressBar) progressBar.style.width = `${percent}%`;
                if (progressText) progressText.textContent = `${percent}%`;
                if (progressTrack) {
                    progressTrack.setAttribute('aria-valuenow', percent);
                    progressTrack.setAttribute('aria-valuetext', `${percent}%${job.progress.item ? ` — ${job.progress.item}` : ''}`);
                }
                if (progressItemDetail && job.progress.item) progressItemDetail.textContent = job.progress.item;
                if (progressCounts && job.progress.current !== undefined && job.progress.total !== undefined) {
                    progressCounts.textContent = `${job.progress.current} / ${job.progress.total}`;
                }
                updateEtaProgress(percent, job.progress.current, job.progress.total, job.stage ? (job.stage.label || job.stage.stage) : '');
            } else {
                resetEtaCalculation();
            }

            showToast('Reconnected to active background migration job.', 'info');

        } else if (job.status === 'completed') {
            const lastCompletedId = localStorage.getItem('discloner_last_completed_job');
            if (lastCompletedId !== job.id && currentJobId === job.id) {
                showCompletedModal(job.stats || {}, job.startedAt);
                try {
                    localStorage.setItem('discloner_last_completed_job', job.id);
                    clearActiveJobStorage();
                } catch (e) {}
            }
            setRunningState(false);
            if (progressBar) progressBar.style.width = '100%';
            if (progressText) progressText.textContent = '100%';
            if (stageLabel) stageLabel.textContent = 'Completed';
            if (etaTimer) etaTimer.textContent = '00:00';

        } else if (job.status === 'failed') {
            setRunningState(false);
            if (stageLabel) stageLabel.textContent = 'Error Encountered';
            try {
                clearActiveJobStorage();
            } catch (e) {}
        }
    }

    function formatLogTimestamp(ts) {
        try {
            const d = new Date(ts);
            const h = String(d.getHours()).padStart(2, '0');
            const m = String(d.getMinutes()).padStart(2, '0');
            const s = String(d.getSeconds()).padStart(2, '0');
            return `${h}:${m}:${s}`;
        } catch (e) {
            return formatCurrentTime();
        }
    }

    function showCompletedModal(stats, startedAt) {
        const durationSec = Math.round((stats.durationMs || (startedAt ? Date.now() - startedAt : 0)) / 1000);
        if (statDuration) statDuration.textContent = `${durationSec}s`;
        if (statRoles) statRoles.textContent = stats.rolesCreated ?? stats.roles?.created ?? statCounters.roles;
        if (statCategories) statCategories.textContent = stats.categoriesCreated ?? stats.categories?.created ?? '-';
        if (statChannels) statChannels.textContent = stats.channelsCreated ?? stats.channels?.created ?? statCounters.channels;
        
        if (statPermissions) {
            const applied = stats.permissions?.applied ?? 0;
            statPermissions.textContent = `${applied} applied`;
        }

        if (statCleanup) {
            statCleanup.textContent = stats.cleanup?.status || (cleanTargetCheckbox && cleanTargetCheckbox.checked ? 'Executed' : 'Skipped');
        }

        if (statVerifyStatus) {
            const vStatus = stats.status || stats.verification?.status || 'VERIFIED';
            statVerifyStatus.textContent = vStatus.replace(/_/g, ' ');
            statVerifyStatus.className = `verification-badge ${vStatus.toLowerCase()}`;
        }

        if (statMessages) {
            if (cloneMessagesCheckbox && cloneMessagesCheckbox.checked) {
                const msgCount = stats.messagesCopied ?? stats.messages?.copied ?? statCounters.messages;
                const fileCount = stats.attachmentsCopied ?? stats.attachments?.copied ?? 0;
                statMessages.textContent = `${msgCount} msgs (${fileCount} files)`;
            } else {
                statMessages.textContent = 'Disabled';
            }
        }
        if (statWarnings) statWarnings.textContent = stats.warningsCount ?? statCounters.warnings;

        openModal(summaryModal);
    }

    // ==========================================================================
    // Page Lifecycle: Minimize Resilience & Refresh/Unload Cancellation
    // ==========================================================================

    function cancelActiveJobOnUnload() {
        if (isRunning && currentJobId) {
            const jobIdToCancel = currentJobId;
            const tokenParam = currentJobToken ? `?token=${encodeURIComponent(currentJobToken)}` : '';
            try {
                if (navigator.sendBeacon) {
                    navigator.sendBeacon(`/api/jobs/${encodeURIComponent(jobIdToCancel)}/cancel${tokenParam}`, '');
                } else {
                    fetch(`/api/jobs/${encodeURIComponent(jobIdToCancel)}/cancel${tokenParam}`, {
                        method: 'POST',
                        keepalive: true
                    }).catch(() => {});
                }
            } catch (e) {}
            try {
                socket.emit('clone:cancel', { jobId: jobIdToCancel, jobToken: currentJobToken });
            } catch (e) {}
            try {
                clearActiveJobStorage();
            } catch (e) {}
        }
    }

    window.addEventListener('beforeunload', cancelActiveJobOnUnload);
    window.addEventListener('pagehide', cancelActiveJobOnUnload);

    // Tab minimize / background resilience: keep running without cancellation, sync on return
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            if (isRunning && operationStartTime) {
                updateElapsedTimer();
                updateLiveStatCounts();
            }
        }
    });

    // Socket Connection & Background Sync
    socket.on('connect', () => {
        if (currentJobId) {
            socket.emit('job:subscribe', { jobId: currentJobId });
        }
    });

    socket.on('system:ready', () => {
        if (currentJobId) {
            socket.emit('job:subscribe', { jobId: currentJobId });
        }
    });

    socket.on('job:state', (job) => {
        if (currentJobId && job && job.id === currentJobId) {
            hydrateJobState(job);
        }
    });

    socket.on('clone:started', (payload) => {
        if (payload.jobId) {
            currentJobId = payload.jobId;
            currentJobToken = payload.jobToken || null;
            try {
                localStorage.setItem('discloner_active_job_id', payload.jobId);
                if (payload.jobToken) {
                    localStorage.setItem('discloner_active_job_token', payload.jobToken);
                }
            } catch (e) {}
        }
        operationStartTime = payload.startedAt || Date.now();
        setRunningState(true);
        resetEtaCalculation();
    });

    // Stage transitions are announced through a dedicated polite region; the
    // log stream itself is too chatty to expose to screen readers.
    let lastStageAnnounceAt = 0;
    function announceStage(label, progress) {
        if (!logAnnouncer) return;
        const now = Date.now();
        if (now - lastStageAnnounceAt < 2500) return;
        lastStageAnnounceAt = now;
        const pct = typeof progress === 'number' ? `, ${Math.round(progress)}%` : '';
        logAnnouncer.textContent = `Migration stage: ${label}${pct}`;
    }

    socket.on('clone:stage', (data) => {
        const stageName = data.label || data.stage || 'Processing...';
        if (stageLabel) stageLabel.textContent = stageName;
        appendLog('stage', `Stage: ${stageName}`, 'STAGE');
        announceStage(stageName, data.progress);
    });

    socket.on('clone:progress', (data) => {
        const rawPercent = data.percent !== undefined ? data.percent : (data.progress !== undefined ? data.progress : 0);
        const percent = Math.min(100, Math.max(0, Math.round(rawPercent)));
        if (progressBar) progressBar.style.width = `${percent}%`;
        if (progressText) progressText.textContent = `${percent}%`;
        if (progressTrack) {
            progressTrack.setAttribute('aria-valuenow', percent);
            progressTrack.setAttribute('aria-valuetext', `${percent}%${data.item ? ` — ${data.item}` : ''}`);
        }

        if (data.item && progressItemDetail) {
            progressItemDetail.textContent = data.item;
        }

        if (data.current !== undefined && data.total !== undefined && progressCounts) {
            progressCounts.textContent = `${data.current} / ${data.total}`;
        }

        updateEtaProgress(percent, data.current, data.total, stageLabel ? stageLabel.textContent : '');
    });

    socket.on('clone:log', (entry) => {
        const level = entry.level || entry.type || 'info';
        appendLog(level, entry.message, entry.detail, entry.timestamp);

        if (level === 'warning') {
            statCounters.warnings++;
        }
        if (entry.message && level === 'success') {
            const lower = entry.message.toLowerCase();
            if (lower.includes('role')) statCounters.roles++;
            if (lower.includes('channel') || lower.includes('category')) statCounters.channels++;
            if (lower.includes('message')) statCounters.messages++;
        }
        updateLiveStatCounts();
    });

    socket.on('clone:completed', (payload) => {
        const durationMs = Date.now() - (operationStartTime || Date.now());
        saveHistoricalSpeed(durationMs, statCounters.channels + statCounters.roles);

        setRunningState(false);
        if (progressBar) progressBar.style.width = '100%';
        if (progressText) progressText.textContent = '100%';
        if (stageLabel) stageLabel.textContent = 'Completed';
        if (etaTimer) etaTimer.textContent = '00:00';

        appendLog('success', 'Server migration completed successfully!', 'COMPLETED');
        showToast('Server migration finished successfully!', 'success');

        const stats = payload.stats || payload || {};
        showCompletedModal(stats, operationStartTime);

        try {
            if (payload.jobId) {
                localStorage.setItem('discloner_last_completed_job', payload.jobId);
            }
            clearActiveJobStorage();
            currentJobId = null;
        } catch (e) {}
    });

    socket.on('clone:error', (data) => {
        setRunningState(false);
        if (stageLabel) stageLabel.textContent = 'Error Encountered';
        if (etaTimer) etaTimer.textContent = '-';
        const errMessage = data.message || data.error || 'An unexpected failure occurred during cloning.';
        appendLog('error', errMessage, 'ERROR');
        showToast(errMessage, 'error');
        try {
            clearActiveJobStorage();
            currentJobId = null;
        } catch (e) {}
    });

    socket.on('system:shutdown', (data = {}) => {
        setRunningState(false);
        appendLog('error', `Server is shutting down: ${data.message || 'active migrations were cancelled.'}`, 'SHUTDOWN');
        showToast('Server shut down. Any running migration was cancelled.', 'error', 6000);
        clearActiveJobStorage();
        currentJobId = null;
    });

    socket.on('clone:cancelled', () => {
        setRunningState(false);
        if (stageLabel) stageLabel.textContent = 'Cancelled';
        if (etaTimer) etaTimer.textContent = '-';
        appendLog('warning', 'Operation cancelled by user.', 'CANCELLED');
        showToast('Operation cancelled.', 'warning');
        try {
            clearActiveJobStorage();
            currentJobId = null;
        } catch (e) {}
    });

    // Check active job on boot only if there is a completed snapshot to display
    async function checkActiveJobOnBoot() {
        try {
            const savedJobId = localStorage.getItem('discloner_active_job_id');
            if (savedJobId && currentJobId === savedJobId) {
                const res = await fetch(`/api/jobs/${encodeURIComponent(savedJobId)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.job && data.job.status !== 'running') {
                        hydrateJobState(data.job);
                    }
                }
            }
        } catch (err) {
            // Offline / initial connection
        }
    }
    checkActiveJobOnBoot();

    if (closeSummaryBtn) {
        closeSummaryBtn.addEventListener('click', () => closeModal(summaryModal));
    }
    if (viewLogsSummaryBtn) {
        viewLogsSummaryBtn.addEventListener('click', () => {
            closeModal(summaryModal);
            if (terminal) terminal.scrollIntoView({ behavior: 'smooth' });
        });
    }

    // ==========================================================================
    // 7. Activity Console Engine
    // ==========================================================================

    function appendLog(level, message, detail, timestamp) {
        const timeStr = timestamp || formatCurrentTime();
        const logObj = { id: Date.now() + Math.random(), level, message, detail, timeStr };
        allLogs.push(logObj);

        if (allLogs.length > 2000) {
            allLogs.shift();
        }

        updateLogCountBadge();

        if (matchesCurrentFilterAndSearch(logObj)) {
            renderLogItem(logObj);
            updateConsoleEmptyState(1);
            handleAutoScroll();
        }
    }

    function formatCurrentTime() {
        const d = new Date();
        const h = String(d.getHours()).padStart(2, '0');
        const m = String(d.getMinutes()).padStart(2, '0');
        const s = String(d.getSeconds()).padStart(2, '0');
        return `${h}:${m}:${s}`;
    }

    function getIconForLevel(level) {
        switch (level) {
            case 'success': return '✓';
            case 'warning': return '⚠';
            case 'error': return '✕';
            case 'stage': return '❖';
            default: return '→';
        }
    }

    function renderLogItem(logObj) {
        const entry = document.createElement('div');
        entry.className = `log-entry log-entry-${logObj.level}`;

        const timeSpan = document.createElement('span');
        timeSpan.className = 'log-time font-mono';
        timeSpan.textContent = logObj.timeStr;

        const iconSpan = document.createElement('span');
        iconSpan.className = 'log-icon-type';
        iconSpan.textContent = getIconForLevel(logObj.level);

        const msgSpan = document.createElement('span');
        msgSpan.className = 'log-message';
        msgSpan.textContent = logObj.message;

        if (logObj.detail) {
            const detailBadge = document.createElement('span');
            detailBadge.className = 'log-detail-tag font-mono';
            detailBadge.textContent = logObj.detail;
            msgSpan.appendChild(detailBadge);
        }

        entry.appendChild(timeSpan);
        entry.appendChild(iconSpan);
        entry.appendChild(msgSpan);

        logStream.appendChild(entry);

        while (logStream.children.length > MAX_DOM_LOGS) {
            logStream.removeChild(logStream.firstChild);
        }
    }

    function clearLogs() {
        allLogs = [];
        logStream.innerHTML = '';
        updateLogCountBadge();
        updateConsoleEmptyState(0);
        if (jumpLatestBtn) jumpLatestBtn.classList.add('hidden');
    }

    if (clearLogsBtn) {
        clearLogsBtn.addEventListener('click', clearLogs);
    }

    if (copyLogsBtn) {
        copyLogsBtn.addEventListener('click', async () => {
            if (!allLogs.length) {
                showToast('No logs to copy.', 'info');
                return;
            }
            const rawText = allLogs.map(l => `[${l.timeStr}] [${l.level.toUpperCase()}] ${l.message} ${l.detail ? '(' + l.detail + ')' : ''}`).join('\n');
            try {
                await navigator.clipboard.writeText(rawText);
                showToast('Activity logs copied to clipboard!', 'success');
            } catch (err) {
                showToast('Failed to copy logs to clipboard.', 'error');
            }
        });
    }

    function updateLogCountBadge() {
        if (logCountPill) {
            logCountPill.textContent = `${allLogs.length} entries`;
        }

        // Live per-severity totals on the filter chips.
        const counts = { all: allLogs.length, info: 0, success: 0, warning: 0, error: 0 };
        for (const log of allLogs) {
            if (Object.prototype.hasOwnProperty.call(counts, log.level) && log.level !== 'all') {
                counts[log.level] += 1;
            }
        }

        document.querySelectorAll('.filter-count').forEach(el => {
            const key = el.dataset.count;
            const value = counts[key] ?? 0;
            const text = String(value);
            if (el.textContent !== text) el.textContent = text;
            el.classList.toggle('is-nonzero', value > 0);
        });
    }

    function updateConsoleEmptyState(visibleCount) {
        if (!logEmptyState) return;

        const show = visibleCount === 0;
        logEmptyState.classList.toggle('hidden', !show);
        if (!show) return;

        // Distinguish "nothing has happened yet" from "your filter hides everything".
        const nothingLogged = allLogs.length === 0;
        if (logEmptyTitle) {
            logEmptyTitle.textContent = nothingLogged ? 'No activity yet' : 'No matching activity';
        }
        if (logEmptyDesc) {
            logEmptyDesc.textContent = nothingLogged
                ? 'Log output will stream here once a migration starts.'
                : 'Adjust the severity filter or clear the search to see entries.';
        }
    }

    // Filter Chips
    filterPills.forEach(pill => {
        pill.addEventListener('click', () => {
            filterPills.forEach(p => {
                p.classList.remove('active');
                p.setAttribute('aria-pressed', 'false');
            });
            pill.setAttribute('aria-pressed', 'true');
            pill.classList.add('active');
            currentFilter = pill.dataset.filter || 'all';
            rebuildVisibleLogs();
        });
    });

    if (logSearchInput) {
        logSearchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase().trim();
            rebuildVisibleLogs();
        });
    }

    function matchesCurrentFilterAndSearch(logObj) {
        if (currentFilter !== 'all') {
            if (currentFilter === 'warning' && logObj.level !== 'warning') return false;
            if (currentFilter === 'error' && logObj.level !== 'error') return false;
            if (currentFilter === 'success' && logObj.level !== 'success') return false;
            if (currentFilter === 'info' && logObj.level !== 'info' && logObj.level !== 'stage') return false;
        }

        if (searchQuery) {
            const matchMsg = logObj.message && logObj.message.toLowerCase().includes(searchQuery);
            const matchDetail = logObj.detail && logObj.detail.toLowerCase().includes(searchQuery);
            if (!matchMsg && !matchDetail) return false;
        }

        return true;
    }

    function rebuildVisibleLogs() {
        logStream.innerHTML = '';
        const filtered = allLogs.filter(matchesCurrentFilterAndSearch);
        const toRender = filtered.slice(-MAX_DOM_LOGS);
        toRender.forEach(renderLogItem);
        updateConsoleEmptyState(toRender.length);
        if (isAutoScrollLocked && terminal) {
            terminal.scrollTop = terminal.scrollHeight;
        }
    }

    // Scroll & Jump to Latest
    if (terminal) {
        terminal.addEventListener('scroll', () => {
            const isNearBottom = terminal.scrollHeight - terminal.scrollTop - terminal.clientHeight < 40;
            isAutoScrollLocked = isNearBottom;
            if (isNearBottom && jumpLatestBtn) {
                jumpLatestBtn.classList.add('hidden');
                unreadLogsCount = 0;
            }
        });
    }

    function handleAutoScroll() {
        if (!terminal) return;
        if (isAutoScrollLocked) {
            terminal.scrollTop = terminal.scrollHeight;
        } else {
            unreadLogsCount++;
            if (jumpLatestBtn) {
                jumpLatestBtn.classList.remove('hidden');
                jumpLatestBtn.innerHTML = `<span>↓ New activity (${unreadLogsCount})</span>`;
            }
        }
    }

    if (jumpLatestBtn) {
        jumpLatestBtn.addEventListener('click', () => {
            if (terminal) {
                terminal.scrollTop = terminal.scrollHeight;
                isAutoScrollLocked = true;
                jumpLatestBtn.classList.add('hidden');
                unreadLogsCount = 0;
            }
        });
    }

    // ==========================================================================
    // 7b. Keyboard shortcuts & header condense
    // ==========================================================================

    // Ctrl/Cmd + Enter submits the form exactly like clicking START CLONING.
    document.addEventListener('keydown', (event) => {
        if (!(event.ctrlKey || event.metaKey) || event.key !== 'Enter') return;
        if (isRunning) return;
        if (modalStack.length > 0) return;
        if (!form) return;

        event.preventDefault();
        if (typeof form.requestSubmit === 'function') {
            form.requestSubmit();
        } else {
            form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        }
    });

    // Condense the sticky header once the workspace scrolls away.
    if (mainHeader) {
        let ticking = false;
        const syncHeaderState = () => {
            const condensed = window.scrollY > 24;
            mainHeader.classList.toggle('is-condensed', condensed);
            ticking = false;
        };
        window.addEventListener('scroll', () => {
            if (ticking) return;
            ticking = true;
            window.requestAnimationFrame(syncHeaderState);
        }, { passive: true });
        syncHeaderState();
    }

    // ==========================================================================
    // 8. Toast Notifications System
    // ==========================================================================

    const MAX_VISIBLE_TOASTS = 4;
    let lastToastSignature = '';
    let lastToastAt = 0;

    function showToast(message, type = 'info', duration = 3500) {
        if (!toastContainer) return;

        // Collapse duplicate notifications fired in the same burst.
        const signature = `${type}:${message}`;
        const now = Date.now();
        if (signature === lastToastSignature && now - lastToastAt < 1200) return;
        lastToastSignature = signature;
        lastToastAt = now;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        // Errors interrupt; everything else is announced politely.
        toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

        const text = document.createElement('span');
        text.className = 'toast-text';
        text.textContent = message;

        const dismiss = document.createElement('button');
        dismiss.type = 'button';
        dismiss.className = 'toast-dismiss';
        dismiss.setAttribute('aria-label', 'Dismiss notification');
        dismiss.textContent = '\u00D7';

        toast.appendChild(text);
        toast.appendChild(dismiss);
        toastContainer.appendChild(toast);

        // Keep the stack short so it never covers the workspace.
        while (toastContainer.children.length > MAX_VISIBLE_TOASTS) {
            const oldest = toastContainer.firstElementChild;
            if (oldest) oldest.remove();
        }

        let removed = false;
        const remove = () => {
            if (removed) return;
            removed = true;
            toast.classList.add('toast-leaving');
            setTimeout(() => toast.remove(), 220);
        };

        dismiss.addEventListener('click', remove);
        setTimeout(remove, duration);
    }

})();
