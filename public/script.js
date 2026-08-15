/**
 * Discord Server Cloner - Frontend Client
 */

(function () {
    'use strict';

    // Socket Connection
    const socket = io();

    // DOM Elements - Form & Inputs
    const form = document.getElementById('clonerForm');
    const userTokenInput = document.getElementById('userToken');
    const toggleTokenBtn = document.getElementById('toggleTokenVisibility');
    const clearTokenBtn = document.getElementById('clearTokenBtn');
    const eyeIcon = document.getElementById('eyeIcon');
    const sourceIdInput = document.getElementById('sourceId');
    const targetIdInput = document.getElementById('targetId');

    // Options
    const cloneRolesCheckbox = document.getElementById('cloneRoles');
    const cloneChannelsCheckbox = document.getElementById('cloneChannels');
    const clonePermissionsCheckbox = document.getElementById('clonePermissions');
    const cloneProfileCheckbox = document.getElementById('cloneProfile');
    const cloneMessagesCheckbox = document.getElementById('cloneMessages');
    const cloneAttachmentsCheckbox = document.getElementById('cloneAttachments');
    const cleanTargetCheckbox = document.getElementById('cleanTarget');
    const msgLimitInput = document.getElementById('msgLimit');
    const msgDelayInput = document.getElementById('msgDelay');
    const limitBadge = document.getElementById('limitBadge');
    const delayBadge = document.getElementById('delayBadge');

    // Accordion
    const advancedToggleBtn = document.getElementById('advancedToggleBtn');
    const advancedPanel = document.getElementById('advancedPanel');

    // Buttons
    const startBtn = document.getElementById('startBtn');
    const startBtnText = document.getElementById('startBtnText');
    const cancelBtn = document.getElementById('cancelBtn');

    // Telemetry & Progress
    const connStatusPill = document.getElementById('connStatus');
    const connStatusText = document.getElementById('connStatusText');
    const stagePill = document.getElementById('stagePill');
    const stageDot = document.getElementById('stageDot');
    const stageLabel = document.getElementById('stageLabel');
    const elapsedTimer = document.getElementById('elapsedTimer');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const progressItemDetail = document.getElementById('progressItemDetail');
    const progressCounts = document.getElementById('progressCounts');

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
    const helpModalBtn = document.getElementById('helpModalBtn');
    const closeHelpBtn = document.getElementById('closeHelpBtn');
    const dismissHelpBtn = document.getElementById('dismissHelpBtn');
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
    const MAX_DOM_LOGS = 500;

    // 1. Socket Lifecycle Events
    socket.on('connect', () => {
        connStatusPill.classList.remove('disconnected');
        connStatusText.textContent = 'Connected';
    });

    socket.on('disconnect', () => {
        connStatusPill.classList.add('disconnected');
        connStatusText.textContent = 'Offline';
    });

    // 2. Token Input Helpers
    toggleTokenBtn.addEventListener('click', () => {
        const isPassword = userTokenInput.type === 'password';
        userTokenInput.type = isPassword ? 'text' : 'password';
        eyeIcon.innerHTML = isPassword
            ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
            : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
    });

    clearTokenBtn.addEventListener('click', () => {
        userTokenInput.value = '';
        userTokenInput.focus();
    });

    // 3. Range Slider Label Updates
    msgLimitInput.addEventListener('input', (e) => {
        limitBadge.textContent = e.target.value;
    });

    msgDelayInput.addEventListener('input', (e) => {
        delayBadge.textContent = `${e.target.value}ms`;
    });

    // 4. Advanced Options Accordion
    advancedToggleBtn.addEventListener('click', () => {
        const isExpanded = advancedToggleBtn.getAttribute('aria-expanded') === 'true';
        advancedToggleBtn.setAttribute('aria-expanded', String(!isExpanded));
        advancedPanel.classList.toggle('collapsed', isExpanded);
    });

    // 5. Help Modal Handlers
    const openHelp = () => helpModal.classList.remove('hidden');
    const closeHelp = () => helpModal.classList.add('hidden');
    helpModalBtn.addEventListener('click', openHelp);
    closeHelpBtn.addEventListener('click', closeHelp);
    dismissHelpBtn.addEventListener('click', closeHelp);

    // 6. Confirmation Modal & Form Submission
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (isRunning) return;

        const sourceId = sourceIdInput.value.trim();
        const targetId = targetIdInput.value.trim();

        if (!sourceId || !targetId) {
            showToast('Please enter both Source and Target Server IDs.', 'error');
            return;
        }

        if (sourceId === targetId) {
            showToast('Source and Target Server IDs cannot be the same.', 'error');
            return;
        }

        // Show confirmation modal
        confirmSourceId.textContent = sourceId;
        confirmTargetId.textContent = targetId;
        confirmModal.classList.remove('hidden');
    });

    cancelConfirmBtn.addEventListener('click', () => {
        confirmModal.classList.add('hidden');
    });

    proceedConfirmBtn.addEventListener('click', () => {
        confirmModal.classList.add('hidden');
        startMigration();
    });

    // 7. Start Migration Function
    function startMigration() {
        const userToken = userTokenInput.value.trim();
        const sourceId = sourceIdInput.value.trim();
        const targetId = targetIdInput.value.trim();

        const options = {
            cloneRoles: cloneRolesCheckbox.checked,
            cloneChannels: cloneChannelsCheckbox.checked,
            clonePermissions: clonePermissionsCheckbox.checked,
            cloneProfile: cloneProfileCheckbox.checked,
            cloneMessages: cloneMessagesCheckbox.checked,
            cloneAttachments: cloneAttachmentsCheckbox.checked,
            cleanTarget: cleanTargetCheckbox.checked,
            msgLimit: parseInt(msgLimitInput.value, 10),
            msgDelay: parseInt(msgDelayInput.value, 10)
        };

        // Reset UI States
        setRunningState(true);
        updateProgress(0, 0, 0, 'Initiating migration sequence...');
        setStage('starting', 'Connecting to Gateway...');
        
        startTimer();

        socket.emit('clone:start', {
            userToken,
            sourceId,
            targetId,
            options
        });
    }

    // 8. Cancel Migration Function
    cancelBtn.addEventListener('click', () => {
        if (!isRunning) return;
        socket.emit('clone:cancel');
        cancelBtn.disabled = true;
        cancelBtn.textContent = 'Cancelling...';
    });

    // 9. State Management Helpers
    function setRunningState(running) {
        isRunning = running;
        startBtn.disabled = running;
        userTokenInput.disabled = running;
        sourceIdInput.disabled = running;
        targetIdInput.disabled = running;

        if (running) {
            startBtnText.textContent = 'Migration in Progress...';
            cancelBtn.classList.remove('hidden');
            cancelBtn.disabled = false;
            cancelBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-action-icon">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                </svg>
                <span>Cancel</span>
            `;
            stageDot.classList.add('pulsing');
        } else {
            startBtnText.textContent = 'Start Migration Sequence';
            cancelBtn.classList.add('hidden');
            stageDot.classList.remove('pulsing');
            stopTimer();
        }
    }

    function setStage(stageKey, label) {
        stageLabel.textContent = label;
    }

    function updateProgress(percent, current, total, itemText) {
        progressBar.style.width = `${percent}%`;
        progressText.textContent = `${percent}%`;
        if (itemText) progressItemDetail.textContent = itemText;
        if (total > 0) {
            progressCounts.textContent = `${current} / ${total}`;
        } else {
            progressCounts.textContent = '-';
        }
    }

    // Timer management
    function startTimer() {
        operationStartTime = Date.now();
        elapsedTimer.textContent = '00:00';
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            if (!operationStartTime) return;
            const diffSeconds = Math.floor((Date.now() - operationStartTime) / 1000);
            const mins = String(Math.floor(diffSeconds / 60)).padStart(2, '0');
            const secs = String(diffSeconds % 60).padStart(2, '0');
            elapsedTimer.textContent = `${mins}:${secs}`;
        }, 1000);
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    // 10. Socket Inbound Events Handlers
    socket.on('clone:stage', (data) => {
        setStage(data.stage, data.label);
        if (typeof data.progress === 'number') {
            updateProgress(data.progress, 0, 0, data.label);
        }
    });

    socket.on('clone:progress', (data) => {
        updateProgress(data.progress, data.current, data.total, data.item);
    });

    socket.on('clone:log', (entry) => {
        appendLogEntry(entry);
    });

    socket.on('clone:completed', (data) => {
        setRunningState(false);
        updateProgress(100, 1, 1, 'Completed');
        setStage('completed', 'Migration Completed');

        if (data.stats) {
            const stats = data.stats;
            statDuration.textContent = `${(stats.durationMs / 1000).toFixed(1)}s`;
            statRoles.textContent = stats.rolesCreated;
            statCategories.textContent = stats.categoriesCreated;
            statChannels.textContent = stats.channelsCreated;
            statMessages.textContent = stats.messagesCopied;
            statWarnings.textContent = stats.warningsCount;
            summaryModal.classList.remove('hidden');
        }
        showToast('Discord migration sequence completed successfully!', 'success');
    });

    socket.on('clone:error', (data) => {
        setRunningState(false);
        setStage('error', 'Operation Halted');
        startBtnText.textContent = 'Retry Migration';
        showToast(data.message || 'An error occurred.', 'error');
    });

    socket.on('clone:cancelled', () => {
        setRunningState(false);
        setStage('cancelled', 'Operation Cancelled');
        startBtnText.textContent = 'Start Migration Sequence';
        showToast('Operation was cancelled.', 'warning');
    });

    // Summary Modal buttons
    closeSummaryBtn.addEventListener('click', () => summaryModal.classList.add('hidden'));
    viewLogsSummaryBtn.addEventListener('click', () => {
        summaryModal.classList.add('hidden');
        terminal.scrollIntoView({ behavior: 'smooth' });
    });

    // 11. Activity Console Logging Engine
    function appendLogEntry(entry) {
        allLogs.push(entry);
        updateLogCount();

        // Check filter & search match
        if (matchesFilterAndSearch(entry)) {
            renderLogNode(entry);
        }

        if (!isAutoScrollLocked) {
            unreadLogsCount++;
            jumpLatestBtn.classList.remove('hidden');
            jumpLatestBtn.textContent = `↓ New activity (${unreadLogsCount})`;
        } else {
            scrollToBottom();
        }
    }

    function renderLogNode(entry) {
        const div = document.createElement('div');
        div.className = `log-entry log-entry-${entry.type}`;

        const timeSpan = document.createElement('span');
        timeSpan.className = 'log-time';
        timeSpan.textContent = entry.timestamp || '00:00:00';

        const iconSpan = document.createElement('span');
        iconSpan.className = 'log-icon-type';
        iconSpan.textContent = getLogIcon(entry.type);

        const msgSpan = document.createElement('span');
        msgSpan.className = 'log-message';
        msgSpan.textContent = entry.message;

        if (entry.detail) {
            const detailTag = document.createElement('span');
            detailTag.className = 'log-detail-tag';
            detailTag.textContent = entry.detail;
            msgSpan.appendChild(detailTag);
        }

        div.appendChild(timeSpan);
        div.appendChild(iconSpan);
        div.appendChild(msgSpan);

        logStream.appendChild(div);

        // Keep DOM manageable (prune oldest)
        if (logStream.children.length > MAX_DOM_LOGS) {
            logStream.removeChild(logStream.firstElementChild);
        }
    }

    function getLogIcon(type) {
        switch (type) {
            case 'success': return '✓';
            case 'warning': return '⚠';
            case 'error': return '✕';
            case 'stage': return '❖';
            default: return '→';
        }
    }

    function matchesFilterAndSearch(entry) {
        if (currentFilter !== 'all' && entry.type !== currentFilter) {
            return false;
        }
        if (searchQuery) {
            const textToSearch = `${entry.message} ${entry.detail || ''} ${entry.stage || ''}`.toLowerCase();
            return textToSearch.includes(searchQuery);
        }
        return true;
    }

    function rebuildLogStream() {
        logStream.innerHTML = '';
        const matching = allLogs.filter(matchesFilterAndSearch);
        const toRender = matching.slice(-MAX_DOM_LOGS);
        toRender.forEach(renderLogNode);
        if (isAutoScrollLocked) {
            scrollToBottom();
        }
    }

    function updateLogCount() {
        logCountPill.textContent = `${allLogs.length} entries`;
    }

    // Scroll Detection
    terminal.addEventListener('scroll', () => {
        const threshold = 40;
        const atBottom = terminal.scrollHeight - terminal.scrollTop - terminal.clientHeight <= threshold;
        isAutoScrollLocked = atBottom;

        if (atBottom) {
            unreadLogsCount = 0;
            jumpLatestBtn.classList.add('hidden');
        }
    });

    jumpLatestBtn.addEventListener('click', () => {
        isAutoScrollLocked = true;
        unreadLogsCount = 0;
        jumpLatestBtn.classList.add('hidden');
        scrollToBottom();
    });

    function scrollToBottom() {
        terminal.scrollTop = terminal.scrollHeight;
    }

    // Filter pills
    filterPills.forEach((btn) => {
        btn.addEventListener('click', () => {
            filterPills.forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.getAttribute('data-filter');
            rebuildLogStream();
        });
    });

    // Search input
    logSearchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim().toLowerCase();
        rebuildLogStream();
    });

    // Copy Logs
    copyLogsBtn.addEventListener('click', () => {
        if (allLogs.length === 0) {
            showToast('No logs to copy.', 'warning');
            return;
        }
        const formatted = allLogs.map((l) => 
            `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.message}${l.detail ? ` (${l.detail})` : ''}`
        ).join('\n');

        navigator.clipboard.writeText(formatted).then(() => {
            showToast('Logs copied to clipboard!', 'success');
        }).catch(() => {
            showToast('Failed to copy to clipboard.', 'error');
        });
    });

    // Clear visible logs
    clearLogsBtn.addEventListener('click', () => {
        allLogs = [];
        logStream.innerHTML = '';
        updateLogCount();
        showToast('Console output cleared.');
    });

    // 12. Toast Notification Helper
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 250);
        }, 3500);
    }

})();
