/**
 * Background Service Worker for AI Orchestrator Extension
 *
 * Features:
 * - Context menu integration
 * - Communication with local orchestrator server
 * - Query management and tracking
 * - Badge notifications
 * - WebSocket connection management
 */

const API_BASE = 'http://localhost:3000';
let wsConnection = null;
let activeQueries = new Map();
let connectionStatus = 'disconnected';

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('AI Orchestrator Extension installed');

  // Create context menus
  createContextMenus();

  // Initialize storage
  initializeStorage();

  // Connect to server
  connectToServer();
});

// Create context menus
function createContextMenus() {
  chrome.contextMenus.removeAll(() => {
    // Main menu
    chrome.contextMenus.create({
      id: 'ask-all-ais',
      title: 'Ask All AIs: "%s"',
      contexts: ['selection']
    });

    // Individual platform menus
    chrome.contextMenus.create({
      id: 'ask-claude',
      title: 'Ask Claude',
      contexts: ['selection'],
      parentId: 'ask-all-ais'
    });

    chrome.contextMenus.create({
      id: 'ask-chatgpt',
      title: 'Ask ChatGPT',
      contexts: ['selection'],
      parentId: 'ask-all-ais'
    });

    chrome.contextMenus.create({
      id: 'ask-gemini',
      title: 'Ask Gemini',
      contexts: ['selection'],
      parentId: 'ask-all-ais'
    });

    chrome.contextMenus.create({
      id: 'ask-lmarena',
      title: 'Ask LMArena',
      contexts: ['selection'],
      parentId: 'ask-all-ais'
    });

    chrome.contextMenus.create({
      id: 'separator-1',
      type: 'separator',
      contexts: ['selection'],
      parentId: 'ask-all-ais'
    });

    // Quick actions
    chrome.contextMenus.create({
      id: 'summarize',
      title: 'Summarize',
      contexts: ['selection'],
      parentId: 'ask-all-ais'
    });

    chrome.contextMenus.create({
      id: 'explain',
      title: 'Explain',
      contexts: ['selection'],
      parentId: 'ask-all-ais'
    });

    chrome.contextMenus.create({
      id: 'translate',
      title: 'Translate',
      contexts: ['selection'],
      parentId: 'ask-all-ais'
    });

    chrome.contextMenus.create({
      id: 'improve',
      title: 'Improve Writing',
      contexts: ['selection'],
      parentId: 'ask-all-ais'
    });
  });
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  const selectedText = info.selectionText;

  if (!selectedText) return;

  let prompt = selectedText;
  let platforms = ['lmarena', 'claude', 'chatgpt', 'gemini'];

  // Handle menu actions
  switch (info.menuItemId) {
    case 'ask-all-ais':
      // Use selected text as-is
      break;

    case 'ask-claude':
      platforms = ['claude'];
      break;

    case 'ask-chatgpt':
      platforms = ['chatgpt'];
      break;

    case 'ask-gemini':
      platforms = ['gemini'];
      break;

    case 'ask-lmarena':
      platforms = ['lmarena'];
      break;

    case 'summarize':
      prompt = `Please provide a concise summary of the following text:\n\n${selectedText}`;
      break;

    case 'explain':
      prompt = `Please explain the following in simple terms:\n\n${selectedText}`;
      break;

    case 'translate':
      prompt = `Please translate the following text to English:\n\n${selectedText}`;
      break;

    case 'improve':
      prompt = `Please improve the writing quality and clarity of the following text:\n\n${selectedText}`;
      break;

    default:
      return;
  }

  // Submit query
  submitQuery(prompt, platforms, tab);
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
  if (command === 'ask-all-ais') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'getSelection' }, (response) => {
          if (response && response.text) {
            submitQuery(response.text, ['lmarena', 'claude', 'chatgpt', 'gemini'], tabs[0]);
          }
        });
      }
    });
  } else if (command === 'open-side-panel') {
    chrome.sidePanel.open();
  }
});

// Submit query to orchestrator
async function submitQuery(prompt, platforms, tab) {
  try {
    const response = await fetch(`${API_BASE}/api/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt,
        platforms
      })
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }

    const data = await response.json();

    if (data.success) {
      const queryId = data.queryId;

      // Track query
      activeQueries.set(queryId, {
        id: queryId,
        prompt,
        platforms,
        status: 'pending',
        responses: {},
        tabId: tab.id,
        timestamp: Date.now()
      });

      // Update badge
      updateBadge();

      // Notify content script
      chrome.tabs.sendMessage(tab.id, {
        action: 'querySubmitted',
        queryId,
        platforms
      });

      // Open side panel
      chrome.sidePanel.open({ windowId: tab.windowId });

      // Save to history
      saveToHistory(queryId, prompt, platforms);

      // Subscribe to WebSocket updates
      if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.send(JSON.stringify({
          type: 'subscribe',
          queryId
        }));
      }

      console.log('Query submitted:', queryId);
    } else {
      throw new Error(data.error || 'Failed to submit query');
    }
  } catch (error) {
    console.error('Error submitting query:', error);

    // Show error notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'AI Orchestrator Error',
      message: `Failed to submit query: ${error.message}`
    });
  }
}

// Connect to WebSocket server
function connectToServer() {
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    return;
  }

  console.log('Connecting to orchestrator server...');
  connectionStatus = 'connecting';
  broadcastConnectionStatus();

  try {
    wsConnection = new WebSocket('ws://localhost:3000');

    wsConnection.onopen = () => {
      console.log('Connected to orchestrator server');
      connectionStatus = 'connected';
      broadcastConnectionStatus();
    };

    wsConnection.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleServerMessage(message);
      } catch (error) {
        console.error('Error parsing server message:', error);
      }
    };

    wsConnection.onerror = (error) => {
      console.error('WebSocket error:', error);
      connectionStatus = 'error';
      broadcastConnectionStatus();
    };

    wsConnection.onclose = () => {
      console.log('Disconnected from orchestrator server');
      connectionStatus = 'disconnected';
      broadcastConnectionStatus();

      // Attempt reconnection after 5 seconds
      setTimeout(() => {
        connectToServer();
      }, 5000);
    };
  } catch (error) {
    console.error('Failed to connect to server:', error);
    connectionStatus = 'error';
    broadcastConnectionStatus();
  }
}

// Handle messages from server
function handleServerMessage(message) {
  switch (message.type) {
    case 'connected':
      console.log('Server connection established');
      break;

    case 'query-start':
      if (activeQueries.has(message.data.id)) {
        const query = activeQueries.get(message.data.id);
        query.status = 'processing';
        activeQueries.set(message.data.id, query);
        broadcastQueryUpdate(query);
      }
      break;

    case 'platform-start':
      handlePlatformStart(message.data);
      break;

    case 'response-chunk':
      handleResponseChunk(message.data);
      break;

    case 'platform-complete':
      handlePlatformComplete(message.data);
      break;

    case 'platform-error':
      handlePlatformError(message.data);
      break;

    case 'query-complete':
      handleQueryComplete(message.data);
      break;

    default:
      console.log('Unknown message type:', message.type);
  }
}

// Handle platform start
function handlePlatformStart(data) {
  const { queryId, platform } = data;

  if (activeQueries.has(queryId)) {
    const query = activeQueries.get(queryId);
    query.responses[platform] = {
      status: 'processing',
      chunks: []
    };
    activeQueries.set(queryId, query);
    broadcastQueryUpdate(query);
  }
}

// Handle response chunk (streaming)
function handleResponseChunk(data) {
  const { queryId, platform, chunk } = data;

  if (activeQueries.has(queryId)) {
    const query = activeQueries.get(queryId);
    if (!query.responses[platform]) {
      query.responses[platform] = { chunks: [] };
    }
    query.responses[platform].chunks.push(chunk);
    activeQueries.set(queryId, query);
    broadcastQueryUpdate(query);
  }
}

// Handle platform completion
function handlePlatformComplete(data) {
  const { queryId, platform, response } = data;

  if (activeQueries.has(queryId)) {
    const query = activeQueries.get(queryId);
    query.responses[platform] = {
      status: 'complete',
      success: true,
      ...response
    };
    activeQueries.set(queryId, query);
    broadcastQueryUpdate(query);
    updateBadge();
  }
}

// Handle platform error
function handlePlatformError(data) {
  const { queryId, platform, error } = data;

  if (activeQueries.has(queryId)) {
    const query = activeQueries.get(queryId);
    query.responses[platform] = {
      status: 'error',
      success: false,
      error
    };
    activeQueries.set(queryId, query);
    broadcastQueryUpdate(query);
  }
}

// Handle query completion
function handleQueryComplete(data) {
  if (activeQueries.has(data.id)) {
    const query = activeQueries.get(data.id);
    query.status = 'completed';
    query.endTime = Date.now();
    activeQueries.set(data.id, query);
    broadcastQueryUpdate(query);
    updateBadge();

    // Show notification
    const completedCount = Object.values(query.responses).filter(r => r.success).length;
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'AI Responses Ready',
      message: `Received ${completedCount} of ${query.platforms.length} responses`
    });
  }
}

// Broadcast query update to all listeners
function broadcastQueryUpdate(query) {
  chrome.runtime.sendMessage({
    action: 'queryUpdate',
    query
  }).catch(() => {
    // Ignore errors if no listeners
  });

  // Notify content script in the tab
  if (query.tabId) {
    chrome.tabs.sendMessage(query.tabId, {
      action: 'queryUpdate',
      query
    }).catch(() => {
      // Ignore errors if tab is closed
    });
  }
}

// Broadcast connection status
function broadcastConnectionStatus() {
  chrome.runtime.sendMessage({
    action: 'connectionStatus',
    status: connectionStatus
  }).catch(() => {
    // Ignore errors if no listeners
  });
}

// Update extension badge
function updateBadge() {
  const pendingCount = Array.from(activeQueries.values())
    .filter(q => q.status === 'processing' || q.status === 'pending')
    .length;

  const completedCount = Array.from(activeQueries.values())
    .filter(q => q.status === 'completed')
    .reduce((total, q) => {
      return total + Object.values(q.responses).filter(r => r.success).length;
    }, 0);

  if (pendingCount > 0) {
    chrome.action.setBadgeText({ text: pendingCount.toString() });
    chrome.action.setBadgeBackgroundColor({ color: '#FF9800' });
  } else if (completedCount > 0) {
    chrome.action.setBadgeText({ text: completedCount.toString() });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });

    // Clear badge after 5 seconds
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, 5000);
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// Initialize storage
async function initializeStorage() {
  const result = await chrome.storage.local.get(['settings', 'history']);

  if (!result.settings) {
    await chrome.storage.local.set({
      settings: {
        defaultPlatforms: ['lmarena', 'claude', 'chatgpt', 'gemini'],
        autoOpenSidePanel: true,
        showFloatingButton: true,
        enableNotifications: true,
        serverUrl: 'http://localhost:3000'
      }
    });
  }

  if (!result.history) {
    await chrome.storage.local.set({
      history: []
    });
  }
}

// Save query to history
async function saveToHistory(queryId, prompt, platforms) {
  const result = await chrome.storage.local.get(['history']);
  const history = result.history || [];

  history.unshift({
    id: queryId,
    prompt: prompt.substring(0, 200), // Truncate for storage
    platforms,
    timestamp: Date.now()
  });

  // Keep only last 100 queries
  if (history.length > 100) {
    history.pop();
  }

  await chrome.storage.local.set({ history });
}

// Message listener for popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'getActiveQueries':
      sendResponse({
        queries: Array.from(activeQueries.values())
      });
      break;

    case 'getConnectionStatus':
      sendResponse({ status: connectionStatus });
      break;

    case 'submitQuery':
      submitQuery(request.prompt, request.platforms, sender.tab || { id: null });
      sendResponse({ success: true });
      break;

    case 'reconnect':
      connectToServer();
      sendResponse({ success: true });
      break;

    case 'clearQuery':
      activeQueries.delete(request.queryId);
      updateBadge();
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ error: 'Unknown action' });
  }

  return true; // Keep message channel open
});

// Check server health on startup
async function checkServerHealth() {
  try {
    const response = await fetch(`${API_BASE}/health`);
    const data = await response.json();

    if (data.success) {
      console.log('Server is healthy');
      connectToServer();
    }
  } catch (error) {
    console.log('Server not available, will retry...');
    setTimeout(checkServerHealth, 10000);
  }
}

// Start health check
checkServerHealth();
