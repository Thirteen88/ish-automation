/**
 * Content Script for AI Orchestrator Extension
 *
 * Features:
 * - Text selection detection
 * - Floating action button
 * - Inline response display
 * - Quick actions
 */

let floatingButton = null;
let responsePanel = null;
let currentSelection = null;
let settings = {};

// Initialize content script
initialize();

async function initialize() {
  // Load settings
  const result = await chrome.storage.local.get(['settings']);
  settings = result.settings || {};

  // Listen for selection changes
  document.addEventListener('mouseup', handleSelection);
  document.addEventListener('keyup', handleSelection);

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener(handleMessage);

  console.log('AI Orchestrator content script initialized');
}

// Handle text selection
function handleSelection(event) {
  if (!settings.showFloatingButton) return;

  const selection = window.getSelection();
  const selectedText = selection.toString().trim();

  if (selectedText.length > 0) {
    currentSelection = selectedText;
    showFloatingButton(event);
  } else {
    hideFloatingButton();
  }
}

// Show floating action button
function showFloatingButton(event) {
  // Remove existing button
  hideFloatingButton();

  // Create button
  floatingButton = document.createElement('div');
  floatingButton.className = 'ai-orchestrator-floating-button';
  floatingButton.innerHTML = `
    <div class="ai-floating-button-main">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="10"/>
        <path d="M8 12h8"/>
        <path d="M12 8v8"/>
      </svg>
      <span>Ask AIs</span>
    </div>
    <div class="ai-floating-button-actions">
      <button class="ai-action-btn" data-action="ask-all">All AIs</button>
      <button class="ai-action-btn" data-action="summarize">Summarize</button>
      <button class="ai-action-btn" data-action="explain">Explain</button>
      <button class="ai-action-btn" data-action="translate">Translate</button>
      <button class="ai-action-btn" data-action="improve">Improve</button>
    </div>
  `;

  // Position near selection
  const range = window.getSelection().getRangeAt(0);
  const rect = range.getBoundingClientRect();

  floatingButton.style.position = 'absolute';
  floatingButton.style.top = `${window.scrollY + rect.bottom + 10}px`;
  floatingButton.style.left = `${window.scrollX + rect.left}px`;
  floatingButton.style.zIndex = '999999';

  // Add event listeners
  floatingButton.querySelectorAll('.ai-action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleQuickAction(btn.dataset.action);
    });
  });

  document.body.appendChild(floatingButton);

  // Hide on click outside
  setTimeout(() => {
    document.addEventListener('click', handleClickOutside);
  }, 100);
}

// Hide floating button
function hideFloatingButton() {
  if (floatingButton) {
    floatingButton.remove();
    floatingButton = null;
    document.removeEventListener('click', handleClickOutside);
  }
}

// Handle click outside floating button
function handleClickOutside(event) {
  if (floatingButton && !floatingButton.contains(event.target)) {
    hideFloatingButton();
  }
}

// Handle quick actions
function handleQuickAction(action) {
  if (!currentSelection) return;

  let prompt = currentSelection;
  let platforms = ['lmarena', 'claude', 'chatgpt', 'gemini'];

  switch (action) {
    case 'ask-all':
      // Use selection as-is
      break;

    case 'summarize':
      prompt = `Please provide a concise summary of the following text:\n\n${currentSelection}`;
      break;

    case 'explain':
      prompt = `Please explain the following in simple terms:\n\n${currentSelection}`;
      break;

    case 'translate':
      prompt = `Please translate the following text to English:\n\n${currentSelection}`;
      break;

    case 'improve':
      prompt = `Please improve the writing quality and clarity of the following text:\n\n${currentSelection}`;
      break;
  }

  // Submit query
  chrome.runtime.sendMessage({
    action: 'submitQuery',
    prompt,
    platforms
  });

  // Hide button
  hideFloatingButton();

  // Show loading indicator
  showLoadingIndicator();
}

// Show loading indicator
function showLoadingIndicator() {
  const indicator = document.createElement('div');
  indicator.className = 'ai-orchestrator-loading';
  indicator.innerHTML = `
    <div class="ai-loading-spinner"></div>
    <div class="ai-loading-text">Querying AI platforms...</div>
  `;

  indicator.style.position = 'fixed';
  indicator.style.bottom = '20px';
  indicator.style.right = '20px';
  indicator.style.zIndex = '999999';

  document.body.appendChild(indicator);

  // Remove after 3 seconds
  setTimeout(() => {
    indicator.remove();
  }, 3000);
}

// Show inline response panel
function showResponsePanel(query) {
  // Remove existing panel
  hideResponsePanel();

  responsePanel = document.createElement('div');
  responsePanel.className = 'ai-orchestrator-response-panel';
  responsePanel.innerHTML = `
    <div class="ai-response-header">
      <h3>AI Responses</h3>
      <button class="ai-close-btn">&times;</button>
    </div>
    <div class="ai-response-content">
      <div class="ai-response-query">
        <strong>Query:</strong> ${escapeHtml(query.prompt)}
      </div>
      <div class="ai-response-platforms" id="ai-platforms-${query.id}">
        ${query.platforms.map(platform => `
          <div class="ai-platform-response" data-platform="${platform}">
            <div class="ai-platform-header">
              <span class="ai-platform-name">${getPlatformName(platform)}</span>
              <span class="ai-platform-status">Processing...</span>
            </div>
            <div class="ai-platform-text" id="ai-response-${query.id}-${platform}">
              <div class="ai-loading-spinner"></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="ai-response-actions">
      <button class="ai-btn ai-btn-primary" id="ai-view-full">View Full Responses</button>
      <button class="ai-btn ai-btn-secondary" id="ai-copy-all">Copy All</button>
    </div>
  `;

  responsePanel.style.position = 'fixed';
  responsePanel.style.bottom = '20px';
  responsePanel.style.right = '20px';
  responsePanel.style.maxWidth = '600px';
  responsePanel.style.maxHeight = '80vh';
  responsePanel.style.zIndex = '999999';

  // Add event listeners
  responsePanel.querySelector('.ai-close-btn').addEventListener('click', hideResponsePanel);
  responsePanel.querySelector('#ai-view-full').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openSidePanel' });
  });
  responsePanel.querySelector('#ai-copy-all').addEventListener('click', () => {
    copyAllResponses(query);
  });

  document.body.appendChild(responsePanel);
}

// Hide response panel
function hideResponsePanel() {
  if (responsePanel) {
    responsePanel.remove();
    responsePanel = null;
  }
}

// Update response panel with new data
function updateResponsePanel(query) {
  if (!responsePanel) return;

  for (const [platform, response] of Object.entries(query.responses)) {
    const responseEl = document.getElementById(`ai-response-${query.id}-${platform}`);
    if (!responseEl) continue;

    if (response.status === 'complete' && response.success) {
      responseEl.innerHTML = escapeHtml(response.response.substring(0, 500)) +
        (response.response.length > 500 ? '...' : '');

      // Update status
      const statusEl = responseEl.closest('.ai-platform-response')
        .querySelector('.ai-platform-status');
      statusEl.textContent = 'Complete';
      statusEl.style.color = '#4CAF50';
    } else if (response.status === 'error') {
      responseEl.innerHTML = `<span class="ai-error">Error: ${escapeHtml(response.error)}</span>`;

      const statusEl = responseEl.closest('.ai-platform-response')
        .querySelector('.ai-platform-status');
      statusEl.textContent = 'Failed';
      statusEl.style.color = '#f44336';
    } else if (response.chunks && response.chunks.length > 0) {
      // Streaming response
      const text = response.chunks.join('');
      responseEl.innerHTML = escapeHtml(text.substring(0, 500)) +
        (text.length > 500 ? '...' : '');
    }
  }
}

// Copy all responses
function copyAllResponses(query) {
  let text = `Query: ${query.prompt}\n\n`;

  for (const [platform, response] of Object.entries(query.responses)) {
    if (response.success) {
      text += `=== ${getPlatformName(platform)} ===\n`;
      text += response.response + '\n\n';
    }
  }

  navigator.clipboard.writeText(text).then(() => {
    showNotification('Copied all responses to clipboard!');
  });
}

// Show notification
function showNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'ai-orchestrator-notification';
  notification.textContent = message;

  notification.style.position = 'fixed';
  notification.style.top = '20px';
  notification.style.right = '20px';
  notification.style.zIndex = '999999';

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// Handle messages from background script
function handleMessage(request, sender, sendResponse) {
  switch (request.action) {
    case 'getSelection':
      sendResponse({ text: window.getSelection().toString().trim() });
      break;

    case 'querySubmitted':
      // Show response panel
      chrome.runtime.sendMessage({ action: 'getActiveQueries' }, (response) => {
        const query = response.queries.find(q => q.id === request.queryId);
        if (query) {
          showResponsePanel(query);
        }
      });
      break;

    case 'queryUpdate':
      updateResponsePanel(request.query);
      break;

    default:
      break;
  }

  return true;
}

// Helper functions

function getPlatformName(platform) {
  const names = {
    'lmarena': 'LMArena',
    'claude': 'Claude',
    'chatgpt': 'ChatGPT',
    'gemini': 'Gemini',
    'poe': 'Poe'
  };
  return names[platform] || platform;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
