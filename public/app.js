/**
 * AI Orchestrator Frontend Application
 *
 * Features:
 * - WebSocket connection management with auto-reconnect
 * - Real-time UI updates as responses stream in
 * - Platform health status monitoring
 * - Response voting and ranking system
 * - Copy/export functionality
 * - Keyboard shortcuts
 * - Dark mode support
 * - Toast notifications
 * - Auto-detection of prompt type
 */

class AIOrchestrator {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;

        this.state = {
            currentQuery: null,
            queries: [],
            platformStatus: {},
            selectedPlatforms: ['lmarena', 'claude', 'chatgpt', 'gemini'],
            settings: {
                autoScroll: true,
                streaming: true,
                sounds: false,
                darkMode: this.getInitialDarkMode()
            }
        };

        this.platforms = {
            lmarena: { name: 'LMArena', color: 'blue' },
            claude: { name: 'Claude.ai', color: 'purple' },
            chatgpt: { name: 'ChatGPT', color: 'green' },
            gemini: { name: 'Google Gemini', color: 'orange' },
            poe: { name: 'Poe.com', color: 'pink' }
        };

        this.init();
    }

    /**
     * Initialize the application
     */
    async init() {
        this.setupDOM();
        this.setupEventListeners();
        this.setupKeyboardShortcuts();
        this.connectWebSocket();
        await this.loadPlatformStatus();
        await this.loadHistory();
        this.applyDarkMode();
    }

    /**
     * Setup DOM references
     */
    setupDOM() {
        this.elements = {
            // Input
            promptInput: document.getElementById('promptInput'),
            submitBtn: document.getElementById('submitBtn'),
            submitBtnText: document.getElementById('submitBtnText'),
            charCount: document.getElementById('charCount'),

            // Platform selection
            platformSelector: document.getElementById('platformSelector'),
            autoDetectBadges: document.getElementById('autoDetectBadges'),
            detectedBadges: document.getElementById('detectedBadges'),

            // Status
            platformStatus: document.getElementById('platformStatus'),
            currentQueryStatus: document.getElementById('currentQueryStatus'),
            queryStatusBadge: document.getElementById('queryStatusBadge'),
            queryPromptDisplay: document.getElementById('queryPromptDisplay'),
            platformProgress: document.getElementById('platformProgress'),

            // Responses
            responsesContainer: document.getElementById('responsesContainer'),
            comparisonView: document.getElementById('comparisonView'),
            comparisonContent: document.getElementById('comparisonContent'),

            // History
            historyList: document.getElementById('historyList'),

            // Metrics
            totalQueries: document.getElementById('totalQueries'),
            avgResponseTime: document.getElementById('avgResponseTime'),

            // UI Controls
            darkModeToggle: document.getElementById('darkModeToggle'),
            settingsBtn: document.getElementById('settingsBtn'),
            settingsModal: document.getElementById('settingsModal'),
            closeSettingsBtn: document.getElementById('closeSettingsBtn'),
            closeComparisonBtn: document.getElementById('closeComparisonBtn'),

            // Toast
            toastContainer: document.getElementById('toastContainer')
        };

        this.renderPlatformSelector();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Submit button
        this.elements.submitBtn.addEventListener('click', () => this.submitQuery());

        // Prompt input
        this.elements.promptInput.addEventListener('input', (e) => {
            this.updateCharCount();
            this.detectPromptType();
        });

        // Dark mode toggle
        this.elements.darkModeToggle.addEventListener('click', () => this.toggleDarkMode());

        // Settings
        this.elements.settingsBtn.addEventListener('click', () => this.openSettings());
        this.elements.closeSettingsBtn.addEventListener('click', () => this.closeSettings());

        // Comparison
        this.elements.closeComparisonBtn?.addEventListener('click', () => {
            this.elements.comparisonView.classList.add('hidden');
        });

        // Settings modal - click outside to close
        this.elements.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.elements.settingsModal) {
                this.closeSettings();
            }
        });
    }

    /**
     * Setup keyboard shortcuts
     */
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+Enter: Submit query
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                this.submitQuery();
            }

            // Ctrl+K: Clear input
            if (e.ctrlKey && e.key === 'k') {
                e.preventDefault();
                this.elements.promptInput.value = '';
                this.updateCharCount();
            }

            // Ctrl+D: Toggle dark mode
            if (e.ctrlKey && e.key === 'd') {
                e.preventDefault();
                this.toggleDarkMode();
            }

            // /: Focus prompt input
            if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
                e.preventDefault();
                this.elements.promptInput.focus();
            }

            // Escape: Close modals
            if (e.key === 'Escape') {
                this.closeSettings();
                this.elements.comparisonView.classList.add('hidden');
            }
        });
    }

    /**
     * Connect to WebSocket server
     */
    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.reconnectAttempts = 0;
            this.showToast('Connected to server', 'success');
        };

        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleWebSocketMessage(message);
        };

        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.showToast('Disconnected from server', 'warning');
            this.reconnectWebSocket();
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.showToast('Connection error', 'error');
        };
    }

    /**
     * Reconnect to WebSocket with exponential backoff
     */
    reconnectWebSocket() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);

            setTimeout(() => {
                console.log(`Reconnecting... (attempt ${this.reconnectAttempts + 1})`);
                this.reconnectAttempts++;
                this.connectWebSocket();
            }, delay);
        } else {
            this.showToast('Failed to reconnect. Please refresh the page.', 'error');
        }
    }

    /**
     * Handle WebSocket messages
     */
    handleWebSocketMessage(message) {
        switch (message.type) {
            case 'connected':
                this.handleConnected(message.data);
                break;

            case 'query-start':
                this.handleQueryStart(message.data);
                break;

            case 'platform-start':
                this.handlePlatformStart(message.data);
                break;

            case 'response-chunk':
                this.handleResponseChunk(message.data);
                break;

            case 'platform-complete':
                this.handlePlatformComplete(message.data);
                break;

            case 'platform-error':
                this.handlePlatformError(message.data);
                break;

            case 'query-complete':
                this.handleQueryComplete(message.data);
                break;

            case 'platform-status':
                this.handlePlatformStatus(message.data);
                break;

            case 'vote':
                this.handleVoteUpdate(message.data);
                break;

            case 'pong':
                // Heartbeat response
                break;

            default:
                console.log('Unknown message type:', message.type);
        }
    }

    /**
     * Handle initial connection data
     */
    handleConnected(data) {
        if (data.platformStatus) {
            data.platformStatus.forEach(([platform, status]) => {
                this.state.platformStatus[platform] = status;
            });
            this.renderPlatformStatus();
        }

        if (data.recentQueries) {
            this.state.queries = data.recentQueries;
            this.renderHistory();
        }
    }

    /**
     * Handle query start
     */
    handleQueryStart(data) {
        this.state.currentQuery = data;
        this.showCurrentQuery();
        this.elements.submitBtn.disabled = true;
        this.elements.submitBtnText.textContent = 'Processing...';
    }

    /**
     * Handle platform start
     */
    handlePlatformStart(data) {
        this.updatePlatformProgress(data.platform, 'processing');
    }

    /**
     * Handle response chunk (streaming)
     */
    handleResponseChunk(data) {
        if (!this.state.settings.streaming) return;

        const { queryId, platform, chunk } = data;

        if (this.state.currentQuery?.id === queryId) {
            this.appendResponseChunk(platform, chunk);
        }
    }

    /**
     * Handle platform completion
     */
    handlePlatformComplete(data) {
        const { queryId, platform, response } = data;

        if (this.state.currentQuery?.id === queryId) {
            this.updatePlatformProgress(platform, 'complete', response);
            this.renderResponse(platform, response);
        }
    }

    /**
     * Handle platform error
     */
    handlePlatformError(data) {
        const { queryId, platform, error } = data;

        if (this.state.currentQuery?.id === queryId) {
            this.updatePlatformProgress(platform, 'error');
            this.renderError(platform, error);
        }
    }

    /**
     * Handle query completion
     */
    handleQueryComplete(data) {
        this.state.currentQuery = null;
        this.elements.submitBtn.disabled = false;
        this.elements.submitBtnText.textContent = 'Submit Query';
        this.elements.queryStatusBadge.textContent = 'Completed';
        this.elements.queryStatusBadge.className = 'px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';

        this.showToast('Query completed!', 'success');
        this.loadHistory();
        this.loadMetrics();
    }

    /**
     * Handle platform status update
     */
    handlePlatformStatus(data) {
        this.state.platformStatus[data.platform] = data.status;
        this.renderPlatformStatus();
    }

    /**
     * Handle vote update
     */
    handleVoteUpdate(data) {
        // Update UI to show vote was recorded
        console.log('Vote update:', data);
    }

    /**
     * Submit query to server
     */
    async submitQuery() {
        const prompt = this.elements.promptInput.value.trim();

        if (!prompt) {
            this.showToast('Please enter a prompt', 'warning');
            return;
        }

        if (this.state.selectedPlatforms.length === 0) {
            this.showToast('Please select at least one platform', 'warning');
            return;
        }

        try {
            const response = await fetch('/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt,
                    platforms: this.state.selectedPlatforms
                })
            });

            const data = await response.json();

            if (data.success) {
                // Subscribe to this query's updates
                this.ws.send(JSON.stringify({
                    type: 'subscribe',
                    queryId: data.queryId
                }));

                // Clear input
                this.elements.promptInput.value = '';
                this.updateCharCount();

                // Clear responses container
                this.elements.responsesContainer.innerHTML = '';
            } else {
                this.showToast(data.error || 'Failed to submit query', 'error');
            }

        } catch (error) {
            console.error('Submit query error:', error);
            this.showToast('Failed to submit query', 'error');
        }
    }

    /**
     * Load platform status from API
     */
    async loadPlatformStatus() {
        try {
            const response = await fetch('/api/status');
            const data = await response.json();

            if (data.success) {
                this.state.platformStatus = data.platforms;
                this.renderPlatformStatus();
            }
        } catch (error) {
            console.error('Load platform status error:', error);
        }
    }

    /**
     * Load query history from API
     */
    async loadHistory() {
        try {
            const response = await fetch('/api/history?limit=20');
            const data = await response.json();

            if (data.success) {
                this.state.queries = data.queries;
                this.renderHistory();
            }
        } catch (error) {
            console.error('Load history error:', error);
        }
    }

    /**
     * Load metrics from API
     */
    async loadMetrics() {
        try {
            const response = await fetch('/api/metrics');
            const data = await response.json();

            if (data.success) {
                this.elements.totalQueries.textContent = data.metrics.totalRequests;
                this.elements.avgResponseTime.textContent = data.metrics.averageResponseTime;
            }
        } catch (error) {
            console.error('Load metrics error:', error);
        }
    }

    /**
     * Vote on a response
     */
    async submitVote(queryId, platform, vote) {
        try {
            const response = await fetch('/api/vote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ queryId, platform, vote })
            });

            const data = await response.json();

            if (data.success) {
                this.showToast('Vote recorded!', 'success');
            }
        } catch (error) {
            console.error('Submit vote error:', error);
            this.showToast('Failed to record vote', 'error');
        }
    }

    /**
     * Render platform selector
     */
    renderPlatformSelector() {
        this.elements.platformSelector.innerHTML = '';

        for (const [key, platform] of Object.entries(this.platforms)) {
            const isSelected = this.state.selectedPlatforms.includes(key);

            const button = document.createElement('button');
            button.className = `platform-badge px-4 py-2 rounded-lg border-2 transition-all ${
                isSelected
                    ? `bg-${platform.color}-500 border-${platform.color}-500 text-white`
                    : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400'
            }`;
            button.textContent = platform.name;
            button.onclick = () => this.togglePlatform(key);

            this.elements.platformSelector.appendChild(button);
        }
    }

    /**
     * Toggle platform selection
     */
    togglePlatform(platform) {
        const index = this.state.selectedPlatforms.indexOf(platform);

        if (index > -1) {
            this.state.selectedPlatforms.splice(index, 1);
        } else {
            this.state.selectedPlatforms.push(platform);
        }

        this.renderPlatformSelector();
    }

    /**
     * Render platform status indicators
     */
    renderPlatformStatus() {
        this.elements.platformStatus.innerHTML = '';

        for (const [platform, status] of Object.entries(this.state.platformStatus)) {
            const indicator = document.createElement('div');
            indicator.className = 'flex items-center space-x-1';
            indicator.title = `${this.platforms[platform]?.name || platform}: ${status.status}`;

            const dot = document.createElement('div');
            dot.className = `w-2 h-2 rounded-full ${
                status.status === 'healthy' ? 'bg-green-500' :
                status.status === 'processing' ? 'bg-blue-500 animate-pulse' :
                status.status === 'error' ? 'bg-red-500' :
                'bg-gray-400'
            }`;

            indicator.appendChild(dot);
            this.elements.platformStatus.appendChild(indicator);
        }
    }

    /**
     * Show current query status
     */
    showCurrentQuery() {
        if (!this.state.currentQuery) return;

        this.elements.currentQueryStatus.classList.remove('hidden');
        this.elements.queryPromptDisplay.textContent = this.state.currentQuery.prompt;
        this.elements.queryStatusBadge.textContent = 'Processing...';
        this.elements.queryStatusBadge.className = 'px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';

        // Initialize platform progress
        this.elements.platformProgress.innerHTML = '';

        for (const platform of this.state.currentQuery.platforms) {
            const progress = document.createElement('div');
            progress.id = `progress-${platform}`;
            progress.className = 'flex items-center space-x-3 p-2 bg-gray-50 dark:bg-gray-700 rounded';
            progress.innerHTML = `
                <div class="w-4 h-4 rounded-full bg-gray-300 dark:bg-gray-600 animate-pulse-soft"></div>
                <span class="text-sm text-gray-600 dark:text-gray-400">${this.platforms[platform]?.name || platform}</span>
                <span class="ml-auto text-xs text-gray-500 dark:text-gray-500">Waiting...</span>
            `;

            this.elements.platformProgress.appendChild(progress);
        }
    }

    /**
     * Update platform progress
     */
    updatePlatformProgress(platform, status, response = null) {
        const progressEl = document.getElementById(`progress-${platform}`);
        if (!progressEl) return;

        const dot = progressEl.querySelector('div');
        const statusText = progressEl.querySelector('span:last-child');

        switch (status) {
            case 'processing':
                dot.className = 'w-4 h-4 rounded-full bg-blue-500 animate-pulse';
                statusText.textContent = 'Processing...';
                break;
            case 'complete':
                dot.className = 'w-4 h-4 rounded-full bg-green-500';
                statusText.textContent = `Completed (${response.duration}ms)`;
                break;
            case 'error':
                dot.className = 'w-4 h-4 rounded-full bg-red-500';
                statusText.textContent = 'Failed';
                break;
        }
    }

    /**
     * Render response
     */
    renderResponse(platform, response) {
        const container = document.createElement('div');
        container.id = `response-${platform}`;
        container.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden';

        const platformInfo = this.platforms[platform];

        container.innerHTML = `
            <div class="p-4 border-b border-gray-200 dark:border-gray-700 bg-${platformInfo.color}-50 dark:bg-${platformInfo.color}-900/20">
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-3">
                        <div class="w-8 h-8 rounded-full bg-${platformInfo.color}-500 flex items-center justify-center text-white font-semibold text-sm">
                            ${platformInfo.name.charAt(0)}
                        </div>
                        <div>
                            <h4 class="font-semibold text-gray-900 dark:text-white">${platformInfo.name}</h4>
                            <p class="text-xs text-gray-500 dark:text-gray-400">${response.duration}ms</p>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2">
                        <button onclick="app.submitVote('${this.state.currentQuery?.id}', '${platform}', 'up')" class="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" title="Upvote">
                            <svg class="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path>
                            </svg>
                        </button>
                        <button onclick="app.submitVote('${this.state.currentQuery?.id}', '${platform}', 'down')" class="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" title="Downvote">
                            <svg class="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                            </svg>
                        </button>
                        <button onclick="app.submitVote('${this.state.currentQuery?.id}', '${platform}', 'best')" class="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" title="Mark as best">
                            <svg class="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path>
                            </svg>
                        </button>
                        <button onclick="app.copyResponse('${platform}')" class="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" title="Copy response">
                            <svg class="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
            <div class="p-6">
                <div id="response-content-${platform}" class="prose dark:prose-invert max-w-none">
                    ${this.formatResponse(response.response)}
                </div>
            </div>
        `;

        this.elements.responsesContainer.appendChild(container);

        if (this.state.settings.autoScroll) {
            container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    /**
     * Render error
     */
    renderError(platform, error) {
        const container = document.createElement('div');
        container.className = 'bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 p-4';

        const platformInfo = this.platforms[platform];

        container.innerHTML = `
            <div class="flex items-center space-x-3">
                <svg class="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
                </svg>
                <div>
                    <p class="font-semibold text-red-800 dark:text-red-200">${platformInfo.name} Error</p>
                    <p class="text-sm text-red-600 dark:text-red-300">${error}</p>
                </div>
            </div>
        `;

        this.elements.responsesContainer.appendChild(container);
    }

    /**
     * Append response chunk for streaming
     */
    appendResponseChunk(platform, chunk) {
        const contentEl = document.getElementById(`response-content-${platform}`);
        if (!contentEl) {
            // Create placeholder if not exists
            this.renderResponse(platform, { response: chunk, duration: 0 });
        } else {
            const chunkEl = document.createElement('span');
            chunkEl.className = 'response-chunk';
            chunkEl.textContent = chunk;
            contentEl.appendChild(chunkEl);
        }
    }

    /**
     * Format response text with markdown-like formatting
     */
    formatResponse(text) {
        // Simple markdown-like formatting
        let formatted = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code class="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">$1</code>')
            .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
            .replace(/\n/g, '<br>');

        return formatted;
    }

    /**
     * Copy response to clipboard
     */
    async copyResponse(platform) {
        const contentEl = document.getElementById(`response-content-${platform}`);
        if (!contentEl) return;

        try {
            await navigator.clipboard.writeText(contentEl.textContent);
            this.showToast('Response copied to clipboard!', 'success');
        } catch (error) {
            console.error('Copy error:', error);
            this.showToast('Failed to copy response', 'error');
        }
    }

    /**
     * Render query history
     */
    renderHistory() {
        this.elements.historyList.innerHTML = '';

        if (this.state.queries.length === 0) {
            this.elements.historyList.innerHTML = `
                <div class="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                    No queries yet
                </div>
            `;
            return;
        }

        for (const query of this.state.queries) {
            const item = document.createElement('button');
            item.className = 'w-full p-3 hover:bg-gray-50 dark:hover:bg-gray-700 text-left transition-colors';
            item.onclick = () => this.loadQuery(query.id);

            const truncatedPrompt = query.prompt.length > 60
                ? query.prompt.substring(0, 60) + '...'
                : query.prompt;

            const responseCount = Object.keys(query.responses || {}).length;
            const successCount = Object.values(query.responses || {}).filter(r => r.success).length;

            item.innerHTML = `
                <p class="text-sm text-gray-900 dark:text-white mb-1">${truncatedPrompt}</p>
                <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>${new Date(query.startTime).toLocaleTimeString()}</span>
                    <span>${successCount}/${responseCount} responses</span>
                </div>
            `;

            this.elements.historyList.appendChild(item);
        }
    }

    /**
     * Load query details
     */
    async loadQuery(queryId) {
        try {
            const response = await fetch(`/api/query/${queryId}`);
            const data = await response.json();

            if (data.success) {
                this.state.currentQuery = data.query;
                this.showCurrentQuery();

                // Render all responses
                this.elements.responsesContainer.innerHTML = '';
                for (const [platform, response] of Object.entries(data.query.responses)) {
                    if (response.success) {
                        this.renderResponse(platform, response);
                    } else {
                        this.renderError(platform, response.error);
                    }
                }
            }
        } catch (error) {
            console.error('Load query error:', error);
            this.showToast('Failed to load query', 'error');
        }
    }

    /**
     * Detect prompt type and suggest platforms
     */
    detectPromptType() {
        const prompt = this.elements.promptInput.value;

        if (prompt.length < 20) {
            this.elements.autoDetectBadges.classList.add('hidden');
            return;
        }

        // Simple detection logic
        const suggestions = [];

        if (prompt.match(/code|function|class|programming/i)) {
            suggestions.push('claude', 'chatgpt');
        }

        if (prompt.match(/creative|story|poem|imagine/i)) {
            suggestions.push('claude', 'poe');
        }

        if (prompt.match(/analyze|compare|research/i)) {
            suggestions.push('gemini', 'claude');
        }

        if (suggestions.length > 0) {
            this.elements.autoDetectBadges.classList.remove('hidden');
            this.elements.detectedBadges.innerHTML = suggestions
                .map(p => `<span class="px-2 py-1 text-xs rounded bg-${this.platforms[p].color}-100 text-${this.platforms[p].color}-800 dark:bg-${this.platforms[p].color}-900 dark:text-${this.platforms[p].color}-200">${this.platforms[p].name}</span>`)
                .join('');
        }
    }

    /**
     * Update character count
     */
    updateCharCount() {
        const count = this.elements.promptInput.value.length;
        this.elements.charCount.textContent = `${count} characters`;
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast flex items-center space-x-3 px-4 py-3 rounded-lg shadow-lg ${
            type === 'success' ? 'bg-green-500 text-white' :
            type === 'error' ? 'bg-red-500 text-white' :
            type === 'warning' ? 'bg-yellow-500 text-white' :
            'bg-blue-500 text-white'
        }`;

        toast.innerHTML = `
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
            </svg>
            <span>${message}</span>
        `;

        this.elements.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * Dark mode functions
     */
    getInitialDarkMode() {
        const saved = localStorage.getItem('darkMode');
        if (saved !== null) {
            return saved === 'true';
        }
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    toggleDarkMode() {
        this.state.settings.darkMode = !this.state.settings.darkMode;
        this.applyDarkMode();
        localStorage.setItem('darkMode', this.state.settings.darkMode);
    }

    applyDarkMode() {
        if (this.state.settings.darkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }

    /**
     * Settings functions
     */
    openSettings() {
        this.elements.settingsModal.classList.remove('hidden');
    }

    closeSettings() {
        this.elements.settingsModal.classList.add('hidden');
    }
}

// Initialize app when DOM is ready
let app;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        app = new AIOrchestrator();
    });
} else {
    app = new AIOrchestrator();
}
