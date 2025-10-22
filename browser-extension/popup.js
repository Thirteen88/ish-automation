/**
 * Popup Script for AI Orchestrator Extension
 */

let settings = {};
let connectionStatus = 'disconnected';

// Initialize popup
document.addEventListener('DOMContentLoaded', initialize);

async function initialize() {
  // Load settings
  await loadSettings();

  // Load recent queries
  await loadRecentQueries();

  // Setup event listeners
  setupEventListeners();

  // Check connection status
  checkConnectionStatus();

  // Listen for updates
  chrome.runtime.onMessage.addListener(handleMessage);
}

// Load settings
async function loadSettings() {
  const result = await chrome.storage.local.get(['settings']);
  settings = result.settings || {
    defaultPlatforms: ['lmarena', 'claude', 'chatgpt', 'gemini'],
    autoOpenSidePanel: true,
    showFloatingButton: true,
    enableNotifications: true,
    serverUrl: 'http://localhost:3000'
  };

  // Update UI with saved platform selections
  updatePlatformToggles();
}

// Update platform toggles based on settings
function updatePlatformToggles() {
  const toggles = document.querySelectorAll('.platform-toggle');

  toggles.forEach(toggle => {
    const platform = toggle.dataset.platform;
    const checkbox = toggle.querySelector('input');
    const isSelected = settings.defaultPlatforms.includes(platform);

    checkbox.checked = isSelected;
    if (isSelected) {
      toggle.classList.add('active');
    } else {
      toggle.classList.remove('active');
    }
  });
}

// Load recent queries
async function loadRecentQueries() {
  const result = await chrome.storage.local.get(['history']);
  const history = result.history || [];

  const queryList = document.getElementById('query-list');

  if (history.length === 0) {
    queryList.innerHTML = '<div class="empty-state">No recent queries</div>';
    return;
  }

  queryList.innerHTML = history.slice(0, 10).map(query => `
    <div class="query-item" data-query-id="${query.id}">
      <div class="query-item-text" title="${escapeHtml(query.prompt)}">
        ${escapeHtml(query.prompt)}
      </div>
      <div class="query-item-meta">
        ${formatTimestamp(query.timestamp)} • ${query.platforms.length} platforms
      </div>
    </div>
  `).join('');

  // Add click handlers
  queryList.querySelectorAll('.query-item').forEach(item => {
    item.addEventListener('click', () => {
      const queryId = item.dataset.queryId;
      openSidePanelForQuery(queryId);
    });
  });
}

// Setup event listeners
function setupEventListeners() {
  // Platform toggles
  document.querySelectorAll('.platform-toggle').forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      if (e.target.tagName !== 'INPUT') {
        const checkbox = toggle.querySelector('input');
        checkbox.checked = !checkbox.checked;
      }

      toggle.classList.toggle('active');
      savePlatformSelections();
    });
  });

  // Submit button
  document.getElementById('submit-btn').addEventListener('click', submitQuery);

  // Enter key in textarea
  document.getElementById('query-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      submitQuery();
    }
  });

  // Settings button
  document.getElementById('settings-btn').addEventListener('click', openSettings);

  // Open side panel button
  document.getElementById('open-panel-btn').addEventListener('click', () => {
    chrome.sidePanel.open();
  });
}

// Submit query
async function submitQuery() {
  const queryInput = document.getElementById('query-input');
  const prompt = queryInput.value.trim();

  if (!prompt) {
    showError('Please enter a query');
    return;
  }

  // Get selected platforms
  const platforms = getSelectedPlatforms();

  if (platforms.length === 0) {
    showError('Please select at least one platform');
    return;
  }

  // Show loading
  showLoading(true);

  try {
    // Submit to background script
    chrome.runtime.sendMessage({
      action: 'submitQuery',
      prompt,
      platforms
    }, (response) => {
      showLoading(false);

      if (response && response.success) {
        // Clear input
        queryInput.value = '';

        // Reload recent queries
        loadRecentQueries();

        // Open side panel if enabled
        if (settings.autoOpenSidePanel) {
          chrome.sidePanel.open();
        }

        // Close popup
        window.close();
      } else {
        showError(response?.error || 'Failed to submit query');
      }
    });
  } catch (error) {
    showLoading(false);
    showError(error.message);
  }
}

// Get selected platforms
function getSelectedPlatforms() {
  const platforms = [];
  document.querySelectorAll('.platform-toggle input:checked').forEach(checkbox => {
    platforms.push(checkbox.id.replace('platform-', ''));
  });
  return platforms;
}

// Save platform selections
async function savePlatformSelections() {
  const platforms = getSelectedPlatforms();
  settings.defaultPlatforms = platforms;

  await chrome.storage.local.set({ settings });
}

// Check connection status
function checkConnectionStatus() {
  chrome.runtime.sendMessage({ action: 'getConnectionStatus' }, (response) => {
    if (response) {
      updateConnectionStatus(response.status);
    }
  });
}

// Update connection status display
function updateConnectionStatus(status) {
  connectionStatus = status;

  const indicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');

  indicator.className = 'status-indicator';

  switch (status) {
    case 'connected':
      indicator.classList.add('connected');
      statusText.textContent = 'Connected';
      break;

    case 'connecting':
      indicator.classList.add('connecting');
      statusText.textContent = 'Connecting...';
      break;

    case 'disconnected':
      indicator.classList.add('disconnected');
      statusText.textContent = 'Disconnected';
      break;

    case 'error':
      indicator.classList.add('disconnected');
      statusText.textContent = 'Connection Error';
      break;
  }

  // Disable submit button if disconnected
  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = status !== 'connected';
}

// Show loading state
function showLoading(show) {
  const loading = document.getElementById('loading');
  const submitBtn = document.getElementById('submit-btn');

  if (show) {
    loading.classList.add('active');
    submitBtn.disabled = true;
  } else {
    loading.classList.remove('active');
    submitBtn.disabled = connectionStatus !== 'connected';
  }
}

// Show error message
function showError(message) {
  alert(message); // Simple alert for now
}

// Open settings
function openSettings() {
  // Create settings page or use chrome.runtime.openOptionsPage()
  alert('Settings page coming soon!');
}

// Open side panel for specific query
function openSidePanelForQuery(queryId) {
  chrome.sidePanel.open();
  // Send message to side panel to display this query
  setTimeout(() => {
    chrome.runtime.sendMessage({
      action: 'showQuery',
      queryId
    });
  }, 500);
}

// Handle messages
function handleMessage(request, sender, sendResponse) {
  switch (request.action) {
    case 'connectionStatus':
      updateConnectionStatus(request.status);
      break;

    case 'queryUpdate':
      // Reload recent queries to show updated status
      loadRecentQueries();
      break;
  }
}

// Helper functions

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  // Less than 1 minute
  if (diff < 60000) {
    return 'Just now';
  }

  // Less than 1 hour
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes}m ago`;
  }

  // Less than 24 hours
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours}h ago`;
  }

  // More than 24 hours
  const days = Math.floor(diff / 86400000);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;

  return date.toLocaleDateString();
}
