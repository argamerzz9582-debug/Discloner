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
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const progressTrack = document.getElementById('progressTrack');
    const progressItemDetail = document.getElementById('progressItemDetail');
    const progressCounts = document.getElementById('progressCounts');

    // Live Stats
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

    // Modals
    const confirmModal = document.getElementById('confirmModal');
    const confirmSourceId = document.getElementById('confirmSourceId');
    const confirmTargetId = document.getElementById('confirmTargetId');
    const proceedConfirmBtn = document.getElementById('proceedConfirmBtn');
    const cancelConfirmBtn = document.getElementById('cancelConfirmBtn');

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
    const MAX_DOM_LOGS = 600;

    let statCounters = {
        roles: 0,
        channels: 0,
        categories: 0,
        messages: 0,
        warnings: 0
    };

    // ==========================================================================
    // 1. Theme Engine & Persistence
    // ==========================================================================

    function initTheme() {
        const savedTheme = localStorage.getItem('discloner-theme') || 'light';
        applyTheme(savedTheme);
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

    function openModal(modal) {
        if (!modal) return;
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    function closeModal(modal) {
        if (!modal) return;
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }

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

    // Global Modal Escape and Backdrop Handlers
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal(confirmModal);
            closeModal(summaryModal);
            closeModal(helpModal);
            closeModal(templatesModal);
            closeModal(supportModal);
        }
    });

    [confirmModal, summaryModal, helpModal, templatesModal, supportModal].forEach(modal => {
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    closeModal(modal);
                }
            });
        }
    });

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
    // 4. Socket Connection & Status
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
    // 5. Migration Execution Flow
    // ==========================================================================

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

        // Display Confirmation Modal
        confirmSourceId.textContent = sourceId;
        confirmTargetId.textContent = targetId;
        openModal(confirmModal);
    });

    cancelConfirmBtn.addEventListener('click', () => {
        closeModal(confirmModal);
    });

    proceedConfirmBtn.addEventListener('click', () => {
        closeModal(confirmModal);
        startCloningProcess();
    });

    function startCloningProcess() {
        const payload = {
            userToken: userTokenInput.value.trim(),
            sourceId: sourceIdInput.value.trim(),
            targetId: targetIdInput.value.trim(),
            options: {
                cleanTarget: cleanTargetCheckbox ? cleanTargetCheckbox.checked : true,
                cloneRoles: cloneRolesCheckbox ? cloneRolesCheckbox.checked : true,
                cloneChannels: cloneChannelsCheckbox ? cloneChannelsCheckbox.checked : true,
                clonePermissions: clonePermissionsCheckbox ? clonePermissionsCheckbox.checked : true,
                cloneProfile: cloneProfileCheckbox ? cloneProfileCheckbox.checked : true,
                cloneMessages: cloneMessagesCheckbox ? cloneMessagesCheckbox.checked : false,
                cloneAttachments: cloneMessagesCheckbox && cloneAttachmentsCheckbox ? (cloneMessagesCheckbox.checked && cloneAttachmentsCheckbox.checked) : false,
                msgLimit: msgLimitInput ? (parseInt(msgLimitInput.value, 10) || 15) : 15,
                msgDelay: msgDelayInput ? (parseInt(msgDelayInput.value, 10) || 500) : 500
            }
        };

        // Reset Counters
        statCounters = { roles: 0, channels: 0, categories: 0, messages: 0, warnings: 0 };
        updateLiveStatCounts();

        // Switch to Running State
        setRunningState(true);
        clearLogs();
        appendLog('info', `Initiating migration sequence [Source: ${payload.sourceId} → Target: ${payload.targetId}]`, 'START');

        socket.emit('clone:start', payload);
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            if (!isRunning) return;
            appendLog('warning', 'Sending cancellation signal to cloner engine...', 'CANCEL_REQ');
            socket.emit('clone:cancel');
        });
    }

    function setRunningState(running) {
        isRunning = running;

        if (running) {
            startBtn.classList.add('hidden');
            cancelBtn.classList.remove('hidden');
            
            telemetryEmptyState.classList.add('hidden');
            telemetryActiveView.classList.remove('hidden');
            
            setFormDisabled(true);

            operationStartTime = Date.now();
            if (timerInterval) clearInterval(timerInterval);
            timerInterval = setInterval(updateElapsedTimer, 1000);
            updateElapsedTimer();

            if (stageDot) stageDot.classList.add('pulsing');
        } else {
            startBtn.classList.remove('hidden');
            cancelBtn.classList.add('hidden');
            setFormDisabled(false);

            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
            if (stageDot) stageDot.classList.remove('pulsing');
        }
    }

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

    function updateElapsedTimer() {
        if (!operationStartTime) return;
        const totalSeconds = Math.floor((Date.now() - operationStartTime) / 1000);
        const mins = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
        const secs = String(totalSeconds % 60).padStart(2, '0');
        if (elapsedTimer) elapsedTimer.textContent = `${mins}:${secs}`;
    }

    function updateLiveStatCounts() {
        if (liveStatRoles) liveStatRoles.textContent = statCounters.roles;
        if (liveStatChannels) liveStatChannels.textContent = statCounters.channels;
        if (liveStatMessages) liveStatMessages.textContent = (cloneMessagesCheckbox && cloneMessagesCheckbox.checked) ? statCounters.messages : '0';
        if (liveStatWarnings) liveStatWarnings.textContent = statCounters.warnings;
    }

    // ==========================================================================
    // 6. Socket Real-Time Telemetry Handlers
    // ==========================================================================

    socket.on('clone:stage', (data) => {
        const stageName = data.label || data.stage || 'Processing...';
        if (stageLabel) stageLabel.textContent = stageName;
        appendLog('stage', `Stage: ${stageName}`, 'STAGE');
    });

    socket.on('clone:progress', (data) => {
        const rawPercent = data.percent !== undefined ? data.percent : (data.progress !== undefined ? data.progress : 0);
        const percent = Math.min(100, Math.max(0, Math.round(rawPercent)));
        if (progressBar) progressBar.style.width = `${percent}%`;
        if (progressText) progressText.textContent = `${percent}%`;
        if (progressTrack) progressTrack.setAttribute('aria-valuenow', percent);

        if (data.item && progressItemDetail) {
            progressItemDetail.textContent = data.item;
        }

        if (data.current !== undefined && data.total !== undefined && progressCounts) {
            progressCounts.textContent = `${data.current} / ${data.total}`;
        }
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
        setRunningState(false);
        if (progressBar) progressBar.style.width = '100%';
        if (progressText) progressText.textContent = '100%';
        if (stageLabel) stageLabel.textContent = 'Completed';

        appendLog('success', 'Server migration completed successfully!', 'COMPLETED');
        showToast('Server migration finished successfully!', 'success');

        const stats = payload.stats || payload || {};
        const durationSec = Math.round((stats.durationMs || (Date.now() - operationStartTime)) / 1000);
        if (statDuration) statDuration.textContent = `${durationSec}s`;
        if (statRoles) statRoles.textContent = stats.rolesCreated ?? statCounters.roles;
        if (statCategories) statCategories.textContent = stats.categoriesCreated ?? '-';
        if (statChannels) statChannels.textContent = stats.channelsCreated ?? statCounters.channels;
        
        if (statMessages) {
            if (cloneMessagesCheckbox && cloneMessagesCheckbox.checked) {
                statMessages.textContent = stats.messagesCopied ?? stats.messagesCloned ?? statCounters.messages;
            } else {
                statMessages.textContent = 'Disabled';
            }
        }
        if (statWarnings) statWarnings.textContent = stats.warningsCount ?? statCounters.warnings;

        openModal(summaryModal);
    });

    socket.on('clone:error', (data) => {
        setRunningState(false);
        if (stageLabel) stageLabel.textContent = 'Error Encountered';
        const errMessage = data.message || data.error || 'An unexpected failure occurred during cloning.';
        appendLog('error', errMessage, 'ERROR');
        showToast(errMessage, 'error');
    });

    socket.on('clone:cancelled', () => {
        setRunningState(false);
        if (stageLabel) stageLabel.textContent = 'Cancelled';
        appendLog('warning', 'Operation cancelled by user.', 'CANCELLED');
        showToast('Operation cancelled.', 'warning');
    });

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
    }

    // Filter Chips
    filterPills.forEach(pill => {
        pill.addEventListener('click', () => {
            filterPills.forEach(p => p.classList.remove('active'));
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
    // 8. Toast Notifications System
    // ==========================================================================

    function showToast(message, type = 'info', duration = 3500) {
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;

        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        }, duration);
    }

})();
