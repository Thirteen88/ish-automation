/**
 * AI Orchestrator Mobile PWA
 *
 * Features:
 * - Service Worker registration
 * - Touch gesture handling
 * - Voice recognition
 * - Offline mode with caching
 * - Push notifications
 * - Share API integration
 * - Pull-to-refresh
 * - Haptic feedback
 */

// Configuration
const API_BASE = window.location.origin.replace(/:\d+$/, ':3000');
let ws = null;
let recognition = null;
let currentQuery = null;
let isOnline = navigator.onLine;
let cachedResponses = new Map();
let notificationPermission = 'default';

// State management
const state = {
    selectedPlatforms: new Set(['lmarena', 'claude', 'chatgpt', 'gemini']),
    currentTab: 'query',
    queries: [],
    platformStatus: {},
    settings: {
        darkMode: window.matchMedia('(prefers-color-scheme: dark)').matches,
        hapticFeedback: true,
        notifications: true,
        autoSubmitVoice: false,
        offlineMode: false
    }
};

// Platform configurations
const PLATFORMS = {
    lmarena: {
        name: 'LMArena',
        icon: '🏟️',
        color: '#8b5cf6'
    },
    claude: {
        name: 'Claude',
        icon: '🤖',
        color: '#d97706'
    },
    chatgpt: {
        name: 'ChatGPT',
        icon: '💬',
        color: '#10b981'
    },
    gemini: {
        name: 'Gemini',
        icon: '✨',
        color: '#3b82f6'
    },
    poe: {
        name: 'Poe',
        icon: '🎭',
        color: '#ec4899'
    }
};

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Initializing AI Orchestrator Mobile PWA...');

    // Register service worker
    await registerServiceWorker();

    // Load settings
    loadSettings();

    // Apply theme
    applyTheme();

    // Initialize UI
    initializePlatformGrid();
    initializeEventListeners();
    initializeVoiceRecognition();
    initializePullToRefresh();

    // Connect to server
    connectWebSocket();

    // Load initial data
    await loadPlatformStatus();
    await loadHistory();

    // Request notification permission
    await requestNotificationPermission();

    // Hide loading screen
    setTimeout(() => {
        document.getElementById('loadingScreen').classList.add('hidden');
    }, 1000);

    console.log('✅ PWA initialized successfully');
});

// Service Worker Registration
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/service-worker.js');
            console.log('✅ Service Worker registered:', registration.scope);

            // Check for updates
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        showToast('New version available! Pull to refresh to update.', 'success');
                    }
                });
            });

            // Handle messages from service worker
            navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);

        } catch (error) {
            console.error('❌ Service Worker registration failed:', error);
        }
    }
}

// Handle Service Worker Messages
function handleServiceWorkerMessage(event) {
    const { type, data } = event.data;

    switch (type) {
        case 'CACHE_UPDATED':
            console.log('📦 Cache updated');
            break;
        case 'BACKGROUND_SYNC':
            console.log('🔄 Background sync completed');
            loadHistory();
            break;
        case 'PUSH_RECEIVED':
            handlePushNotification(data);
            break;
    }
}

// WebSocket Connection
function connectWebSocket() {
    const wsUrl = API_BASE.replace('http', 'ws');

    try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('🔌 WebSocket connected');
            isOnline = true;
            updateOnlineStatus();
        };

        ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            handleWebSocketMessage(message);
        };

        ws.onerror = (error) => {
            console.error('❌ WebSocket error:', error);
        };

        ws.onclose = () => {
            console.log('🔌 WebSocket disconnected');
            isOnline = false;
            updateOnlineStatus();

            // Reconnect after 5 seconds
            setTimeout(connectWebSocket, 5000);
        };

    } catch (error) {
        console.error('❌ WebSocket connection failed:', error);
        isOnline = false;
        updateOnlineStatus();
    }
}

// Handle WebSocket Messages
function handleWebSocketMessage(message) {
    const { type, data } = message;
    console.log('📨 WebSocket message received:', type, data);

    switch (type) {
        case 'query-start':
            handleQueryStart(data);
            break;
        case 'platform-start':
            handlePlatformStart(data);
            break;
        case 'response-chunk':
            handleResponseChunk(data);
            break;
        case 'platform-complete':
            handlePlatformComplete(data);
            break;
        case 'platform-error':
            handlePlatformError(data);
            break;
        case 'query-complete':
            handleQueryComplete(data);
            break;
        case 'platform-status':
            handlePlatformStatusUpdate(data);
            break;
        default:
            console.log('📦 Unhandled message type:', type);
    }
}

// Initialize Platform Grid
function initializePlatformGrid() {
    const grid = document.getElementById('platformGrid');
    grid.innerHTML = '';

    Object.entries(PLATFORMS).forEach(([key, platform]) => {
        const card = document.createElement('div');
        card.className = `platform-card ${state.selectedPlatforms.has(key) ? 'selected' : ''}`;
        card.dataset.platform = key;

        const status = state.platformStatus[key] || { status: 'unknown' };
        const statusClass = status.status === 'healthy' ? '' :
                          status.status === 'error' ? 'error' : 'warning';

        card.innerHTML = `
            <div class="platform-icon" style="background: ${platform.color}20; color: ${platform.color}">
                ${platform.icon}
            </div>
            <div class="platform-name">${platform.name}</div>
            <div class="platform-status">
                <span class="status-dot ${statusClass}"></span>
                <span>${status.status || 'Unknown'}</span>
            </div>
        `;

        card.addEventListener('click', () => togglePlatform(key));
        grid.appendChild(card);
    });
}

// Toggle Platform Selection
function togglePlatform(platform) {
    hapticFeedback('light');

    if (state.selectedPlatforms.has(platform)) {
        state.selectedPlatforms.delete(platform);
    } else {
        state.selectedPlatforms.add(platform);
    }

    // Update UI
    const card = document.querySelector(`[data-platform="${platform}"]`);
    card.classList.toggle('selected');

    // Update submit button
    updateSubmitButton();
}

// Initialize Event Listeners
function initializeEventListeners() {
    // Prompt input
    const promptInput = document.getElementById('promptInput');
    promptInput.addEventListener('input', updateSubmitButton);

    // Submit button
    document.getElementById('submitBtn').addEventListener('click', submitQuery);

    // Voice button
    document.getElementById('voiceBtn').addEventListener('click', toggleVoiceRecognition);

    // Navigation tabs
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => switchTab(item.dataset.tab));
    });

    // Settings button
    document.getElementById('settingsBtn').addEventListener('click', openSettings);

    // Settings modal
    document.getElementById('settingsModal').addEventListener('click', (e) => {
        if (e.target.id === 'settingsModal') {
            closeSettings();
        }
    });

    // Online/offline events
    window.addEventListener('online', () => {
        isOnline = true;
        updateOnlineStatus();
        showToast('Back online!', 'success');
        syncOfflineQueries();
    });

    window.addEventListener('offline', () => {
        isOnline = false;
        updateOnlineStatus();
        showToast('You are offline. Queries will be synced when back online.', 'error');
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            submitQuery();
        }
    });

    // Handle URL actions
    handleURLActions();
}

// Voice Recognition
function initializeVoiceRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();

        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            console.log('🎤 Voice recognition started');
            document.getElementById('voiceBtn').classList.add('listening');
            hapticFeedback('medium');
        };

        recognition.onresult = (event) => {
            const transcript = Array.from(event.results)
                .map(result => result[0].transcript)
                .join('');

            document.getElementById('promptInput').value = transcript;
            updateSubmitButton();
        };

        recognition.onerror = (event) => {
            console.error('❌ Voice recognition error:', event.error);
            showToast('Voice recognition failed. Please try again.', 'error');
            document.getElementById('voiceBtn').classList.remove('listening');
        };

        recognition.onend = () => {
            console.log('🎤 Voice recognition ended');
            document.getElementById('voiceBtn').classList.remove('listening');

            if (state.settings.autoSubmitVoice && document.getElementById('promptInput').value) {
                submitQuery();
            }
        };
    } else {
        console.warn('⚠️ Voice recognition not supported');
        document.getElementById('voiceBtn').disabled = true;
    }
}

function toggleVoiceRecognition() {
    if (!recognition) return;

    hapticFeedback('medium');

    if (document.getElementById('voiceBtn').classList.contains('listening')) {
        recognition.stop();
    } else {
        recognition.start();
    }
}

// Pull to Refresh
function initializePullToRefresh() {
    let startY = 0;
    let currentY = 0;
    let pulling = false;

    const pullIndicator = document.getElementById('pullToRefresh');
    const mainContent = document.getElementById('mainContent');

    mainContent.addEventListener('touchstart', (e) => {
        if (mainContent.scrollTop === 0) {
            startY = e.touches[0].pageY;
            pulling = true;
        }
    });

    mainContent.addEventListener('touchmove', (e) => {
        if (!pulling) return;

        currentY = e.touches[0].pageY;
        const diff = currentY - startY;

        if (diff > 0 && diff < 100) {
            pullIndicator.style.transform = `translateY(${60 + diff}px) rotate(${diff * 3.6}deg)`;
        }
    });

    mainContent.addEventListener('touchend', async (e) => {
        if (!pulling) return;

        const diff = currentY - startY;

        if (diff > 60) {
            hapticFeedback('heavy');
            pullIndicator.classList.add('pulling');
            await refreshData();
            setTimeout(() => {
                pullIndicator.classList.remove('pulling');
                pullIndicator.style.transform = '';
            }, 500);
        } else {
            pullIndicator.style.transform = '';
        }

        pulling = false;
        startY = 0;
        currentY = 0;
    });
}

async function refreshData() {
    console.log('🔄 Refreshing data...');
    await Promise.all([
        loadPlatformStatus(),
        loadHistory()
    ]);
    showToast('Data refreshed!', 'success');
}

// Submit Query
async function submitQuery() {
    const prompt = document.getElementById('promptInput').value.trim();

    if (!prompt || state.selectedPlatforms.size === 0) {
        showToast('Please enter a prompt and select at least one platform', 'error');
        return;
    }

    hapticFeedback('medium');

    const platforms = Array.from(state.selectedPlatforms);

    // Disable submit button
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
        <div class="loading-spinner" style="width: 20px; height: 20px; border-width: 2px;"></div>
        <span>Submitting...</span>
    `;

    try {
        if (!isOnline) {
            // Queue for background sync
            await queueOfflineQuery({ prompt, platforms });
            showToast('Query queued for sync when online', 'success');
            return;
        }

        // Submit query
        const response = await fetch(`${API_BASE}/api/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, platforms })
        });

        const data = await response.json();

        if (data.success) {
            currentQuery = data.queryId;
            showToast('Query submitted successfully!', 'success');

            // Clear input
            document.getElementById('promptInput').value = '';
            updateSubmitButton();

            // Show responses container
            document.getElementById('responsesContainer').innerHTML = '';

            // Send notification
            if (state.settings.notifications && notificationPermission === 'granted') {
                navigator.serviceWorker.ready.then(registration => {
                    registration.showNotification('Query Submitted', {
                        body: `Processing on ${platforms.length} platforms`,
                        icon: '/icons/icon-192x192.png',
                        badge: '/icons/icon-72x72.png',
                        tag: data.queryId,
                        data: { queryId: data.queryId }
                    });
                });
            }
        } else {
            throw new Error(data.error || 'Failed to submit query');
        }

    } catch (error) {
        console.error('❌ Query submission failed:', error);
        showToast('Failed to submit query. Please try again.', 'error');
    } finally {
        // Re-enable submit button
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
            <span>Submit Query</span>
        `;
    }
}

// Handle Query Events
function handleQueryStart(data) {
    console.log('📤 Query started:', data.id);
    currentQuery = data.id;

    // Clear previous responses
    const container = document.getElementById('responsesContainer');
    if (container) {
        container.innerHTML = '';
        container.style.display = 'block';
    }
}

function handlePlatformStart(data) {
    console.log('🔄 Platform started:', data.platform);

    // Add skeleton response card
    const container = document.getElementById('responsesContainer');
    if (container) {
        const card = createResponseCard(data.platform, null, true);
        container.appendChild(card);
    }
}

function handleResponseChunk(data) {
    const { queryId, platform, chunk } = data;

    // Find or create response card
    let card = document.querySelector(`[data-platform="${platform}"]`);
    if (!card) {
        const container = document.getElementById('responsesContainer');
        if (container) {
            card = createResponseCard(platform, '', false);
            container.appendChild(card);
        }
    }

    if (card) {
        const body = card.querySelector('.response-body');
        if (body) {
            // Append chunk to existing content
            if (body.textContent === 'Loading response...' || body.textContent === 'Processing...') {
                body.textContent = chunk;
            } else {
                body.textContent += chunk;
            }

            // Auto-scroll
            body.scrollTop = body.scrollHeight;
        }
    }
}

function handlePlatformComplete(data) {
    const { queryId, platform, response } = data;

    console.log('✅ Platform complete:', platform, 'Response:', response);
    hapticFeedback('light');

    // Find or create response card
    let card = document.querySelector(`[data-platform="${platform}"]`);
    if (!card) {
        const container = document.getElementById('responsesContainer');
        if (container) {
            // Extract the actual response text
            const responseText = typeof response === 'string' ? response :
                               (response?.response || response?.text || '');
            card = createResponseCard(platform, responseText, false);
            container.appendChild(card);
        }
    } else {
        // Update existing card
        card.classList.remove('skeleton');
        const body = card.querySelector('.response-body');
        if (body) {
            // Handle the response data correctly
            const responseText = typeof response === 'string' ? response :
                               (response?.response || response?.text || '');
            body.textContent = responseText;
        }

        // Enable actions
        card.querySelectorAll('.vote-btn, .share-btn').forEach(btn => {
            btn.disabled = false;
        });
    }
}

function handlePlatformError(data) {
    const { queryId, platform, error } = data;

    console.error('❌ Platform error:', platform, error);
    hapticFeedback('medium');

    // Update response card to show error
    const card = document.querySelector(`[data-platform="${platform}"][data-query="${queryId}"]`);
    if (card) {
        card.classList.remove('skeleton');
        const body = card.querySelector('.response-body');
        body.innerHTML = `<div style="color: var(--error);">❌ Error: ${error}</div>`;
    }
}

function handleQueryComplete(data) {
    console.log('✅ Query complete:', data.id);
    hapticFeedback('heavy');

    // Show notification
    if (state.settings.notifications && notificationPermission === 'granted') {
        navigator.serviceWorker.ready.then(registration => {
            registration.showNotification('Query Complete', {
                body: 'All platforms have responded',
                icon: '/icons/icon-192x192.png',
                badge: '/icons/icon-72x72.png',
                tag: data.id,
                vibrate: [200, 100, 200],
                data: { queryId: data.id }
            });
        });
    }

    // Reload history
    loadHistory();
}

function handlePlatformStatusUpdate(data) {
    const { platform, status } = data;
    state.platformStatus[platform] = status;
    initializePlatformGrid();
}

// Create Response Card
function createResponseCard(platform, response, loading = false) {
    const platformInfo = PLATFORMS[platform];
    const card = document.createElement('div');
    card.className = `response-card ${loading ? 'skeleton' : ''}`;
    card.dataset.platform = platform;
    card.dataset.query = currentQuery;

    card.innerHTML = `
        <div class="response-header">
            <div class="response-platform">
                <div class="platform-icon" style="background: ${platformInfo.color}20; color: ${platformInfo.color}; width: 32px; height: 32px; font-size: 16px;">
                    ${platformInfo.icon}
                </div>
                <div>
                    <div class="platform-name">${platformInfo.name}</div>
                    <div class="platform-status" style="font-size: 11px; color: var(--text-secondary);">
                        ${loading ? 'Processing...' : 'Complete'}
                    </div>
                </div>
            </div>
        </div>
        <div class="response-body">
            ${loading ? 'Loading response...' : (response || '')}
        </div>
        <div class="response-footer">
            <div class="vote-buttons">
                <button class="vote-btn" onclick="vote('${platform}', 'up')" ${loading ? 'disabled' : ''}>
                    👍
                </button>
                <button class="vote-btn" onclick="vote('${platform}', 'down')" ${loading ? 'disabled' : ''}>
                    👎
                </button>
                <button class="vote-btn" onclick="vote('${platform}', 'best')" ${loading ? 'disabled' : ''}>
                    ⭐
                </button>
            </div>
            <button class="vote-btn share-btn" onclick="shareResponse('${platform}')" ${loading ? 'disabled' : ''}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                </svg>
            </button>
        </div>
    `;

    // Add swipe gestures
    addSwipeGestures(card);

    return card;
}

// Add Swipe Gestures
function addSwipeGestures(element) {
    let startX = 0;
    let currentX = 0;
    let swiping = false;

    element.addEventListener('touchstart', (e) => {
        startX = e.touches[0].pageX;
        swiping = true;
    });

    element.addEventListener('touchmove', (e) => {
        if (!swiping) return;
        currentX = e.touches[0].pageX;
        const diff = currentX - startX;

        if (Math.abs(diff) > 20) {
            element.style.transform = `translateX(${diff}px)`;
            element.style.opacity = 1 - Math.abs(diff) / 300;
        }
    });

    element.addEventListener('touchend', () => {
        if (!swiping) return;

        const diff = currentX - startX;

        if (Math.abs(diff) > 100) {
            // Swipe detected
            hapticFeedback('medium');
            element.classList.add(diff > 0 ? 'swipe-right' : 'swipe-left');

            setTimeout(() => {
                element.remove();
            }, 300);
        } else {
            // Reset
            element.style.transform = '';
            element.style.opacity = '';
        }

        swiping = false;
        startX = 0;
        currentX = 0;
    });
}

// Vote on Response
async function vote(platform, voteType) {
    hapticFeedback('light');

    try {
        const response = await fetch(`${API_BASE}/api/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                queryId: currentQuery,
                platform,
                vote: voteType
            })
        });

        const data = await response.json();

        if (data.success) {
            // Update button state
            const card = document.querySelector(`[data-platform="${platform}"][data-query="${currentQuery}"]`);
            if (card) {
                card.querySelectorAll('.vote-btn').forEach(btn => {
                    btn.classList.remove('voted');
                });
                event.target.closest('.vote-btn').classList.add('voted');
            }

            showToast('Vote recorded!', 'success');
        }
    } catch (error) {
        console.error('❌ Vote failed:', error);
        showToast('Failed to record vote', 'error');
    }
}

// Share Response
async function shareResponse(platform) {
    hapticFeedback('medium');

    const card = document.querySelector(`[data-platform="${platform}"][data-query="${currentQuery}"]`);
    if (!card) return;

    const response = card.querySelector('.response-body').textContent;
    const platformName = PLATFORMS[platform].name;

    if (navigator.share) {
        try {
            await navigator.share({
                title: `${platformName} Response`,
                text: response,
                url: window.location.href
            });
            showToast('Shared successfully!', 'success');
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('❌ Share failed:', error);
            }
        }
    } else {
        // Fallback: copy to clipboard
        try {
            await navigator.clipboard.writeText(response);
            showToast('Copied to clipboard!', 'success');
        } catch (error) {
            console.error('❌ Copy failed:', error);
            showToast('Failed to copy', 'error');
        }
    }
}

// Load Platform Status
async function loadPlatformStatus() {
    try {
        const response = await fetch(`${API_BASE}/api/status`);
        const data = await response.json();

        if (data.success) {
            state.platformStatus = data.platforms;
            initializePlatformGrid();
        }
    } catch (error) {
        console.error('❌ Failed to load platform status:', error);
    }
}

// Load History
async function loadHistory() {
    try {
        const response = await fetch(`${API_BASE}/api/history?limit=20`);
        const data = await response.json();

        if (data.success) {
            state.queries = data.queries;
            renderHistory();
        }
    } catch (error) {
        console.error('❌ Failed to load history:', error);
    }
}

// Render History
function renderHistory() {
    const container = document.getElementById('historyContainer');
    container.innerHTML = '';

    if (state.queries.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: var(--text-secondary);">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="margin: 0 auto 16px;">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <div>No query history yet</div>
            </div>
        `;
        return;
    }

    state.queries.forEach(query => {
        const card = document.createElement('div');
        card.className = 'response-card';
        card.style.marginBottom = '16px';

        const platformCount = Object.keys(query.responses).length;
        const successCount = Object.values(query.responses).filter(r => r.success).length;

        card.innerHTML = `
            <div class="response-header">
                <div style="flex: 1;">
                    <div style="font-weight: 600; margin-bottom: 4px;">${query.prompt}</div>
                    <div style="font-size: 12px; color: var(--text-secondary);">
                        ${new Date(query.startTime).toLocaleString()}
                    </div>
                </div>
            </div>
            <div class="response-footer">
                <div style="font-size: 12px; color: var(--text-secondary);">
                    ${successCount}/${platformCount} platforms
                </div>
                <button class="vote-btn" onclick="viewQuery('${query.id}')">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                    </svg>
                </button>
            </div>
        `;

        container.appendChild(card);
    });
}

// View Query
async function viewQuery(queryId) {
    hapticFeedback('light');

    try {
        const response = await fetch(`${API_BASE}/api/query/${queryId}`);
        const data = await response.json();

        if (data.success) {
            currentQuery = queryId;
            switchTab('query');

            // Show responses
            const container = document.getElementById('responsesContainer');
            container.innerHTML = '';

            Object.entries(data.query.responses).forEach(([platform, response]) => {
                const card = createResponseCard(platform, response.response, false);
                container.appendChild(card);
            });

            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    } catch (error) {
        console.error('❌ Failed to load query:', error);
        showToast('Failed to load query', 'error');
    }
}

// Switch Tab
function switchTab(tab) {
    hapticFeedback('light');

    state.currentTab = tab;

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.tab === tab);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
    });
    document.getElementById(`${tab}Tab`).classList.remove('hidden');

    // Update header title
    const titles = {
        query: 'AI Orchestrator',
        history: 'Query History',
        status: 'Platform Status'
    };
    document.getElementById('headerTitle').textContent = titles[tab];

    // Load tab data
    if (tab === 'status') {
        renderStatus();
    }
}

// Render Status
function renderStatus() {
    const container = document.getElementById('statusContainer');
    container.innerHTML = '';

    Object.entries(PLATFORMS).forEach(([key, platform]) => {
        const status = state.platformStatus[key] || { status: 'unknown' };

        const card = document.createElement('div');
        card.className = 'response-card';
        card.style.marginBottom = '16px';

        const statusColor = status.status === 'healthy' ? 'var(--success)' :
                          status.status === 'error' ? 'var(--error)' : 'var(--warning)';

        card.innerHTML = `
            <div class="response-header">
                <div class="response-platform">
                    <div class="platform-icon" style="background: ${platform.color}20; color: ${platform.color};">
                        ${platform.icon}
                    </div>
                    <div>
                        <div class="platform-name">${platform.name}</div>
                        <div class="platform-status">
                            <span class="status-dot" style="background: ${statusColor};"></span>
                            <span>${status.status || 'Unknown'}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="response-body" style="font-size: 13px; max-height: none;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <div style="color: var(--text-secondary); margin-bottom: 4px;">Requests</div>
                        <div style="font-weight: 600;">${status.requestCount || 0}</div>
                    </div>
                    <div>
                        <div style="color: var(--text-secondary); margin-bottom: 4px;">Errors</div>
                        <div style="font-weight: 600;">${status.errorCount || 0}</div>
                    </div>
                    <div>
                        <div style="color: var(--text-secondary); margin-bottom: 4px;">Last Check</div>
                        <div style="font-size: 12px;">${status.lastCheck ? new Date(status.lastCheck).toLocaleTimeString() : 'Never'}</div>
                    </div>
                    <div>
                        <div style="color: var(--text-secondary); margin-bottom: 4px;">Avg Response</div>
                        <div style="font-size: 12px;">${status.lastResponse ? status.lastResponse + 'ms' : 'N/A'}</div>
                    </div>
                </div>
            </div>
        `;

        container.appendChild(card);
    });
}

// Offline Query Queue
async function queueOfflineQuery(query) {
    const db = await openDB();
    const tx = db.transaction('pendingQueries', 'readwrite');
    await tx.store.add({
        ...query,
        timestamp: Date.now()
    });
    await tx.done;
}

async function syncOfflineQueries() {
    const db = await openDB();
    const queries = await db.getAll('pendingQueries');

    for (const query of queries) {
        try {
            await submitOfflineQuery(query);
            await db.delete('pendingQueries', query.id);
        } catch (error) {
            console.error('❌ Failed to sync query:', error);
        }
    }
}

async function submitOfflineQuery(query) {
    const response = await fetch(`${API_BASE}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(query)
    });

    if (!response.ok) {
        throw new Error('Failed to submit query');
    }
}

// IndexedDB Helper
async function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('AIOrchestrator', 1);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            if (!db.objectStoreNames.contains('pendingQueries')) {
                db.createObjectStore('pendingQueries', { keyPath: 'id', autoIncrement: true });
            }

            if (!db.objectStoreNames.contains('cachedResponses')) {
                db.createObjectStore('cachedResponses', { keyPath: 'queryId' });
            }
        };
    });
}

// Notifications
async function requestNotificationPermission() {
    if ('Notification' in window) {
        notificationPermission = await Notification.requestPermission();
        console.log('📢 Notification permission:', notificationPermission);
    }
}

function handlePushNotification(data) {
    if (notificationPermission === 'granted') {
        hapticFeedback('medium');
        showToast(data.message || 'New notification', 'success');
    }
}

// Settings
function openSettings() {
    hapticFeedback('medium');

    const modal = document.getElementById('settingsModal');
    const content = document.getElementById('settingsContent');

    content.innerHTML = `
        <div style="margin-bottom: 24px;">
            <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Appearance</h3>
            <label style="display: flex; align-items: center; justify-content: space-between; padding: 12px 0;">
                <span>Dark Mode</span>
                <input type="checkbox" ${state.settings.darkMode ? 'checked' : ''} onchange="toggleDarkMode(this.checked)">
            </label>
        </div>

        <div style="margin-bottom: 24px;">
            <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Feedback</h3>
            <label style="display: flex; align-items: center; justify-content: space-between; padding: 12px 0;">
                <span>Haptic Feedback</span>
                <input type="checkbox" ${state.settings.hapticFeedback ? 'checked' : ''} onchange="toggleHaptic(this.checked)">
            </label>
        </div>

        <div style="margin-bottom: 24px;">
            <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Voice Input</h3>
            <label style="display: flex; align-items: center; justify-content: space-between; padding: 12px 0;">
                <span>Auto-submit after voice</span>
                <input type="checkbox" ${state.settings.autoSubmitVoice ? 'checked' : ''} onchange="toggleAutoSubmitVoice(this.checked)">
            </label>
        </div>

        <div style="margin-bottom: 24px;">
            <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Notifications</h3>
            <label style="display: flex; align-items: center; justify-content: space-between; padding: 12px 0;">
                <span>Enable Notifications</span>
                <input type="checkbox" ${state.settings.notifications ? 'checked' : ''} onchange="toggleNotifications(this.checked)">
            </label>
        </div>

        <button onclick="clearCache()" style="width: 100%; padding: 12px; background: var(--error); color: white; border: none; border-radius: 8px; font-weight: 600; margin-top: 20px;">
            Clear Cache
        </button>
    `;

    modal.classList.add('show');
}

function closeSettings() {
    hapticFeedback('light');
    document.getElementById('settingsModal').classList.remove('show');
}

function toggleDarkMode(enabled) {
    state.settings.darkMode = enabled;
    saveSettings();
    applyTheme();
}

function toggleHaptic(enabled) {
    state.settings.hapticFeedback = enabled;
    saveSettings();
}

function toggleAutoSubmitVoice(enabled) {
    state.settings.autoSubmitVoice = enabled;
    saveSettings();
}

function toggleNotifications(enabled) {
    state.settings.notifications = enabled;
    saveSettings();

    if (enabled && notificationPermission !== 'granted') {
        requestNotificationPermission();
    }
}

async function clearCache() {
    hapticFeedback('heavy');

    if (confirm('Are you sure you want to clear all cached data?')) {
        try {
            // Clear service worker cache
            if ('caches' in window) {
                const cacheNames = await caches.keys();
                await Promise.all(cacheNames.map(name => caches.delete(name)));
            }

            // Clear IndexedDB
            const db = await openDB();
            await db.clear('cachedResponses');

            showToast('Cache cleared successfully!', 'success');
            closeSettings();
        } catch (error) {
            console.error('❌ Failed to clear cache:', error);
            showToast('Failed to clear cache', 'error');
        }
    }
}

function loadSettings() {
    const saved = localStorage.getItem('aiOrchestratorSettings');
    if (saved) {
        Object.assign(state.settings, JSON.parse(saved));
    }
}

function saveSettings() {
    localStorage.setItem('aiOrchestratorSettings', JSON.stringify(state.settings));
}

function applyTheme() {
    document.documentElement.dataset.theme = state.settings.darkMode ? 'dark' : 'light';
}

// Haptic Feedback
function hapticFeedback(intensity = 'medium') {
    if (!state.settings.hapticFeedback) return;

    if ('vibrate' in navigator) {
        const patterns = {
            light: 10,
            medium: 20,
            heavy: 50
        };
        navigator.vibrate(patterns[intensity] || 20);
    }
}

// Toast Notifications
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = type === 'success' ? '✓' : '✗';

    toast.innerHTML = `
        <div style="width: 24px; height: 24px; border-radius: 50%; background: ${type === 'success' ? 'var(--success)' : 'var(--error)'}; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold;">
            ${icon}
        </div>
        <div style="flex: 1;">${message}</div>
    `;

    container.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 100);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Update Submit Button
function updateSubmitButton() {
    const prompt = document.getElementById('promptInput').value.trim();
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = !prompt || state.selectedPlatforms.size === 0;
}

// Update Online Status
function updateOnlineStatus() {
    const header = document.querySelector('header');
    if (!isOnline) {
        header.style.borderTop = '3px solid var(--warning)';
    } else {
        header.style.borderTop = '';
    }
}

// Handle URL Actions
function handleURLActions() {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');

    switch (action) {
        case 'new':
            document.getElementById('promptInput').focus();
            break;
        case 'history':
            switchTab('history');
            break;
        case 'status':
            switchTab('status');
            break;
    }
}

// Global functions for inline event handlers
window.vote = vote;
window.shareResponse = shareResponse;
window.viewQuery = viewQuery;
window.toggleDarkMode = toggleDarkMode;
window.toggleHaptic = toggleHaptic;
window.toggleAutoSubmitVoice = toggleAutoSubmitVoice;
window.toggleNotifications = toggleNotifications;
window.clearCache = clearCache;
